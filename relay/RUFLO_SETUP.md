# Ruflo Topology Support — Setup Guide

This guide covers wiring up the sidecar hook and optional SQLite polling so the
relay can infer queen/worker relationships across Ruflo swarm sessions.

---

## Overview

Ruflo spawns multiple `claude` CLI processes (workers) that share a `swarm_id`
stored in `.swarm/memory.db`. Because Claude Code hook payloads do not include a
`parent_session_id`, the relay uses two complementary mechanisms to infer topology:

1. **Sidecar JSONL** — a `SessionStart` hook appends `{ session_id, cwd, timestamp }`
   to `~/.pixel-agents/sessions.jsonl`. The topology engine uses time-window + cwd
   proximity heuristics to identify queen candidates.

2. **SQLite polling** (optional) — when `better-sqlite3` is installed, the engine
   reads `.swarm/memory.db` directly to get authoritative `swarm_id` groupings.

---

## 1. Install the sidecar hook script

```sh
# Make the script executable (only needed once)
chmod +x /absolute/path/to/relay/scripts/session-start-hook.sh
```

Then add it to `~/.claude/settings.json` under the `SessionStart` hook:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/relay/scripts/session-start-hook.sh"
          }
        ]
      }
    ]
  }
}
```

Replace `/absolute/path/to/relay/scripts/session-start-hook.sh` with the actual
path on your machine (e.g. `/Users/yourname/Documents/VSCode/pixel-agents/relay/scripts/session-start-hook.sh`).

The script writes one JSON line per session start to `~/.pixel-agents/sessions.jsonl`.
That file is also used by the existing layout persistence system, so the directory
is guaranteed to exist once you have run pixel-agents at least once.

---

## 2. Optional: install `better-sqlite3` for SQLite polling

The topology engine uses a dynamic `require('better-sqlite3')` so the relay starts
and runs normally without it. SQLite support is purely additive.

```sh
cd relay
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

When installed, `readRufloSwarmGroups()` opens `.swarm/memory.db` (read-only) and
returns a `Map<session_id, swarm_id>`. If the database does not exist or the table
schema differs from what is expected, the function returns `null` and the relay
falls back to sidecar heuristics silently.

---

## 3. Integration point in `hookHandler.ts`

`topologyEngine.ts` exports three functions that are not yet wired into the main
hook handler — that integration is Phase 4 work. The API surface is:

```ts
import {
  inferQueenSessionId,       // sidecar heuristic
  readRufloSwarmGroups,      // SQLite polling (optional)
  findQueenFromSwarmGroups,  // queen lookup from swarm map
} from './topologyEngine';
```

Suggested integration on `SessionStart`:

1. Call `readRufloSwarmGroups()` — use swarm map if available.
2. If swarm map returned `null`, call `inferQueenSessionId()` with:
   - the new session's `session_id` and `cwd` from the hook payload
   - `Date.now()` as `childStartTime`
   - a `Set` of all session IDs currently tracked by the relay (`sessions` map keys)
3. If a queen is found, annotate the session state with `queenSessionId` for use
   in the broadcast protocol (e.g. a `swarmWorker` property on `agentCreated`).

---

## Sidecar file format

`~/.pixel-agents/sessions.jsonl` — one JSON object per line:

```json
{"session_id":"<uuid>","cwd":"/path/to/project","timestamp":1742563200}
```

The file grows indefinitely. A future maintenance task can prune entries older
than a configurable TTL (e.g. 24 hours). The topology engine already filters by
`SWARM_TIME_WINDOW_MS` (30 seconds) so stale entries are harmless.
