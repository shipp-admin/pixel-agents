import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

import { getActiveSessions, setBroadcast } from './hookHandler';
import { getLayout, saveLayout } from './layoutStore';
import type { ClientMessage, TrackedClient } from './protocol';

/** All connected WebSocket clients */
const clients: Set<TrackedClient> = new Set();

let wss: WebSocketServer;

/** Initialize the WebSocket server on top of the HTTP server */
export function initWebSocketServer(server: HttpServer, token: string): WebSocketServer {
  wss = new WebSocketServer({
    server,
    verifyClient: (info, callback) => {
      // If no token configured, allow all connections (dev mode)
      if (!token) {
        callback(true);
        return;
      }
      // Extract token from query string: ws://host:port/?token=xxx
      const url = new URL(info.req.url ?? '/', `http://${info.req.headers.host ?? 'localhost'}`);
      const clientToken = url.searchParams.get('token');
      if (clientToken === token) {
        callback(true);
      } else {
        console.log('[WS] Rejected connection: invalid or missing token');
        callback(false, 401, 'Unauthorized');
      }
    },
  });

  // Wire up the broadcast function so hookHandler can send messages
  setBroadcast(broadcastToAll);

  wss.on('connection', (ws: WebSocket) => {
    const client: TrackedClient = { ws, ready: false };
    clients.add(client);
    console.log(`[WS] Client connected (${clients.size} total)`);

    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        handleClientMessage(client, msg);
      } catch (err) {
        console.error('[WS] Failed to parse client message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(client);
      console.log(`[WS] Client disconnected (${clients.size} total)`);
    });

    ws.on('error', (err: Error) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(client);
    });
  });

  console.log('[WS] WebSocket server initialized');
  return wss;
}

/** Handle a message from a browser client */
function handleClientMessage(client: TrackedClient, msg: ClientMessage): void {
  switch (msg.type) {
    case 'wsReady': {
      console.log('[WS] Client sent wsReady, sending bootstrap sequence');
      client.ready = true;
      sendBootstrapSequence(client);
      break;
    }

    case 'saveLayout': {
      console.log('[WS] Client sent saveLayout, persisting and rebroadcasting');
      saveLayout(msg.layout);
      broadcastToAll({ type: 'layoutLoaded', layout: msg.layout });
      break;
    }

    default:
      console.warn('[WS] Unknown client message type:', (msg as Record<string, unknown>).type);
  }
}

/**
 * Send the full bootstrap sequence to a newly connected client.
 * Order matters — assets first, then layout, then agents.
 */
function sendBootstrapSequence(client: TrackedClient): void {
  const { ws } = client;
  if (ws.readyState !== WebSocket.OPEN) return;

  // 1. Settings
  sendToClient(ws, { type: 'settingsLoaded', soundEnabled: false });

  // 2. Existing agents — must arrive BEFORE layoutLoaded so pendingAgents buffer is populated
  //    when layoutLoaded drains it and spawns characters.
  const activeSessions = getActiveSessions();
  const agents: number[] = [];
  const agentMeta: Record<number, Record<string, unknown>> = {};
  const folderNames: Record<number, string> = {};

  // Only include top-level (non-worker) sessions in existingAgents
  for (const session of activeSessions) {
    if (session.parentRelayId === undefined) {
      agents.push(session.relayId);
      agentMeta[session.relayId] = {};
      folderNames[session.relayId] = session.folderName;
    }
  }

  sendToClient(ws, {
    type: 'existingAgents',
    agents,
    agentMeta,
    folderNames,
  });

  // Sub-agent creation events — also before layoutLoaded
  let subagentCount = 0;
  for (const session of activeSessions) {
    if (session.parentRelayId !== undefined) {
      sendToClient(ws, {
        type: 'agentCreatedAsSubagent',
        id: session.relayId,
        parentId: session.parentRelayId,
        sessionId: session.sessionId,
        folderName: session.folderName,
      });
      subagentCount++;
    }
  }

  // 3. Layout last — triggers pendingAgents drain and character spawning in the webview
  const layout = getLayout();
  sendToClient(ws, { type: 'layoutLoaded', layout });

  console.log(
    `[WS] Bootstrap sent: layout=${layout ? 'yes' : 'null'}, agents=${agents.length}, subagents=${subagentCount}`,
  );
}

/** Send a JSON message to a single WebSocket client */
function sendToClient(ws: WebSocket, message: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Broadcast a JSON message to all ready WebSocket clients */
function broadcastToAll(message: Record<string, unknown>): void {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.ready && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

/** Get the count of connected clients */
export function getClientCount(): number {
  return clients.size;
}
