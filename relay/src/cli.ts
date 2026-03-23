import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  getRunningPid,
  isRunning,
  showStatus,
  spawnDaemon,
  stopDaemon,
  tailLogs,
  writePid,
} from './daemon';
import { runWizard } from './wizard';

const CONFIG_PATH = path.join(os.homedir(), '.pixel-agents', 'relay-config.json');

function readSavedPort(): number {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as { port?: number };
    return config.port ?? 5175;
  } catch {
    return 5175;
  }
}

async function startCmd(): Promise<void> {
  if (isRunning()) {
    const port = readSavedPort();
    const pid = getRunningPid();
    console.log('');
    console.log(`  AgentHQ is already running on port ${port} (PID ${pid ?? 'unknown'}).`);
    console.log("  Run 'npx shipp-agent-hq status' to check it.");
    console.log("  Run 'npx shipp-agent-hq restart' to restart it.");
    console.log('');
    process.exit(0);
  }

  // Run the wizard + setup inline in this (interactive) process
  const preferredPort = parseInt(process.env.PORT || '5175', 10);
  await runWizard(preferredPort);

  // Now spawn the daemon
  console.log('');
  console.log('  Starting AgentHQ in background...');
  const pid = spawnDaemon();
  writePid(pid);

  // Wait 1s and verify daemon started
  await new Promise((r) => setTimeout(r, 1000));
  if (!isRunning()) {
    console.log('  Failed to start. Check logs: npx shipp-agent-hq logs');
    process.exit(1);
  }

  const port = readSavedPort();
  console.log(`  AgentHQ started (PID ${pid}) on port ${port}.`);
  console.log('');
  console.log('  Commands:');
  console.log('    npx shipp-agent-hq status   — check if running');
  console.log('    npx shipp-agent-hq logs     — view relay logs');
  console.log('    npx shipp-agent-hq stop     — stop the relay');
  console.log('');
  process.exit(0);
}

export async function runCli(): Promise<void> {
  const cmd = process.argv[2] ?? 'start';

  if (cmd === 'stop') {
    await stopDaemon();
    process.exit(0);
  }

  if (cmd === 'status') {
    const port = readSavedPort();
    await showStatus(port);
    process.exit(0);
  }

  if (cmd === 'logs') {
    const follow = !process.argv.includes('--no-follow');
    const linesIdx = process.argv.indexOf('--lines');
    const lines = linesIdx !== -1 ? parseInt(process.argv[linesIdx + 1] ?? '50', 10) : 50;
    tailLogs(follow, lines);
    if (!follow) process.exit(0);
    // Otherwise stay alive following the file
    return;
  }

  if (cmd === 'restart') {
    await stopDaemon();
    await startCmd();
    return;
  }

  // Default: start
  await startCmd();
}
