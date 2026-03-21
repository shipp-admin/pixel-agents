import { isBrowserRuntime } from './runtime';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

type MessageHandler = (e: MessageEvent) => void;

const WS_URL: string | undefined =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  (typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('ws') ?? undefined)
    : undefined);

/**
 * True when running in browser mode with a WebSocket relay URL configured.
 * Used to skip browserMock dispatches when the relay handles bootstrap.
 */
export const isWsMode = isBrowserRuntime && !!WS_URL;

// ── WebSocket singleton (browser + VITE_WS_URL only) ─────────────────────────

let ws: WebSocket | null = null;
const wsHandlers: Set<MessageHandler> = new Set();

function initWs(): void {
  if (!WS_URL) return;
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    console.log('[WS] Connected to relay:', WS_URL);
    ws!.send(JSON.stringify({ type: 'wsReady' }));
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    let data: unknown;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      console.warn('[WS] Failed to parse message:', event.data);
      return;
    }
    // Create a synthetic MessageEvent matching the shape handlers expect
    const synthetic = new MessageEvent('message', { data });
    for (const handler of wsHandlers) {
      handler(synthetic);
    }
  });

  ws.addEventListener('close', () => {
    console.log('[WS] Disconnected from relay');
  });

  ws.addEventListener('error', (err) => {
    console.error('[WS] Error:', err);
  });
}

// Eagerly connect if in WS mode
if (isWsMode) {
  initWs();
}

/**
 * Inject a message directly into all registered handlers.
 * Used by browserMock to dispatch asset messages in both mock and WS modes,
 * since WS mode handlers are on wsHandlers (not window).
 */
export function dispatchToHandlers(data: unknown): void {
  if (isWsMode) {
    const synthetic = new MessageEvent('message', { data });
    for (const handler of wsHandlers) {
      handler(synthetic);
    }
  } else {
    window.dispatchEvent(new MessageEvent('message', { data }));
  }
}

// ── Unified interface ─────────────────────────────────────────────────────────

interface VscodeApi {
  postMessage(msg: unknown): void;
  onMessage(handler: MessageHandler): () => void;
}

function buildVscodeApi(): VscodeApi {
  if (!isBrowserRuntime) {
    // VS Code extension mode — unchanged behaviour
    const api = acquireVsCodeApi() as { postMessage(msg: unknown): void };
    return {
      postMessage: (msg: unknown) => api.postMessage(msg),
      onMessage: (handler: MessageHandler) => {
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
      },
    };
  }

  if (isWsMode) {
    // Browser + WebSocket relay mode
    return {
      postMessage: (msg: unknown) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        } else {
          console.log('[WS] Not connected, dropping message:', msg);
        }
      },
      onMessage: (handler: MessageHandler) => {
        const wasEmpty = wsHandlers.size === 0;
        wsHandlers.add(handler);
        // If the WS already connected and sent wsReady before this handler
        // was registered (race condition), re-send wsReady to get a fresh bootstrap.
        if (wasEmpty && ws && ws.readyState === WebSocket.OPEN) {
          console.log('[WS] Re-sending wsReady — handler registered after initial connect');
          ws.send(JSON.stringify({ type: 'wsReady' }));
        }
        return () => {
          wsHandlers.delete(handler);
        };
      },
    };
  }

  // Browser mock mode (no WS) — existing behaviour
  return {
    postMessage: (msg: unknown) => console.log('[vscode.postMessage]', msg),
    onMessage: (handler: MessageHandler) => {
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    },
  };
}

export const vscode: VscodeApi = buildVscodeApi();
