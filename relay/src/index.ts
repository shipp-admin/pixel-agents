import type { ChildProcess } from 'child_process';

import express from 'express';
import { createServer } from 'http';

import { writePid } from './daemon';
import { handleHook } from './hookHandler';
import { loadLayout } from './layoutStore';
import type { HookPayload } from './protocol';
import { loadRelayConfig } from './relayConfig';
import { getClientCount, initWebSocketServer } from './relayServer';
import { loadSessionRegistry } from './sessionRegistry';
import { findFreePort } from './setupHooks';
import { killTunnel, startTunnel } from './setupTunnel';
import { runWizard } from './wizard';

const PORT = parseInt(process.env.PORT || '5175', 10);
const HOST = process.env.HOST || '0.0.0.0';
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';

// Directory registration (optional — only if DIRECTORY_URL is set)
const DIRECTORY_URL = process.env.DIRECTORY_URL || '';
const DIRECTORY_TOKEN = process.env.DIRECTORY_TOKEN || '';
const RELAY_PUBLIC_URL = process.env.RELAY_PUBLIC_URL || '';
const RELAY_NAME = process.env.RELAY_NAME || 'My AgentHQ';

let tunnelProc: ChildProcess | null = null;

// ── Initialize Stores ─────────────────────────────────────────

loadSessionRegistry();
loadLayout();

// ── Express App ───────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    clients: getClientCount(),
    uptime: process.uptime(),
  });
});

// Claude Code hook endpoint
app.post('/hooks', (req, res) => {
  const body = req.body as Record<string, unknown>;

  // Claude Code sends `hook_event_name`; normalise to `event` for internal use
  if (body && body['hook_event_name'] && !body['event']) {
    body['event'] = body['hook_event_name'];
  }

  const payload = body as unknown as HookPayload;

  if (!payload || !payload.event || !payload.session_id) {
    res.status(400).json({ error: 'Invalid hook payload: missing event or session_id' });
    return;
  }

  try {
    handleHook(payload);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[HTTP] Error handling hook:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── HTTP + WebSocket Server ───────────────────────────────────

const server = createServer(app);
initWebSocketServer(server, RELAY_TOKEN);

function registerWithDirectory(relayId: string): void {
  if (!DIRECTORY_URL || !RELAY_PUBLIC_URL) return;
  void (async () => {
    try {
      const res = await fetch(`${DIRECTORY_URL}/offices/${relayId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(DIRECTORY_TOKEN ? { Authorization: `Bearer ${DIRECTORY_TOKEN}` } : {}),
        },
        body: JSON.stringify({ name: RELAY_NAME, wsUrl: RELAY_PUBLIC_URL }),
      });
      if (res.ok) {
        console.log(`[Directory] Registered as "${RELAY_NAME}" (${relayId})`);
      } else {
        console.warn(`[Directory] Registration failed: ${res.status.toString()}`);
      }
    } catch (err) {
      console.warn('[Directory] Registration error:', err);
    }
  })();
}

function deregisterFromDirectory(relayId: string): void {
  if (!DIRECTORY_URL || !RELAY_PUBLIC_URL) return;
  void (async () => {
    try {
      await fetch(`${DIRECTORY_URL}/offices/${relayId}`, {
        method: 'DELETE',
        headers: DIRECTORY_TOKEN ? { Authorization: `Bearer ${DIRECTORY_TOKEN}` } : {},
      });
      console.log('[Directory] Deregistered');
    } catch {
      // Best-effort on shutdown
    }
  })();
}

function printBanner(port: number, tunnelUrl: string | null, relayId: string): void {
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│           Shipp Agent HQ  🏢                  │');
  console.log('├─────────────────────────────────────────────┤');
  console.log(`│  Relay running on port ${port}                  │`);
  console.log('├─────────────────────────────────────────────┤');
  if (tunnelUrl) {
    const wsUrl = tunnelUrl.replace('https://', 'wss://');
    console.log('│  Your stable share URL (bookmark this):      │');
    console.log('│  https://pixel-agents-liard.vercel.app       │');
    console.log(`│    ?office=${relayId}                         │`);
    console.log('│                                              │');
    console.log('│  Or connect directly (changes on restart):   │');
    console.log(`│    ?ws=${wsUrl}  │`);
  } else {
    console.log('│  Your stable share URL (bookmark this):      │');
    console.log('│  https://pixel-agents-liard.vercel.app       │');
    console.log(`│    ?office=${relayId}                         │`);
    console.log('│                                              │');
    console.log('│  Direct WebSocket (changes on restart):      │');
    console.log(`│    ?ws=ws://localhost:${port}                    │`);
  }
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
}

async function startServer(
  resolvedPort: number,
  mode: 'local' | 'tunnel',
  relayId: string,
): Promise<void> {
  // Start the HTTP server
  await new Promise<void>((resolve) => server.listen(resolvedPort, HOST, resolve));

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[Server] Unexpected error:', err.message);
    process.exit(1);
  });

  if (mode === 'tunnel') {
    console.log('  Starting cloudflared tunnel...');
    console.log('  Waiting for tunnel URL (this takes a few seconds)...');
    console.log('');
    try {
      const { proc, url } = await startTunnel(resolvedPort);
      tunnelProc = proc;

      // Handle tunnel crash after startup
      proc.on('close', (code) => {
        if (tunnelProc === proc) {
          tunnelProc = null;
          console.log('');
          console.log(`  [Tunnel] cloudflared exited unexpectedly (code ${code ?? 'unknown'}).`);
          console.log(`  The relay is still running locally on port ${resolvedPort}.`);
          console.log('  To resume sharing, restart with Ctrl+C then run again.');
          console.log('');
        }
      });

      printBanner(resolvedPort, url, relayId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  [Tunnel] Failed to start: ${message}`);
      console.log('  Starting in local-only mode.');
      console.log('');
      printBanner(resolvedPort, null, relayId);
    }
  } else {
    printBanner(resolvedPort, null, relayId);
  }

  registerWithDirectory(relayId);
}

// ── Full start (wizard + server) — used for direct/legacy runs ──

async function start(): Promise<void> {
  const { resolvedPort, mode, relayId } = await runWizard(PORT);
  await startServer(resolvedPort, mode, relayId);
}

// ── Daemon child start (skip wizard, load saved config) ──

async function startDaemonChild(): Promise<void> {
  const resolvedPort = await findFreePort(PORT);
  const config = loadRelayConfig(resolvedPort);
  const relayId = process.env.RELAY_ID || config.relayId;

  // Write our own PID
  writePid(process.pid);

  // Daemon child defaults to local mode (tunnel can be added later)
  const mode: 'local' | 'tunnel' = 'local';
  await startServer(resolvedPort, mode, relayId);
}

// ── Entry point dispatch ──

if (process.env.SHIPP_DAEMON_CHILD === '1') {
  // Daemon child: skip wizard, load saved config, start server directly
  void startDaemonChild();
} else {
  // Direct run (npx without subcommands, legacy): run full wizard + server
  void start();
}

export { start, startDaemonChild };

// ── Graceful Shutdown ─────────────────────────────────────────

let activeRelayId = '';

// Capture relayId for shutdown — set after start completes
void (async () => {
  // Wait a tick for start() to begin
  await new Promise((r) => setTimeout(r, 0));
  try {
    const config = loadRelayConfig(PORT);
    activeRelayId = process.env.RELAY_ID || config.relayId;
  } catch {
    // Best effort
  }
})();

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
  if (tunnelProc) {
    await killTunnel(tunnelProc);
    tunnelProc = null;
  }
  deregisterFromDirectory(activeRelayId);
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[Server] Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
