#!/usr/bin/env bash
# Build a .dmg from the packaged .app produced by `nextron build --mac`.
# Workaround for a macOS Tahoe (25.x) bug in `hdiutil convert` used by electron-builder.
set -euo pipefail

cd "$(dirname "$0")/.."

ARCH="${1:-arm64}"
APP_DIR="dist/mac-${ARCH}/Stack PR.app"
VERSION="$(node -p "require('./package.json').version")"
OUT_DMG="dist/Stack PR-${VERSION}-${ARCH}.dmg"

if [[ ! -d "$APP_DIR" ]]; then
  echo "Error: $APP_DIR not found. Run 'npm run build:mac' first." >&2
  exit 1
fi

rm -f "$OUT_DMG"
echo "Creating $OUT_DMG from $APP_DIR"
hdiutil create \
  -volname "Stack PR" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$OUT_DMG"
echo "Done: $OUT_DMG"
