# Pixel Agents — Development Plan

**Base repo**: `pablodelucca/pixel-agents` (forked to `JerushC/pixel-agents`)
**Goal**: Extend the VS Code pixel-art office to (1) show agents from external orchestrators (Ruflo), and (2) run as a standalone web app visible to collaborators on different machines.

---

## Current State Assessment

### Web Mode
The original codebase already has browser mode partially implemented:
- `runtime.ts` — detects VS Code vs browser correctly
- `browserMock.ts` — complete asset pipeline mock (sprites, furniture, layout)
- Vite dev server — has HTTP middleware serving decoded sprite JSON
- Running `cd webview-ui && npm run dev` already shows the office in a browser (empty room, no agents)
- Gaps: no mock agent characters dispatched, no persistence, no real agent feed

### Ruflo Sub-Agents
- Ruflo sub-agents ultimately invoke the `claude` CLI as subprocesses
- Each subprocess writes a standard Claude Code JSONL file to `~/.claude/projects/`
- **The transcript format is fully compatible** with the existing `transcriptParser.ts`
- **The blocker**: every agent in pixel-agents is tied to a VS Code terminal reference (`terminalRef`). Ruflo spawns background CLI processes, not VS Code terminals. No terminal = agent cannot be registered or rendered.
- Ruflo's own state lives in SQLite (`.swarm/memory.db`), not JSONL — but each sub-agent's Claude session does produce JSONL as a side effect

---

## Pre-Implementation Audit — Known Issues

> Assessed against live source code before any implementation. Sorted by severity.

### Blockers — Resolved

**B1 — `tool_use_id` in hook payloads ✅ NOT a blocker**
Verified against live Claude Code docs: `tool_use_id` IS present in both `PreToolUse` and `PostToolUse` payloads. The relay uses it directly as `toolId` in `agentToolStart`/`agentToolDone` — no synthetic IDs needed. Remaining gap: `agentStatus` transitions (turn-idle) must be synthesised — `Stop` hook → emit `agentStatus: 'waiting'`; permission timer replicated in relay via `setInterval` keyed by `(session_id, tool_use_id)`.

**B2 — Agent ID collisions ✅ RESOLVED**
Relay assigns its own globally sequential integers and maintains a `session_id → relayId` map. No changes to `useExtensionMessages.ts` or `officeState.ts`. Relay also includes `session_id` (UUID string) as an extra field in every `agentCreated` message so the webview can key localStorage seat/palette preferences off it. Persist the map to disk on relay restart to avoid ID reuse.

**B3 — Ruflo topology inference ✅ RESOLVED with constraint**
Ruflo's `.swarm/memory.db` stores `swarm_id` per agent but not Claude Code `session_id`. No manifest file links the two. Claude Code Issue #19448 (`parent_session_id` in hook payloads) is not yet shipped. **Phase 3 MVP:** a local `SessionStart` hook sidecar script on the Ruflo machine writes `{ session_id, cwd, timestamp }` to a sidecar file; the relay polls `.swarm/memory.db` for `swarm_id` groupings. Intersection of shared `swarm_id` + matching `cwd` + session start within a configurable time window gives reliable queen→worker mapping for the common case. If Issue #19448 ships, the sidecar is retired and replaced by `parent_session_id` in the hook payload directly.

**B4 — `stream-json` and `agent_progress` records ✅ NOT a blocker**
`--output-format stream-json` does not suppress `agent_progress` records — output format controls stdout only; JSONL is always written independently. Moot anyway: Ruflo workers are independent CLI processes, not Task tool invocations, so they never produce `agent_progress` records in a parent's JSONL regardless of output format. `processProgressRecord` is simply the wrong path for Ruflo. B4 merges into B3 — per-file watching of each worker's own JSONL is the required path.

---

### Significant Issues — Resolved

**S1 — WebSocket message ordering ✅ RESOLVED**
Client-side fix: extend the existing `pendingAgents` buffer in `useExtensionMessages.ts` to cover direct `agentCreated` messages — if layout is not yet ready when `agentCreated` arrives, queue it. The existing `layoutLoaded` handler already drains the queue. Relay should also enforce send order (assets → `layoutLoaded` → agent events) as a defensive protocol convention.

**S2 — Web/WS bootstrap handshake ✅ RESOLVED**
Client-initiated: on WebSocket open, client sends `wsReady`. Relay responds with bootstrap sequence: sprites → tiles → furniture → `layoutLoaded` → `existingAgents`. Extend `vscodeApi.ts` to support a WS transport behind the same `{ postMessage, onMessage }` interface. `useExtensionMessages.ts` calls `vscode.onMessage(handler)` instead of `window.addEventListener` directly — one code path for both VS Code and WS modes. `browserMock.ts` useEffect in `App.tsx` stays untouched for local dev.

