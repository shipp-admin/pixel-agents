import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PID_FILE = path.join(os.homedir(), '.pixel-agents', 'relay.pid');
const LOG_FILE = path.join(os.homedir(), '.pixel-agents', 'relay.log');
const BIN_PATH = path.resolve(__dirname, '..', 'bin', 'agenthq.js');

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EPERM') return true;
    return false;
  }
}

function readPid(): number | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function writePid(pid: number): void {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
}

export function isRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;
  if (isAlive(pid)) return true;
  // Stale PID — clean up
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
  return false;
}

export function getRunningPid(): number | null {
  const pid = readPid();
  if (!pid) return null;
  if (isAlive(pid)) return pid;
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
  return null;
}

export function spawnDaemon(): number {
  // Rotate log if > 5MB
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    }
  } catch {
    // ignore
  }

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [BIN_PATH], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, SHIPP_DAEMON_CHILD: '1' },
  });
  fs.closeSync(logFd);
  child.unref();
  return child.pid!;
}

export async function stopDaemon(): Promise<void> {
  const pid = getRunningPid();
  if (!pid) {
    console.log('  AgentHQ is not running.');
    return;
  }

  if (process.platform === 'win32') {
    const { execSync } = await import('child_process');
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } catch {
      // ignore
    }
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }

  // Wait up to 5s for process to die
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!isAlive(pid)) break;
  }

  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
  console.log('  AgentHQ stopped.');
}

export async function showStatus(port: number): Promise<void> {
  const pid = getRunningPid();
  if (!pid) {
    console.log('  Status: stopped');
    return;
  }
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    const data = (await res.json()) as { uptime: number; clients: number };
    const uptime = Math.floor(data.uptime);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    console.log('  Status: running');
    console.log(`  PID:    ${pid}`);
    console.log(`  Port:   ${port}`);
    console.log(`  Uptime: ${uptimeStr}`);
    console.log(`  Clients connected: ${data.clients}`);
  } catch {
    console.log(`  Status: running (PID ${pid}) — relay not yet reachable on port ${port}`);
  }
}

export function tailLogs(follow: boolean, lines = 50): void {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('  No log file found. Start AgentHQ first.');
    return;
  }

  if (!follow) {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n');
    const tail = allLines.slice(Math.max(0, allLines.length - lines - 1));
    console.log(tail.join('\n'));
    return;
  }

  // Print existing content first
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  process.stdout.write(content);

  // Follow new content
  let offset = fs.statSync(LOG_FILE).size;
  fs.watch(LOG_FILE, () => {
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size < offset) offset = 0; // rotated
      if (stat.size === offset) return;
      const buf = Buffer.alloc(stat.size - offset);
      const fd = fs.openSync(LOG_FILE, 'r');
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = stat.size;
      process.stdout.write(buf);
    } catch {
      // ignore
    }
  });
}
