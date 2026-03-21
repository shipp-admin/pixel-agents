import * as path from 'path';

import type { HookPayload, SessionState } from './protocol';
import { getOrCreateRelayId, getSessionRecord, setParentSession } from './sessionRegistry';

/** Maximum command length for display in status strings */
const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
/** Maximum task description length for display */
const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;
/** How long to wait (ms) before emitting agentToolPermission */
const PERMISSION_TIMER_DELAY_MS = 7000;
/** Delay (ms) before emitting agentToolDone (prevents flicker) */
const TOOL_DONE_DELAY_MS = 300;

/** Tools that should not trigger permission timers */
const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'Agent', 'AskUserQuestion']);

/** Active sessions: session_id → SessionState */
const sessions = new Map<string, SessionState>();

/**
 * Tracks Task/Agent PreToolUse events so SubagentStart can find the parent
 * when parent_session_id is not yet supplied by Claude Code.
 * Keyed by parent session_id; value contains the Task tool_use_id and timestamp.
 */
const pendingTaskSessions = new Map<string, { taskToolUseId: string; timestamp: number }>();

/** How long (ms) a pendingTaskSessions entry is considered valid for timing heuristic */
const PENDING_TASK_TTL_MS = 30_000;

type BroadcastFn = (message: Record<string, unknown>) => void;

let broadcast: BroadcastFn = () => {};

/** Set the broadcast function (called by relayServer on startup) */
export function setBroadcast(fn: BroadcastFn): void {
  broadcast = fn;
}

/**
 * Format a tool status string that matches what toolUtils.ts STATUS_TO_TOOL expects.
 *
 * STATUS_TO_TOOL mapping:
 *   Reading  → Read
 *   Searching → Grep (also used for Glob: "Searching files")
 *   Fetching → WebFetch
 *   Searching web → WebSearch
 *   Writing  → Write
 *   Editing  → Edit
 *   Running  → Bash
 *   Task     → Task (prefix for "Subtask:")
 */
