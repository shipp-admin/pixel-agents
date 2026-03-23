import express from 'express';
import { createServer } from 'http';

import { handleHook } from './hookHandler';
import { loadLayout } from './layoutStore';
import type { HookPayload } from './protocol';
import { getClientCount, initWebSocketServer } from './relayServer';
import { loadSessionRegistry } from './sessionRegistry';
import { checkAndInstallHooks } from './setupHooks';

const PORT = parseInt(process.env.PORT || '5175', 10);
const HOST = process.env.HOST || '0.0.0.0';
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';

// Directory registration (optional — only if DIRECTORY_URL is set)
const DIRECTORY_URL = process.env.DIRECTORY_URL || '';
const DIRECTORY_TOKEN = process.env.DIRECTORY_TOKEN || '';
const RELAY_PUBLIC_URL = process.env.RELAY_PUBLIC_URL || '';
const RELAY_NAME = process.env.RELAY_NAME || 'My AgentHQ';
const RELAY_ID = process.env.RELAY_ID || `relay-${Date.now().toString(36)}`;

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

async function registerWithDirectory(): Promise<void> {
  if (!DIRECTORY_URL || !RELAY_PUBLIC_URL) return;
  try {
    const res = await fetch(`${DIRECTORY_URL}/offices/${RELAY_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(DIRECTORY_TOKEN ? { Authorization: `Bearer ${DIRECTORY_TOKEN}` } : {}),
      },
      body: JSON.stringify({ name: RELAY_NAME, wsUrl: RELAY_PUBLIC_URL }),
    });
    if (res.ok) {
      console.log(`[Directory] Registered as "${RELAY_NAME}" (${RELAY_ID})`);
    } else {
      console.warn(`[Directory] Registration failed: ${res.status.toString()}`);
    }
  } catch (err) {
    console.warn('[Directory] Registration error:', err);
  }
}

async function deregisterFromDirectory(): Promise<void> {
  if (!DIRECTORY_URL || !RELAY_PUBLIC_URL) return;
  try {
    await fetch(`${DIRECTORY_URL}/offices/${RELAY_ID}`, {
      method: 'DELETE',
      headers: DIRECTORY_TOKEN ? { Authorization: `Bearer ${DIRECTORY_TOKEN}` } : {},
    });
    console.log('[Directory] Deregistered');
  } catch {
    // Best-effort on shutdown
  }
}

void checkAndInstallHooks(PORT).then(() => {
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('┌─────────────────────────────────────────────┐');
    console.log('│           Shipp Agent HQ  🏢                  │');
    console.log('├─────────────────────────────────────────────┤');
    console.log(`│  Relay running on port ${PORT}                  │`);
    console.log('├─────────────────────────────────────────────┤');
    console.log('│  Open the office:                            │');
    console.log('│  https://pixel-agents-liard.vercel.app       │');
    console.log('│                                              │');
    console.log('│  Connect locally:                            │');
    console.log(`│  ?ws=ws://localhost:${PORT}                     │`);
    console.log('│                                              │');
    console.log('│  (Optional) Share with your team:            │');
    console.log('│  cloudflared tunnel --url http://localhost:' + PORT + ' │');
    console.log('└─────────────────────────────────────────────┘');
    console.log('');
    void registerWithDirectory();
  });
});

// ── Graceful Shutdown ─────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
  await deregisterFromDirectory();
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