**S3 — 8 message types with no relay equivalent ✅ RESOLVED**
Phase 2 adopts deliberate **read-only web mode**:

| Message | Web mode resolution |
|---|---|
| `openClaude` | No-op; hide "+ Agent" button in web mode |
| `focusAgent` | Silent no-op |
| `closeAgent` | No-op; hide close button |
| `agentSelected` | Never arrives; no change needed |
| `exportLayout` | Browser Blob download via `<a download>` |
| `importLayout` | `<input type="file">` + FileReader |
| `saveLayout` | localStorage MVP → WS relay message Phase 4 |
| `saveAgentSeats` | localStorage keyed by `session_id` |
| `setSoundEnabled` | localStorage |

**S4 — Layout persistence ✅ RESOLVED**
Relay server owns the single shared layout. Served to all clients on `connected` as part of the bootstrap snapshot, persisted to `layout.json` on relay disk. Clients send `saveLayout` via WS; relay persists and rebroadcasts `layoutLoaded` to all connected clients. Per-user localStorage is reserved for seat/palette preferences only (S5).

**S5 — Seat/palette persistence ✅ RESOLVED**
Relay includes `session_id` in every `agentCreated` message. Web client stores `{ palette, hueShift, seatId }` in localStorage keyed by `session_id`. On reconnect relay sends `existingAgents` with session UUIDs; client hydrates from its own localStorage. One required change in `useExtensionMessages.ts`: `agentCreated` handler reads `msg.sessionId` and looks up localStorage before calling `os.addAgent()`.

**S6 — Seat capacity ✅ RESOLVED with documented constraint**
Characters with no free seat are placed at the nearest walkable tile with `seatId = null` — TYPE animation, desk electronics, and camera-follow all degrade gracefully. No auto-expand; no crowd mode. Documented constraints: 1 seat per expected concurrent agent; a 40×22 office handles 30+ agents; relay emits a warning when `agentCreated` arrives with no free seat available; users must build an appropriately sized office before running large swarms.

**S7 — Sub-agent nesting ✅ RESOLVED as explicit constraint**
Exactly 1 level of nesting supported (top-level agent → sub-agent). Ruflo's queen→worker topology is flat by design — workers do not themselves spawn further CLI subprocesses in the standard pattern. Documented as explicit constraint. If a worker using the Task tool is observed in practice, address as a targeted change at that time.

---

### Minor Issues

**M1 — Production build omits decoded sprite JSON (Phase 4)**
Add a `closeBundle()` step to Vite config writing all four decoded JSON files to `dist/assets/decoded/`. Do before Phase 4 deploy.

**M2 — `dispatchMockMessages()` sends no agent events (Phase 1)**
Add mock `agentCreated` + `agentToolStart` dispatches at end of `dispatchMockMessages()`.

**M3 — Sub-agent negative ID counter resets on page reload**
Expected behavior — sub-agents are intentionally ephemeral. Documented.

---

## Phases

---

### Phase 1 — Spin Up the Web Version (Low Effort) ✅ COMPLETE

**Goal**: Get the standalone browser mode actually running with visible agents (even mocked), so we have a working web UI to build on.

**What's needed**:
1. Install dependencies — `cd webview-ui && npm install`
2. Verify `npm run dev` launches the office in a browser
3. Add mock agent dispatches to `browserMock.ts` → `dispatchMockMessages()` so at least one character appears in the office (proves the rendering pipeline works end-to-end in browser)
4. Add a top-level `npm run dev:web` script in root `package.json` for convenience
5. Identify and document which `vscode.postMessage` no-ops need real implementations for a useful web experience
6. *(Added during Phase 1)* Persistent `folderName` labels — always-visible project/repo name badge rendered above each character, derived from `cwd`/`folderName` on the agent.

**Success criteria**: Open `localhost:5173` and see an animated pixel-art office with at least one character doing something.

**Effort**: Small (hours, not days). The architecture is already there.

---

### Phase 2 — WebSocket Relay Server for Live Agent Feeds

**Goal**: Replace the JSONL file watcher with a network-based event feed so any browser (on any machine) can receive live agent activity.

**Architecture**:
```
Machine A (your machine)         Central Relay Server
└── Claude Code sessions    →    HTTP POST (hooks) → WebSocket broadcast
    └── ~/.claude/projects/

Machine B (coworker)
└── Claude Code sessions    →    HTTP POST (hooks) ↗

Any browser
└── pixel-agents web UI  ←  WebSocket  ←  Relay Server
```

