#!/usr/bin/env bash
# Publish the static simulator to a web root (default /var/www/flyski, served at
# https://blind.pub/flyski/ via /etc/nginx/snippets/flyski.conf).
# Only runtime files are copied (page, styles, scripts, reference data, vendored
# three.js, CC0 textures); tests, tools and package files are not published.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-/var/www/flyski}"
(cd "$SRC" && npm test >/dev/null) || { echo "tests failed; not deploying" >&2; exit 1; }
STAGE="$(mktemp -d)"
cp -r "$SRC/index.html" "$SRC/concepts.html" "$SRC/css" "$SRC/js" "$SRC/data" "$SRC/vendor" "$SRC/assets" "$STAGE/"
# concept promo films (SIM-033), if rendered: served at media/
if ls "$SRC/../output/video/"*.mp4 >/dev/null 2>&1; then mkdir -p "$STAGE/media"; cp "$SRC/../output/video/"*.mp4 "$STAGE/media/"; fi
mkdir -p "$DEST"
rsync -a --delete "$STAGE/" "$DEST/"
rm -rf "$STAGE"
chmod -R a+rX "$DEST"
echo "deployed $(cd "$SRC" && git rev-parse --short HEAD 2>/dev/null || echo uncommitted) → $DEST"
