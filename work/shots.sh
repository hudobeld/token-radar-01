#!/bin/sh
# Rebuild the three screenshots from a built output directory.
# Usage: work/shots.sh [out-dir] [port]
# Serves <out-dir> on a local port, screenshots the board, a detail view and
# a filtered view at 1440x900 with headless Chromium, then stops the server.
# A PNG over 350 KiB is converted to JPEG quality 84 and renamed to .jpg
# (needs Python PIL); the build is re-run afterwards so /output matches.
set -eu
OUT="${1:-out}"
PORT="${2:-8123}"
CHROME="$HOME/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

node "$HERE/serve.mjs" "$OUT" "$PORT" > /tmp/radar-serve.log 2>&1 &
SERVE_PID=$!
trap 'kill $SERVE_PID 2>/dev/null || true' EXIT
sleep 1

shot() {
  name="$1"; url="$2"
  "$CHROME" --headless --disable-gpu --no-sandbox \
    --screenshot="$HERE/screenshots/$name" --window-size=1440,900 \
    --hide-scrollbars --virtual-time-budget=4000 \
    "http://127.0.0.1:$PORT/$url" > /dev/null 2>&1
}

shot 1-board.png "dashboard/index.html"
shot 2-detail.png "dashboard/index.html?detail=steakhouse-financial"
shot 3-filtered.png "dashboard/index.html?filter=watchlist"

for f in 1-board.png 2-detail.png 3-filtered.png; do
  p="$HERE/screenshots/$f"
  sz=$(stat -c%s "$p")
  echo "$f $sz bytes"
  if [ "$sz" -gt 358400 ]; then
    python3 - "$p" <<'PY'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p).convert("RGB")
out = p.rsplit(".", 1)[0] + ".jpg"
im.save(out, "JPEG", quality=84, optimize=True)
print("converted to", out)
PY
    rm "$p"
    echo "$f replaced by ${f%.png}.jpg"
  fi
done
ls -l "$HERE/screenshots/"
