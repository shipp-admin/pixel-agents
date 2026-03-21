#!/usr/bin/env bash
# Pixel Agents — SessionStart sidecar hook
#
# Appends { session_id, cwd, timestamp } to ~/.pixel-agents/sessions.jsonl
# so the topology engine can correlate Ruflo worker sessions with their queen
# via time-window + cwd proximity heuristics (and SQLite swarm_id when available).
#
# Installation (chmod +x this file first):
#   chmod +x /path/to/relay/scripts/session-start-hook.sh
#
# Then add to ~/.claude/settings.json:
#   {
#     "hooks": {
#       "SessionStart": [
#         {
#           "hooks": [
#             {
#               "type": "command",
#               "command": "/absolute/path/to/relay/scripts/session-start-hook.sh"
#             }
#           ]
#         }
#       ]
#     }
#   }
#
# Claude Code pipes the hook payload JSON to stdin on each SessionStart event.

set -euo pipefail

SIDECAR_FILE="${HOME}/.pixel-agents/sessions.jsonl"
mkdir -p "$(dirname "$SIDECAR_FILE")"

# Claude Code pipes the hook payload JSON to stdin
PAYLOAD=$(cat)

SESSION_ID=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])" 2>/dev/null || echo "")
CWD=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['cwd'])" 2>/dev/null || echo "")
TIMESTAMP=$(date -u +%s)

if [ -n "$SESSION_ID" ] && [ -n "$CWD" ]; then
  printf '{"session_id":"%s","cwd":"%s","timestamp":%s}\n' "$SESSION_ID" "$CWD" "$TIMESTAMP" >> "$SIDECAR_FILE"
fi
