import express from 'express';
import { createServer } from 'http';

import { handleHook } from './hookHandler';
import { loadLayout } from './layoutStore';
import type { HookPayload } from './protocol';
import { getClientCount, initWebSocketServer } from './relayServer';
import { loadSessionRegistry } from './sessionRegistry';

const PORT = parseInt(process.env.PORT || '5174', 10);
const HOST = process.env.HOST || '0.0.0.0';

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
initWebSocketServer(server);

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│         Pixel Agents Relay Server            │');
  console.log('├─────────────────────────────────────────────┤');
  console.log(`│  HTTP hooks:   http://${HOST}:${PORT}/hooks     │`);
  console.log(`│  WebSocket:    ws://${HOST}:${PORT}              │`);
  console.log(`│  Health:       http://${HOST}:${PORT}/health     │`);
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
});

// ── Graceful Shutdown ─────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
