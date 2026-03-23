import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

export function isCloudflaredInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('cloudflared', ['--version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

export function getInstallCommand(): string | null {
  if (process.platform === 'darwin') {
    return 'brew install cloudflare/cloudflare/cloudflared';
  }
  if (process.platform === 'win32') {
    return 'winget install Cloudflare.cloudflared';
  }
  return null;
}

export function installCloudflared(): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = getInstallCommand();
    if (cmd === null) {
      process.stdout.write(
        'Auto-install of cloudflared is not supported on Linux. Please install it manually.\n',
      );
      resolve(false);
      return;
    }

    const proc = spawn(cmd, [], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);

    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

export function startTunnel(port: number): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
    let buffer = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGTERM');
        reject(new Error('Timed out waiting for cloudflared tunnel URL after 30 seconds'));
      }
    }, 30_000);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited with code ${code} before providing a URL`));
      }
    });

    const stderr = proc.stderr;
    if (stderr === null) {
      resolved = true;
      clearTimeout(timeout);
      reject(new Error('cloudflared stderr stream is null'));
      return;
    }

    stderr.on('data', (chunk: Buffer) => {
      if (resolved) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const match = URL_PATTERN.exec(line);
        if (match) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ proc, url: match[0] });
          return;
        }
      }
    });
  });
}

export function killTunnel(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let dead = false;

    const onClose = (): void => {
      if (!dead) {
        dead = true;
        clearTimeout(killTimer);
        resolve();
      }
    };

    proc.once('close', onClose);

    try {
      proc.kill('SIGTERM');
    } catch {
      // Process may already be gone
    }

    const killTimer = setTimeout(() => {
      if (!dead) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process may already be gone
        }
        // Wait for close event after SIGKILL
        const finalTimer = setTimeout(() => {
          if (!dead) {
            dead = true;
            resolve();
          }
        }, 1_000);
        proc.once('close', () => {
          clearTimeout(finalTimer);
          if (!dead) {
            dead = true;
            resolve();
          }
        });
      }
    }, 3_000);
  });
}
