import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.pixel-agents', 'relay-config.json');

interface RelayConfig {
  relayId: string;
  port: number;
}

function generateRelayId(): string {
  return 'relay-' + crypto.randomBytes(4).toString('hex');
}

export function loadRelayConfig(resolvedPort: number): RelayConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<RelayConfig>;
      if (saved.relayId) {
        // Update port in case it changed
        const config: RelayConfig = { relayId: saved.relayId, port: resolvedPort };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
        return config;
      }
    }
  } catch {
    // Fall through to generate new config
  }

  const config: RelayConfig = { relayId: generateRelayId(), port: resolvedPort };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config;
}
