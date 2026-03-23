import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

import express from 'express';
import { createServer } from 'http';

import { handleHook } from './hookHandler';
import { loadLayout } from './layoutStore';
import type { HookPayload } from './protocol';
import { getClientCount, initWebSocketServer } from './relayServer';
import { loadSessionRegistry } from './sessionRegistry';
import { askNumber, checkAndInstallHooks, findFreePort, updateHooksPort } from './setupHooks';
import {
  getInstallCommand,
  installCloudflared,
  isCloudflaredInstalled,
  killTunnel,
  startTunnel,
} from './setupTunnel';

const PORT = parseInt(process.env.PORT || '5175', 10);
const HOST = process.env.HOST || '0.0.0.0';
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';

// Directory registration (optional — only if DIRECTORY_URL is set)
const DIRECTORY_URL = process.env.DIRECTORY_URL || '';
const DIRECTORY_TOKEN = process.env.DIRECTORY_TOKEN || '';
const RELAY_PUBLIC_URL = process.env.RELAY_PUBLIC_URL || '';
const RELAY_NAME = process.env.RELAY_NAME || 'My AgentHQ';
const RELAY_ID = process.env.RELAY_ID || `relay-${Date.now().toString(36)}`;

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

async function askConnectionMode(port: number): Promise<'local' | 'tunnel'> {
  // Skip prompt in non-interactive environments
  if (!process.stdin.isTTY) return 'local';

  console.log('  How do you want to connect?\n');
  console.log('    1. Local only     — open the office on this machine');
  console.log('    2. Share with team — expose via a public URL (uses cloudflared)');
  console.log('');

  const choice = await askNumber('  Enter 1 or 2 (default: 1): ', 1, 2, 1);
  if (choice === 1) return 'local';

  // User chose tunnel — check/install cloudflared
  const installed = await isCloudflaredInstalled();
  if (!installed) {
    console.log('');
    console.log('  cloudflared is not installed.');
    console.log('');
    console.log('  cloudflared is a free Cloudflare tool that creates a secure');
    console.log('  public URL pointing to your local relay — no account needed.');
    console.log('');

    const installCmd = getInstallCommand();
    if (installCmd) {
      console.log(`  Install command: ${installCmd}`);
    } else {
      console.log('  Visit: https://developers.cloudflare.com/cloudflared/install');
    }
    console.log('');
    console.log('    1. Install automatically');
    console.log('    2. Open install instructions in browser');
    console.log('    3. Skip — run local only');
    console.log('');

    const installChoice = await askNumber('  Enter 1, 2, or 3 (default: 1): ', 1, 3, 1);

    if (installChoice === 2) {
      const url = 'https://developers.cloudflare.com/cloudflared/install';
      const openCmd =
        process.platform === 'win32'
          ? 'start'
          : process.platform === 'darwin'
            ? 'open'
            : 'xdg-open';
      spawn(openCmd, [url], { detached: true, stdio: 'ignore' }).unref();
      console.log('');
      console.log('  Opening install instructions in your browser...');
      console.log('  Starting in local-only mode for now.');
      console.log('');
      return 'local';
    }

    if (installChoice === 3) {
      console.log('');
      console.log('  Starting in local-only mode.');
      console.log('');
      return 'local';
    }

    // installChoice === 1: auto-install
    console.log('');
    console.log('  Installing cloudflared...');
    console.log('');
    const success = await installCloudflared();
    if (!success) {
      console.log('');
      console.log('  Installation failed. Starting in local-only mode.');
      console.log(
        '  Visit https://developers.cloudflare.com/cloudflared/install to install manually.',
      );
      console.log('');
      return 'local';
    }
    console.log('');
    console.log('  ✓ cloudflared installed.');
    console.log('');
  }

  return 'tunnel';
}

function printBanner(port: number, tunnelUrl: string | null): void {
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│           Shipp Agent HQ  🏢                  │');
  console.log('├─────────────────────────────────────────────┤');
  console.log(`│  Relay running on port ${port}                  │`);
  console.log('├─────────────────────────────────────────────┤');
  if (tunnelUrl) {
    const wsUrl = tunnelUrl.replace('https://', 'wss://');
    console.log('│  Share this URL with your team:              │');
    console.log(`│  https://pixel-agents-liard.vercel.app       │`);
    console.log(`│    ?ws=${wsUrl}  │`);
    console.log('│                                              │');
    console.log('│  Or connect locally:                         │');
    console.log(`│    ?ws=ws://localhost:${port}                    │`);
  } else {
    console.log('│  Open the office:                            │');
    console.log('│  https://pixel-agents-liard.vercel.app       │');
    console.log('│                                              │');
    console.log('│  Connect locally:                            │');
    console.log(`│    ?ws=ws://localhost:${port}                    │`);
    console.log('│                                              │');
    console.log('│  (Optional) Share with your team:            │');
    console.log(`│  cloudflared tunnel --url http://localhost:${port}│`);
  }
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
}

async function start(): Promise<void> {
  const resolvedPort = await findFreePort(PORT);
  if (resolvedPort !== PORT) {
    console.log(`  Port ${PORT} is in use — starting on port ${resolvedPort} instead.`);
    updateHooksPort(PORT, resolvedPort);
    console.log(`  Updated ~/.claude/settings.json hooks to port ${resolvedPort}.`);
    console.log('');
  }

  await checkAndInstallHooks(resolvedPort);

  const mode = await askConnectionMode(resolvedPort);

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

      printBanner(resolvedPort, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  [Tunnel] Failed to start: ${message}`);
      console.log('  Starting in local-only mode.');
      console.log('');
      printBanner(resolvedPort, null);
    }
  } else {
    printBanner(resolvedPort, null);
  }

  void registerWithDirectory();
}

void start();

// ── Graceful Shutdown ─────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
  if (tunnelProc) {
    await killTunnel(tunnelProc);
    tunnelProc = null;
  }
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
