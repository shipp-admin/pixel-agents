import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd'];
const PORT_SCAN_LIMIT = 10;

// ── Port resolution ───────────────────────────────────────────

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

export async function findFreePort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + PORT_SCAN_LIMIT; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    `No free port found between ${preferredPort} and ${preferredPort + PORT_SCAN_LIMIT - 1}`,
  );
}

export function updateHooksPort(oldPort: number, newPort: number): void {
  const filePath = settingsPath();
  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(filePath)) {
      settings = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    }
  } catch {
    return;
  }

  const oldUrl = `http://localhost:${oldPort}/hooks`;
  const newUrl = `http://localhost:${newPort}/hooks`;
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown[]>;
  let changed = false;

  for (const event of HOOK_EVENTS) {
    const eventHooks = hooks[event] as Array<{ hooks?: Array<{ url?: string }> }> | undefined;
    if (!Array.isArray(eventHooks)) continue;
    for (const group of eventHooks) {
      if (!Array.isArray(group.hooks)) continue;
      for (const h of group.hooks) {
        if (h.url === oldUrl) {
          h.url = newUrl;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    settings['hooks'] = hooks;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
}

function settingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function hasHook(settings: Record<string, unknown>, event: string, url: string): boolean {
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown[]>;
  const eventHooks = hooks[event] as Array<{ hooks?: Array<{ url?: string }> }> | undefined;
  if (!Array.isArray(eventHooks)) return false;
  return eventHooks.some(
    (group) => Array.isArray(group.hooks) && group.hooks.some((h) => h.url === url),
  );
}

export function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => {
      rl.close();
      process.exit(0);
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function askNumber(
  question: string,
  min: number,
  max: number,
  defaultVal: number,
): Promise<number> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => {
      rl.close();
      process.exit(0);
    });

    const prompt = (): void => {
      rl.question(question, (answer) => {
        const trimmed = answer.trim();
        if (trimmed === '') {
          rl.close();
          resolve(defaultVal);
          return;
        }
        const num = Number(trimmed);
        if (!Number.isNaN(num) && num >= min && num <= max) {
          rl.close();
          resolve(num);
          return;
        }
        process.stdout.write(`  Please enter a number between ${min} and ${max}.\n`);
        prompt();
      });
    };

    prompt();
  });
}

export async function checkAndInstallHooks(port: number): Promise<void> {
  const hookUrl = `http://localhost:${port}/hooks`;
  const filePath = settingsPath();

  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(filePath)) {
      settings = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    }
  } catch {
    // Corrupt or missing — start with empty object
  }

  const missing = HOOK_EVENTS.filter((e) => !hasHook(settings, e, hookUrl));
  if (missing.length === 0) return;

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │         Claude Code hooks not detected        │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
  console.log('  How it works:');
  console.log('');
  console.log('  Claude Code fires "hooks" on every action it takes —');
  console.log('  tool calls (file reads, edits, bash commands), session');
  console.log('  start, session end, and more.');
  console.log('');
  console.log('  Shipp Agent HQ hooks into these events over a local');
  console.log('  HTTP connection to animate your agents in real-time');
  console.log('  in the pixel office. No data leaves your machine.');
  console.log('');
  console.log('  What this will change:');
  console.log(`  • File:   ${filePath}`);
  console.log(`  • Adds:   HTTP POST → http://localhost:${port}/hooks`);
  console.log('  • Events: SessionStart, PreToolUse, PostToolUse,');
  console.log('            Stop, SessionEnd');
  console.log('');

  const answer = await ask('  Add hooks to ~/.claude/settings.json? (Y/n) ');
  if (answer.toLowerCase() === 'n') {
    console.log('');
    console.log('  Skipped. Run `npx shipp-agent-hq` again any time to add them.');
    console.log('');
    return;
  }

  // Merge hooks into existing settings
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown[]>;
  const hookEntry = { hooks: [{ type: 'http', url: hookUrl, timeout: 5 }] };

  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(hooks[event])) hooks[event] = [];
    const existing = hooks[event] as Array<{ hooks?: Array<{ url?: string }> }>;
    const alreadyHas = existing.some(
      (g) => Array.isArray(g.hooks) && g.hooks.some((h) => h.url === hookUrl),
    );
    if (!alreadyHas) existing.push(hookEntry);
  }

  settings['hooks'] = hooks;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('  ✓ Hooks added to ~/.claude/settings.json');
  console.log('  Restart any active Claude Code sessions for hooks to take effect.');
  console.log('');
}
