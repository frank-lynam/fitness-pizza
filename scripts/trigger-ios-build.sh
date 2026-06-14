#!/bin/bash
# Trigger an iOS build on the MacBook build server, wait for it to finish,
# and download the resulting IPA.
#
# Usage:
#   ./scripts/trigger-ios-build.sh [host] [port] [output.ipa]
#
# The host defaults to the value in .build-server-host (one line, e.g. "192.168.1.42")
# or "macbook.local" if that file doesn't exist.
# Port defaults to 12346. Output defaults to "fitness-pizza.ipa".
#
# To save the host permanently:
#   echo "192.168.1.42" > fitness-tracker-pwa/.build-server-host

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_FILE="$SCRIPT_DIR/../.build-server-host"

HOST="${1:-}"
if [ -z "$HOST" ] && [ -f "$HOST_FILE" ]; then
    HOST="$(cat "$HOST_FILE" | tr -d '[:space:]')"
fi
HOST="${HOST:-macbook.local}"

PORT="${2:-12346}"
IPA_OUT="${3:-fitness-pizza.ipa}"
BASE="http://$HOST:$PORT"

echo "Build server: $BASE"

# Trigger build
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/build")
case "$HTTP_CODE" in
    202) echo "Build started." ;;
    409) echo "Build already running — waiting for it to finish..." ;;
    *)   echo "ERROR: server returned HTTP $HTTP_CODE"; exit 1 ;;
esac

# Poll until done
echo "Polling for completion (checking every 15 s)..."
while true; do
    RESP=$(curl -sf "$BASE/status")
    STATE=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['state'])" 2>/dev/null || echo "unknown")
    ELAPSED=$(echo "$RESP" | python3 -c "
import sys, json, time
d = json.load(sys.stdin)
s = d.get('started')
print(f'{int(time.time()-s)}s' if s else '?')
" 2>/dev/null || echo "?")
    echo "  [$ELAPSED] $STATE"
    case "$STATE" in
        success) echo "Build succeeded."; break ;;
        failed)
            echo ""
            echo "=== BUILD FAILED — last 40 lines of log ==="
            echo "$RESP" | python3 -c "
import sys, json
log = json.load(sys.stdin).get('log','')
lines = log.splitlines()
print('\n'.join(lines[-40:]))
" 2>/dev/null || true
            exit 1 ;;
        *) sleep 15 ;;
    esac
done

# Download IPA
echo "Downloading IPA → $IPA_OUT ..."
curl -f -# -o "$IPA_OUT" "$BASE/download"
SIZE=$(du -h "$IPA_OUT" | cut -f1)
echo "Done: $IPA_OUT ($SIZE)"