function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown): string => (typeof p === 'string' ? path.basename(p) : '');

  switch (toolName) {
    case 'Read':
      return `Reading ${base(input.file_path)}`;
    case 'Edit':
      return `Editing ${base(input.file_path)}`;
    case 'Write':
      return `Writing ${base(input.file_path)}`;
    case 'MultiEdit':
      return `Editing ${base(input.file_path)}`;
    case 'Bash': {
      const cmd = (input.command as string) || '';
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
    }
    case 'Glob':
      return 'Searching files';
    case 'Grep':
      return 'Searching code';
    case 'WebFetch':
      return 'Fetching web content';
    case 'WebSearch':
      return 'Searching the web';
    case 'Task':
    case 'Agent': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '\u2026' : desc}`
        : 'Running subtask';
    }
    case 'AskUserQuestion':
      return 'Waiting for your answer';
    case 'EnterPlanMode':
      return 'Planning';
    case 'NotebookEdit':
      return 'Editing notebook';
    default:
      return `Using ${toolName}`;
  }
}

/** Derive a human-readable folder name from the cwd path */
function deriveFolderName(cwd: string): string {
  return path.basename(cwd) || 'unknown';
}

/** Get or create a session, registering it in the session registry */
function ensureSession(payload: HookPayload): { session: SessionState; created: boolean } {
  const existing = sessions.get(payload.session_id);
  if (existing) return { session: existing, created: false };

  const payloadFolderName = deriveFolderName(payload.cwd);
  const { relayId } = getOrCreateRelayId(payload.session_id, payloadFolderName, payload.cwd);
  // Prefer the registry's stored folderName — it may have been manually corrected
  // or set by a SessionStart that ran from the true project root.
  const storedRecord = getSessionRecord(payload.session_id);
  const folderName = storedRecord?.folderName ?? payloadFolderName;

  const session: SessionState = {
    relayId,
    sessionId: payload.session_id,
    folderName,
    cwd: storedRecord?.cwd ?? payload.cwd,
    activeToolIds: new Set(),
    permissionTimers: new Map(),
    alive: true,
  };
  sessions.set(payload.session_id, session);
  return { session, created: true };
}

/** Start a permission timer for a specific tool_use_id */
function startPermissionTimer(session: SessionState, toolUseId: string): void {
  // Clear any existing timer for this tool
  cancelPermissionTimer(session, toolUseId);

  const timer = setTimeout(() => {
    session.permissionTimers.delete(toolUseId);
    // Only emit if the tool is still active
    if (session.activeToolIds.has(toolUseId)) {
      console.log(
        `[Hook] Permission timer fired for session ${session.sessionId}, tool ${toolUseId}`,
      );
      broadcast({
        type: 'agentToolPermission',
        id: session.relayId,
        show: true,
      });
    }
  }, PERMISSION_TIMER_DELAY_MS);

  session.permissionTimers.set(toolUseId, timer);
}

/** Cancel a permission timer for a specific tool_use_id */
function cancelPermissionTimer(session: SessionState, toolUseId: string): void {
  const timer = session.permissionTimers.get(toolUseId);
  if (timer) {
    clearTimeout(timer);
    session.permissionTimers.delete(toolUseId);
  }
}

/** Cancel all permission timers for a session */
function cancelAllPermissionTimers(session: SessionState): void {
  for (const timer of session.permissionTimers.values()) {
    clearTimeout(timer);
  }
  session.permissionTimers.clear();
}

/** Clear all active tools for a session and emit agentToolsClear */
function clearAllTools(session: SessionState): void {
  cancelAllPermissionTimers(session);
  if (session.activeToolIds.size > 0) {
    session.activeToolIds.clear();
    broadcast({ type: 'agentToolsClear', id: session.relayId });
  }
}

/**
 * Handle an incoming Claude Code hook POST.
 * Translates the hook payload into pixel-agents protocol messages and broadcasts them.
 */
export function handleHook(payload: HookPayload): void {
  const { event, session_id } = payload;

  switch (event) {
    case 'SessionStart': {
      const { session } = ensureSession(payload);
      console.log(
        `[Hook] SessionStart: ${session_id} → relay ID ${session.relayId} (${session.folderName})`,
      );
      broadcast({
        type: 'agentCreated',
        id: session.relayId,
        sessionId: session.sessionId,
        folderName: session.folderName,
      });
      break;
    }

    case 'PreToolUse': {
      const { session, created } = ensureSession(payload);
      const toolName = payload.tool_name || 'unknown';
      const toolUseId = payload.tool_use_id;
      if (!toolUseId) {
        console.warn(`[Hook] PreToolUse without tool_use_id for session ${session_id}`);
        return;
      }

      // If SessionStart was missed (relay restarted mid-session), announce the agent now.
      // Workers should not emit agentCreated — only agentCreatedAsSubagent.
      if (created && session.parentRelayId === undefined) {
        console.log(
          `[Hook] Late agentCreated for ${session_id} → relay ID ${session.relayId} (missed SessionStart)`,
        );
        broadcast({
          type: 'agentCreated',
          id: session.relayId,
          sessionId: session.sessionId,
          folderName: session.folderName,
        });
      }

      const status = formatToolStatus(toolName, payload.tool_input || {});
      console.log(`[Hook] PreToolUse: ${session_id} → ${toolName} (${toolUseId}) "${status}"`);

      // Track Task/Agent tool invocations for timing heuristic (parent→child linking)
      if (toolName === 'Task' || toolName === 'Agent') {
        pendingTaskSessions.set(session_id, { taskToolUseId: toolUseId, timestamp: Date.now() });
      }

      session.activeToolIds.add(toolUseId);

      if (session.parentRelayId !== undefined) {
        // Worker session: route tool events through the parent (queen)
        broadcast({
          type: 'subagentToolStart',
          id: session.parentRelayId,
          parentToolId: session.relayId.toString(),
          toolId: toolUseId,
          status,
        });
        // Workers do not trigger permission timers (skip permission timer)
      } else {
        // Top-level session: normal routing
        broadcast({
          type: 'agentToolStart',
          id: session.relayId,
          toolId: toolUseId,
          status,
        });

        // Start permission timer for non-exempt tools
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          startPermissionTimer(session, toolUseId);
        }
      }
      break;
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const session = sessions.get(session_id);
      if (!session) {
        console.warn(`[Hook] ${event} for unknown session ${session_id}`);
        return;
      }

      const toolUseId = payload.tool_use_id;
      if (!toolUseId) {
        console.warn(`[Hook] ${event} without tool_use_id for session ${session_id}`);
        return;
      }

      console.log(`[Hook] ${event}: ${session_id} → ${toolUseId}`);

      // Cancel permission timer for this tool
      cancelPermissionTimer(session, toolUseId);

      // Remove from active tools
      session.activeToolIds.delete(toolUseId);

      if (session.parentRelayId !== undefined) {
        // Worker session: route done events through the parent (queen)
        const parentRelayId = session.parentRelayId;
        const workerRelayId = session.relayId;
        setTimeout(() => {
          broadcast({
            type: 'subagentToolDone',
            id: parentRelayId,
            parentToolId: workerRelayId.toString(),
            toolId: toolUseId,
          });
        }, TOOL_DONE_DELAY_MS);
      } else {
        // Top-level session: normal routing
        // Delay the done message slightly to prevent flicker (matches extension behavior)
        setTimeout(() => {
          broadcast({
            type: 'agentToolDone',
            id: session.relayId,
            toolId: toolUseId,
          });
        }, TOOL_DONE_DELAY_MS);
      }
      break;
    }

    case 'Stop': {
      // Late-join on Stop: catches idle sessions that never fired PreToolUse after relay restart.
      // Stop fires at the end of every Claude response, so this registers all active instances.
      const { session, created } = ensureSession(payload);
      if (created && session.parentRelayId === undefined) {
        console.log(
          `[Hook] Late agentCreated (Stop) for ${session_id} → relay ID ${session.relayId} (${session.folderName})`,
        );
        broadcast({
          type: 'agentCreated',
          id: session.relayId,
          sessionId: session.sessionId,
          folderName: session.folderName,
        });
      }

      console.log(`[Hook] Stop: ${session_id} (reason: ${payload.stop_reason || 'unknown'})`);

      // Clear all active tools
      clearAllTools(session);

      if (session.parentRelayId === undefined) {
        // Top-level session: emit waiting status as normal
        broadcast({
          type: 'agentStatus',
          id: session.relayId,
          status: 'waiting',
        });
      }
      // Workers do not emit agentStatus: waiting — the queen handles that
      break;
    }

    case 'SessionEnd': {
      const existingSession = sessions.get(session_id);
      if (!existingSession) {
        // Session ended before we ever saw it — register for ID persistence, then discard
        ensureSession(payload);
        sessions.delete(session_id);
        break;
      }
      const session = existingSession;

      console.log(`[Hook] SessionEnd: ${session_id} → relay ID ${session.relayId}`);

      // Clean up all timers
      clearAllTools(session);
      session.alive = false;

      if (session.parentRelayId === undefined) {
        // Top-level session: emit agentClosed as normal
        broadcast({
          type: 'agentClosed',
          id: session.relayId,
        });
      }
      // Workers don't emit agentClosed — subagentClear (on SubagentStop) handles removal

      // Remove from active sessions (keep in registry for ID persistence)
      sessions.delete(session_id);
      break;
    }

    case 'SubagentStart': {
      // session_id is the CHILD/worker session starting
      const { session } = ensureSession(payload);
      console.log(
        `[Hook] SubagentStart: child ${session_id} → relay ID ${session.relayId} (folderName: ${session.folderName})`,
      );

      let parentSessionId: string | undefined;

      if (payload.parent_session_id) {
        // Prefer explicit parent_session_id from Claude Code (Issue #19448)
        parentSessionId = payload.parent_session_id;
        console.log(`[Hook] SubagentStart: parent_session_id provided → ${parentSessionId}`);
      } else {
        // Timing heuristic: find a pending Task/Agent tool call within the last 30s
        const now = Date.now();
        for (const [candidateParentId, entry] of pendingTaskSessions.entries()) {
          if (now - entry.timestamp <= PENDING_TASK_TTL_MS) {
            parentSessionId = candidateParentId;
            console.log(
              `[Hook] SubagentStart: timing heuristic matched parent ${parentSessionId} (taskToolUseId: ${entry.taskToolUseId})`,
            );
            pendingTaskSessions.delete(candidateParentId);
            break;
          }
        }
        if (!parentSessionId) {
          console.log(
            `[Hook] SubagentStart: no parent found for child ${session_id}, treating as standalone`,
          );
        }
      }

      if (parentSessionId) {
        const parentSession = sessions.get(parentSessionId);
        if (parentSession) {
          session.parentSessionId = parentSessionId;
          session.parentRelayId = parentSession.relayId;
          setParentSession(session_id, parentSessionId);

          console.log(
            `[Hook] SubagentStart: linking child relay ${session.relayId} → parent relay ${parentSession.relayId}`,
          );
          broadcast({
            type: 'agentCreatedAsSubagent',
            id: session.relayId,
            parentId: parentSession.relayId,
            sessionId: session.sessionId,
            folderName: session.folderName,
          });
        } else {
          console.warn(
            `[Hook] SubagentStart: parent session ${parentSessionId} not found in active sessions`,
          );
        }
      }
      break;
    }

    case 'SubagentStop': {
      // session_id is the CHILD session ending
      const session = sessions.get(session_id);
      if (!session) {
        console.warn(`[Hook] SubagentStop for unknown session ${session_id}`);
        return;
      }

      console.log(
        `[Hook] SubagentStop: child ${session_id} → relay ID ${session.relayId}, parentRelayId: ${session.parentRelayId ?? 'none'}`,
      );

      if (session.parentRelayId !== undefined) {
        broadcast({
          type: 'subagentClear',
          id: session.parentRelayId,
          parentToolId: session.relayId.toString(),
        });
      }

      // Clean up the worker session
      clearAllTools(session);
      session.alive = false;
      sessions.delete(session_id);
      break;
    }

    default:
      console.warn(`[Hook] Unknown event type: ${event}`);
  }
}

/** Get all currently active sessions (for bootstrap existingAgents) */
export function getActiveSessions(): SessionState[] {
  return Array.from(sessions.values()).filter((s) => s.alive);
}

/** Get a session by its session_id */
export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}
