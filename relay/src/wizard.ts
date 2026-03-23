import { spawn } from 'child_process';

import { loadRelayConfig } from './relayConfig';
import { askNumber, checkAndInstallHooks, findFreePort, updateHooksPort } from './setupHooks';
import { getInstallCommand, installCloudflared, isCloudflaredInstalled } from './setupTunnel';

interface WizardResult {
  resolvedPort: number;
  mode: 'local' | 'tunnel';
  relayId: string;
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

export async function runWizard(preferredPort: number): Promise<WizardResult> {
  const resolvedPort = await findFreePort(preferredPort);
  if (resolvedPort !== preferredPort) {
    console.log(`  Port ${preferredPort} is in use — starting on port ${resolvedPort} instead.`);
    updateHooksPort(preferredPort, resolvedPort);
    console.log(`  Updated ~/.claude/settings.json hooks to port ${resolvedPort}.`);
    console.log('');
  }

  await checkAndInstallHooks(resolvedPort);

  // Load/create stable relay ID (env var override supported)
  const config = loadRelayConfig(resolvedPort);
  const relayId = process.env.RELAY_ID || config.relayId;

  const mode = await askConnectionMode(resolvedPort);

  return { resolvedPort, mode, relayId };
}
