#!/usr/bin/env bash
# Copies the game's data files from the Java repository (read-only) into assets/, converts the
# sounds to WAV and regenerates the manifest. Run again to refresh the copy.
#   tools/import-assets.sh [path-to-java-repo]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-../ski-stunt-applet}"
[ -d "$SRC/config" ] || { echo "No Java repo at $SRC"; exit 1; }

mkdir -p assets
for d in config art terrain objects animations; do
  rm -rf "assets/$d"
  rsync -a --exclude='*.class' --exclude='selected.txt' --exclude='.DS_Store' "$SRC/$d/" "assets/$d/"
done
rm -rf assets/sounds && mkdir -p assets/sounds
node tools/au2wav.mjs "$SRC/sounds" assets/sounds
{
  echo "Imported from $(cd "$SRC" && pwd)"
  echo "Java repo commit: $(git -C "$SRC" rev-parse HEAD)"
  echo "(includes the untracked art/skins/girl_skier skin if present in the working tree)"
} > assets/SOURCE.txt
node tools/make-manifest.mjs
