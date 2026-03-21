import type { WebSocket } from 'ws';

// ── Claude Code Hook Payloads ─────────────────────────────────

export interface HookPayload {
  /** The hook event type */
  event: HookEventType;
  /** Unique session identifier (UUID) */
  session_id: string;
  /** Current working directory of the Claude Code session */
  cwd: string;
  /** Tool name (present on PreToolUse, PostToolUse, PostToolUseFailure) */
  tool_name?: string;
  /** Tool use ID (present on PreToolUse, PostToolUse, PostToolUseFailure) */
  tool_use_id?: string;
  /** Tool input parameters (present on PreToolUse) */
  tool_input?: Record<string, unknown>;
  /** Stop reason (present on Stop) */
  stop_reason?: string;
  /** Parent session UUID (present on SubagentStart when Claude Code Issue #19448 has shipped) */
  parent_session_id?: string;
}

export type HookEventType =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SessionEnd'
  | 'SubagentStart'
  | 'SubagentStop';

// ── Pixel-Agents Relay → Browser Messages ─────────────────────

export interface AgentCreatedMessage {
  type: 'agentCreated';
  id: number;
  sessionId: string;
  folderName: string;
}

export interface AgentClosedMessage {
  type: 'agentClosed';
  id: number;
}

export interface AgentToolStartMessage {
  type: 'agentToolStart';
  id: number;
  toolId: string;
  status: string;
}

export interface AgentToolDoneMessage {
  type: 'agentToolDone';
  id: number;
  toolId: string;
}

export interface AgentStatusMessage {
  type: 'agentStatus';
  id: number;
  status: 'active' | 'waiting';
}

export interface AgentToolPermissionMessage {
  type: 'agentToolPermission';
  id: number;
  show: boolean;
}

export interface AgentToolsClearMessage {
  type: 'agentToolsClear';
  id: number;
}

export interface LayoutLoadedMessage {
  type: 'layoutLoaded';
  layout: unknown | null;
}

export interface ExistingAgentsMessage {
  type: 'existingAgents';
  agents: number[];
  agentMeta: Record<number, Record<string, unknown>>;
  folderNames: Record<number, string>;
}

export interface SettingsLoadedMessage {
  type: 'settingsLoaded';
  soundEnabled: boolean;
}

export interface CharacterSpritesLoadedMessage {
  type: 'characterSpritesLoaded';
  characters: null;
}

export interface FloorTilesLoadedMessage {
  type: 'floorTilesLoaded';
  sprites: null;
}

export interface WallTilesLoadedMessage {
  type: 'wallTilesLoaded';
  sets: null;
}

export interface FurnitureAssetsLoadedMessage {
  type: 'furnitureAssetsLoaded';
  catalog: null;
  sprites: null;
}

export interface AgentCreatedAsSubagentMessage {
  type: 'agentCreatedAsSubagent';
  /** Worker's relay ID */
  id: number;
  /** Queen's relay ID */
  parentId: number;
  /** Worker's session UUID */
  sessionId: string;
  folderName: string;
}

export interface SubagentToolStartMessage {
  type: 'subagentToolStart';
  /** Parent (queen) relay ID */
  id: number;
  /** Worker's relay ID as string */
  parentToolId: string;
  toolId: string;
  status: string;
}

export interface SubagentToolDoneMessage {
  type: 'subagentToolDone';
  /** Parent relay ID */
  id: number;
  /** Worker's relay ID as string */
  parentToolId: string;
  toolId: string;
}

export interface SubagentClearMessage {
  type: 'subagentClear';
  /** Parent relay ID */
  id: number;
  /** Worker's relay ID as string */
  parentToolId: string;
}

export type RelayMessage =
  | AgentCreatedMessage
  | AgentClosedMessage
  | AgentToolStartMessage
  | AgentToolDoneMessage
  | AgentStatusMessage
  | AgentToolPermissionMessage
  | AgentToolsClearMessage
  | LayoutLoadedMessage
  | ExistingAgentsMessage
  | SettingsLoadedMessage
  | CharacterSpritesLoadedMessage
  | FloorTilesLoadedMessage
  | WallTilesLoadedMessage
  | FurnitureAssetsLoadedMessage
  | AgentCreatedAsSubagentMessage
  | SubagentToolStartMessage
  | SubagentToolDoneMessage
  | SubagentClearMessage;

// ── Browser → Relay Messages ──────────────────────────────────

export interface WsReadyMessage {
  type: 'wsReady';
}

export interface SaveLayoutMessage {
  type: 'saveLayout';
  layout: unknown;
}

export type ClientMessage = WsReadyMessage | SaveLayoutMessage;

// ── Internal Session State ────────────────────────────────────

export interface SessionState {
  relayId: number;
  sessionId: string;
  folderName: string;
  cwd: string;
  /** Set of currently active tool_use_ids */
  activeToolIds: Set<string>;
  /** tool_use_id → permission timer handle */
  permissionTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Whether the session is still alive */
  alive: boolean;
  /** Relay ID of the parent (queen) session, if this is a sub-agent (worker) */
  parentRelayId?: number;
  /** Session UUID of the parent session, if this is a sub-agent */
  parentSessionId?: string;
}

// ── WebSocket Client Tracking ─────────────────────────────────

export interface TrackedClient {
  ws: WebSocket;
  ready: boolean;
}
