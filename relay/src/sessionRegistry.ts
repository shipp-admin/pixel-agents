import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DATA_DIR = path.join(os.homedir(), '.pixel-agents');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Legacy path for migration
const OLD_DATA_DIR = path.resolve(__dirname, '..', 'data');
const OLD_SESSIONS_FILE = path.join(OLD_DATA_DIR, 'sessions.json');

interface SessionRecord {
  relayId: number;
  folderName: string;
  cwd: string;
  parentSessionId?: string;
}

/** Persisted map: session_id (UUID) → { relayId, folderName, cwd } */
type SessionMap = Record<string, SessionRecord>;

let sessionMap: SessionMap = {};
let nextId = 1;

/** Load existing session map from disk on startup */
export function loadSessionRegistry(): void {
  // Migrate from old location if needed
  try {
    if (!fs.existsSync(SESSIONS_FILE) && fs.existsSync(OLD_SESSIONS_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.copyFileSync(OLD_SESSIONS_FILE, SESSIONS_FILE);
      console.log('[Registry] Migrated sessions file from old location');
    }
  } catch (err) {
    console.warn('[Registry] Migration failed:', err);
  }

  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      sessionMap = JSON.parse(raw) as SessionMap;

      // Find the highest existing relay ID and start after it
      let maxId = 0;
      for (const record of Object.values(sessionMap)) {
        if (record.relayId > maxId) {
          maxId = record.relayId;
        }
      }
      nextId = maxId + 1;
      console.log(
        `[Registry] Loaded ${Object.keys(sessionMap).length} sessions, next ID: ${nextId}`,
      );
    } else {
      console.log('[Registry] No existing sessions file, starting fresh');
    }
  } catch (err) {
    console.error('[Registry] Failed to load sessions file, starting fresh:', err);
    sessionMap = {};
    nextId = 1;
  }
}

/** Persist session map to disk */
function saveSessionRegistry(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = SESSIONS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(sessionMap, null, 2), 'utf-8');
    fs.renameSync(tmpFile, SESSIONS_FILE);
  } catch (err) {
    console.error('[Registry] Failed to save sessions file:', err);
  }
}

/**
 * Get or create a relay ID for the given session.
 * Returns { relayId, isNew } — isNew is true if this session was just registered.
 */
export function getOrCreateRelayId(
  sessionId: string,
  folderName: string,
  cwd: string,
): { relayId: number; isNew: boolean } {
  const existing = sessionMap[sessionId];
  if (existing) {
    // Only update cwd/folderName if the new path is a parent or equal of the existing one
    // (prevents a sub-directory tool run from overwriting the session's root cwd)
    if (cwd.length <= existing.cwd.length || existing.cwd.startsWith(cwd)) {
      existing.folderName = folderName;
      existing.cwd = cwd;
      saveSessionRegistry();
    }
    return { relayId: existing.relayId, isNew: false };
  }

  const relayId = nextId++;
  sessionMap[sessionId] = { relayId, folderName, cwd };
  saveSessionRegistry();
  console.log(`[Registry] Registered session ${sessionId} → relay ID ${relayId} (${folderName})`);
  return { relayId, isNew: true };
}

/** Look up a relay ID by session UUID. Returns undefined if not registered. */
export function getRelayId(sessionId: string): number | undefined {
  return sessionMap[sessionId]?.relayId;
}

/** Get the folder name for a session. */
export function getFolderName(sessionId: string): string | undefined {
  return sessionMap[sessionId]?.folderName;
}

/** Get all registered session IDs */
export function getAllSessionIds(): string[] {
  return Object.keys(sessionMap);
}

/** Remove a session from the registry */
export function removeSession(sessionId: string): void {
  if (sessionMap[sessionId]) {
    delete sessionMap[sessionId];
    saveSessionRegistry();
  }
}

/** Get the full session record */
export function getSessionRecord(sessionId: string): SessionRecord | undefined {
  return sessionMap[sessionId];
}

/** Record a parent→child relationship */
export function setParentSession(childSessionId: string, parentSessionId: string): void {
  const record = sessionMap[childSessionId];
  if (record) {
    record.parentSessionId = parentSessionId;
    saveSessionRegistry();
  }
}

/** Get all child session IDs for a given parent */
export function getChildSessionIds(parentSessionId: string): string[] {
  return Object.entries(sessionMap)
    .filter(([, record]) => record.parentSessionId === parentSessionId)
    .map(([sessionId]) => sessionId);
}
