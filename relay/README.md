# AgentHQ

Watch your AI agents work in real-time — a live pixel-art office visualizer for Claude Code sessions.

## Quick Start

```bash
npx agenthq
```

Then follow the 3 steps printed in your terminal.

## How it works

AgentHQ runs a local relay server that receives Claude Code hook events and streams them to a shared pixel-art office in your browser. Each Claude session becomes a character that walks around, sits at a desk, and animates based on what it's doing.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5175` | Port for the relay server |
| `RELAY_TOKEN` | *(none)* | Auth token for WebSocket connections (recommended for public use) |
| `RELAY_NAME` | `My AgentHQ` | Display name shown in the directory |
| `RELAY_PUBLIC_URL` | *(none)* | Your public tunnel URL (for directory registration) |

## Usage with token auth

```bash
RELAY_TOKEN=mysecret npx agenthq
```

Then connect with: `https://agenthq.vercel.app/?ws=wss://your-tunnel.trycloudflare.com?token=mysecret`

## License

MIT — based on [pixel-agents](https://github.com/pablodelucca/pixel-agents)