**What's needed**:
1. **Relay server** (Node.js, Express + `ws`):
   - Receives Claude Code hook POSTs (`SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionEnd`, `SubagentStart`, `SubagentStop`)
   - Maintains `session_id → relayId` integer map (persisted to disk across restarts)
   - Translates hook payloads → pixel-agents message protocol using real `tool_use_id` from hook payload as `toolId`
   - Synthesises `agentStatus: 'waiting'` from `Stop` hook; implements 7s silence timer for `agentToolPermission`
   - Owns shared layout (`layout.json` on disk); serves it in bootstrap; accepts `saveLayout` WS messages and rebroadcasts
   - On new client connect: sends bootstrap sequence (sprites → tiles → furniture → `layoutLoaded` → `existingAgents`)
   - Broadcasts all live events to all connected WebSocket clients
2. **Webview WS transport** — extend `vscodeApi.ts` with a WS transport behind the same `{ postMessage, onMessage }` interface. Client sends `wsReady` on WS open; routes incoming WS messages to existing `useExtensionMessages.ts` handler unchanged
3. **Client-side ordering guard** — extend `pendingAgents` buffer to cover direct `agentCreated` messages (queue if layout not yet ready)
4. **Read-only web mode** — hide "+ Agent" and close buttons; replace VS Code file dialogs with browser-native Blob download / file input; save layout/seats/sound to localStorage
5. **Hook config** on each observed machine (`~/.claude/settings.json`):
   ```json
   {
     "hooks": {
       "SessionStart":  [{ "hooks": [{ "type": "http", "url": "https://relay/hooks" }] }],
       "PreToolUse":    [{ "hooks": [{ "type": "http", "url": "https://relay/hooks" }] }],
       "PostToolUse":   [{ "hooks": [{ "type": "http", "url": "https://relay/hooks" }] }],
       "Stop":          [{ "hooks": [{ "type": "http", "url": "https://relay/hooks" }] }],
       "SessionEnd":    [{ "hooks": [{ "type": "http", "url": "https://relay/hooks" }] }]
     }
   }
   ```
6. Agent labels derived from `cwd` in hook payload (decode `~/.claude/projects/<encoded-cwd>/` path back to readable project name)
7. **Zone-aware seat assignment**: when `agentCreated` arrives with a `folderName`/`cwd`, seat the new agent near existing agents from the same project (group teammates spatially). Implementation: in `officeState.ts` `addAgent()`, when `folderName` is provided, score available seats by proximity to other agents sharing the same `folderName`, preferring nearby seats. Falls back to current random/closest logic when no same-project agents exist.
8. **Zone label rendering**: render a small static label above each spatial cluster in the office showing the project/folder name. Can be done as an HTML overlay using the existing `ToolOverlay` coordinate system or as canvas text. Triggers when 2+ agents from the same `folderName` are present.

**Notes**:
- VS Code extension continues using JSONL file watcher for local sessions — WS path is additive
- Relay can run locally (dev) or be deployed (Render, Railway, Fly.io) for real cross-machine use
- All sessions across all projects on all hook-configured machines appear in one office automatically

**Success criteria**: Coworker adds hook config, opens browser pointing at relay, their Claude sessions appear as characters in real-time. Layout is shared. Page reload restores seat/palette preferences.

**Effort**: Medium (2-3 days). Architecture is clear, no remaining blockers.

---

### Phase 3 — Ruflo Sub-Agent Integration

**Goal**: Ruflo-spawned sub-agents appear as characters in the office, properly nested under their parent orchestrator agent.

**Context**: In Phase 2, Ruflo workers already appear as independent top-level agents (each fires its own hooks with its own `session_id`). Phase 3 is specifically about showing them *nested under their queen* rather than as unrelated characters. This requires resolving the topology inference problem (B3).

