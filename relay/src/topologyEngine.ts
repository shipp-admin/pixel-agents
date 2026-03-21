/**
 * Topology engine for Ruflo swarm inference.
 *
 * Two mechanisms (used together when available):
 * 1. SQLite: poll .swarm/memory.db for swarm_id groupings
 * 2. Sidecar: read ~/.pixel-agents/sessions.jsonl for session start times
 *
 * When a new session starts, query both sources to find if it belongs to
 * an existing swarm. If so, return the queen's session_id.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Max age (ms) to consider a session "recently started" for heuristic grouping */
const SWARM_TIME_WINDOW_MS = 30_000;

interface SidecarEntry {
  session_id: string;
  cwd: string;
  timestamp: number; // Unix epoch seconds
}

/** Read all entries from the sidecar JSONL file */
function readSidecarEntries(): SidecarEntry[] {
  const sidecarFile = path.join(os.homedir(), '.pixel-agents', 'sessions.jsonl');
  try {
    if (!fs.existsSync(sidecarFile)) return [];
    const lines = fs.readFileSync(sidecarFile, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as SidecarEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is SidecarEntry => e !== null);
  } catch {
    return [];
  }
}

/**
 * Attempt to find the queen session_id for a given child session.
 * Uses sidecar time-window heuristic.
 *
 * Logic: find sessions that started within SWARM_TIME_WINDOW_MS of the child,
 * have the same cwd, and were registered before the child. The earliest such
 * session is the queen candidate.
 */
export function inferQueenSessionId(
  childSessionId: string,
  childCwd: string,
  childStartTime: number,
  knownSessionIds: Set<string>,
): string | null {
  const entries = readSidecarEntries();
  const childTimeSec = childStartTime / 1000;

  // Find sessions that:
  // 1. Are in knownSessionIds (relay has seen them)
  // 2. Have same cwd
  // 3. Started before the child
  // 4. Started within the time window
  const candidates = entries.filter(
    (e) =>
      e.session_id !== childSessionId &&
      knownSessionIds.has(e.session_id) &&
      e.cwd === childCwd &&
      e.timestamp < childTimeSec &&
      childTimeSec - e.timestamp < SWARM_TIME_WINDOW_MS / 1000,
  );

  if (candidates.length === 0) return null;

  // Pick the earliest (most likely the queen)
  candidates.sort((a, b) => a.timestamp - b.timestamp);
  return candidates[0].session_id;
}

/**
 * Try to read swarm groupings from Ruflo's SQLite database.
 * Returns a map of session_id → swarm_id, or null if database unavailable.
 *
 * Note: Uses dynamic require to avoid hard dependency on better-sqlite3.
 * If better-sqlite3 is not installed, this silently returns null.
 */
export function readRufloSwarmGroups(rufloDbPath?: string): Map<string, string> | null {
  const dbPath = rufloDbPath ?? path.join(process.cwd(), '.swarm', 'memory.db');

  if (!fs.existsSync(dbPath)) return null;

  try {
    // Dynamic require — better-sqlite3 is optional
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as (
      p: string,
      o?: object,
    ) => {
      prepare: (sql: string) => { all: () => Array<{ session_id: string; swarm_id: string }> };
      close: () => void;
    };

    const db = Database(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare('SELECT session_id, swarm_id FROM agents WHERE session_id IS NOT NULL')
        .all();
      const result = new Map<string, string>();
      for (const row of rows) {
        result.set(row.session_id, row.swarm_id);
      }
      return result;
    } finally {
      db.close();
    }
  } catch {
    // better-sqlite3 not available or table schema differs — fail silently
    return null;
  }
}

/**
 * Given a set of sessions and swarm groups, find the queen for a given session.
 * Queens are the first-registered session in their swarm.
 * Returns the queen session_id, or null if this session is a queen itself or not in a swarm.
 */
export function findQueenFromSwarmGroups(
  sessionId: string,
  swarmGroups: Map<string, string>,
  sessionStartTimes: Map<string, number>,
): string | null {
  const swarmId = swarmGroups.get(sessionId);
  if (!swarmId) return null;

  // Find all sessions in the same swarm
  const swarmMembers = Array.from(swarmGroups.entries())
    .filter(([, sid]) => sid === swarmId)
    .map(([sessId]) => sessId);

  if (swarmMembers.length <= 1) return null;

  // Queen = earliest start time among swarm members
  const sorted = swarmMembers
    .filter((id) => sessionStartTimes.has(id))
    .sort((a, b) => (sessionStartTimes.get(a) ?? 0) - (sessionStartTimes.get(b) ?? 0));

  const queen = sorted[0];
  return queen === sessionId ? null : (queen ?? null);
}