**What's needed**:
1. **Topology sidecar** — Deploy a `SessionStart` hook script on the Ruflo machine that writes `{ session_id, cwd, timestamp }` to a local sidecar file readable by the relay. The relay simultaneously polls `.swarm/memory.db` for `swarm_id` groupings. Intersection of shared `swarm_id` + matching `cwd` + start within configurable time window → queen→worker mapping.
2. **Relay topology grouping** — When relay identifies a set of `session_id`s as a swarm, it designates the first-started session as the queen and registers the rest as workers. It emits `agentCreated` for the queen (positive integer ID) followed by worker sessions with a `parentSessionId` field. Webview creates workers as sub-agent characters clustered near the queen.
3. **New `agentCreatedAsSubagent` message type** — Relay sends this instead of `agentCreated` for workers. Carries: `id` (relay integer), `parentId` (queen's relay integer), `sessionId` (UUID). `useExtensionMessages.ts` routes this to `os.addSubagent()` rather than `os.addAgent()`.
4. **Per-worker JSONL tool tracking** — Each worker's own JSONL file is watched (or its hooks forwarded) for tool activity, which drives animation on the worker's character in the office.
5. **Nesting constraint** — 1 level only (queen → workers). Workers are leaf nodes. Document explicitly.
6. **Seat sizing guidance** — Emit a relay warning when available seats < active agent count. Document: build a 40×22+ office before running swarms of 10+ agents.

**External dependency**: If Claude Code Issue #19448 (`parent_session_id` in hook payloads) ships before Phase 3 is implemented, steps 1–2 are replaced by reading `parent_session_id` directly from hook payloads — the sidecar approach is retired.

**Success criteria**: Start a Ruflo swarm, queen appears in the office, workers spawn as nested characters clustered nearby, worker tool activity drives their animations independently.

**Effort**: Medium-High. Topology sidecar + relay grouping logic + new message type are the non-trivial parts.

---

### Phase 4 — Production Web Deployment

**Goal**: Deploy the web version and relay server so any team member can open a URL and see the shared office without running anything locally.

**What's needed**:
1. Dockerize the relay server
2. Pre-bake decoded sprite assets — add `closeBundle()` to Vite config writing all 4 decoded JSON files to `dist/assets/decoded/` (fix M1)
3. Authentication / access control for the relay WebSocket endpoint
4. Deployment config (Dockerfile, `fly.toml` or `render.yaml`)
5. Upgrade `saveLayout` from localStorage to WS relay message → relay persists and rebroadcasts (upgrade from Phase 2 MVP)
6. Broadcast `agentMeta` (palette assignments) from relay to all clients so all observers see consistent character colours
7. Custom domain or internal URL for team access

**Success criteria**: Team member opens a URL, no local setup required, sees the live office.

**Effort**: Medium. Mostly DevOps and polish, no new architectural work.

---

## Cross-Project & Cross-Machine Coverage

### Current scope (VS Code extension as-is)
The extension only watches sessions from the **current VS Code workspace**. `getProjectDirPath()` in `agentManager.ts` computes:
```
~/.claude/projects/<hash-of-current-workspace>/
```
Sessions from other projects on the same machine are completely invisible. Each VS Code window is an island.

### Single-machine, all projects
To show all local Claude sessions regardless of project, the scan needs to be broadened from the per-project subdirectory to the parent `~/.claude/projects/` directory. The file watcher, parser, and rendering layers need no changes — only discovery scope changes. Agent labels would be derived from the directory name (workspace path is encoded in the folder name and is fully reversible).

### Cross-machine (Phase 2 relay)
The relay server approach solves both cross-machine AND cross-project simultaneously. Hook payloads include `session_id` and `cwd` — enough to identify and label any session from any project on any machine. This is the preferred path forward.

### Multi-room architecture
True multi-room architecture (separate OfficeState instances, floor switching, room portals) is NOT planned. The 64×64 max grid comfortably fits 50–60 seated agents. The correct approach for multi-project/multi-machine scenarios is one large office with spatial zones — agents from the same project cluster near each other via `folderName`-aware seat assignment. Floor colors + wall separators in the layout editor create visually distinct zones. Camera follow keeps any individual agent centered regardless of office size.

---

## Open Questions

1. **What is "Ruflo" exactly in our context?** — Confirmed as enterprise Claude Code orchestration layer (wraps `claude` CLI, uses SQLite for swarm state, sub-agents each produce standard JSONL files).
2. **Relay server hosting** — Self-hosted or cloud? Determines Phase 2 deployment approach. *Resolved*: relay server lives in a `relay/` subdirectory inside the pixel-agents repo (keeps everything together, single repo for Phase 2; can be split to a separate repo later if needed for independent deployment).
3. **Agent naming** — Agents currently show by terminal number. In relay mode, labels should show machine name + project name (both derivable from hook payload `cwd`).
4. **Sound in web mode** — Currently stubbed to console.log. Is audio important for the web version?

---

## Decision: Starting Point

Start with **Phase 1** — verify the web mode boots with characters visible. This validates the rendering pipeline costs nothing and gives a foundation to wire Phase 2 into. Phase 1 can be done in a single session.
