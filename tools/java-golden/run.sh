#!/usr/bin/env bash
# Regenerates test/fixtures/golden.json from the Java version (read-only: nothing in the Java repo is
# touched; classes are compiled into a temp dir). Needs a JDK and a desktop session (the Java game
# builds an AWT window).
#   tools/java-golden/run.sh [path-to-java-repo]
set -euo pipefail
cd "$(dirname "$0")/../.."
JAVA_REPO="${1:-../ski-stunt-applet}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
find "$JAVA_REPO/src" -name '*.java' > "$TMP/sources.txt"
echo tools/java-golden/Golden.java >> "$TMP/sources.txt"
javac -nowarn -d "$TMP/classes" @"$TMP/sources.txt"
mkdir -p test/fixtures
# one JVM per scenario: earlier runs must not leak state (joints, particles ...) into later ones
SCENARIOS="rest_flat slide_kicker crate_rest crate_push static_crate"
for name in $SCENARIOS; do
  java -cp "$TMP/classes" Golden "$(pwd)/assets/" "$TMP/$name.json" "$name" > "$TMP/java-$name.log" 2>&1 || { cat "$TMP/java-$name.log"; exit 1; }
done
node -e '
const fs = require("fs");
const [dir, out, ...names] = process.argv.slice(1);
const all = {};
for (const n of names) Object.assign(all, JSON.parse(fs.readFileSync(`${dir}/${n}.json`, "utf8")));
fs.writeFileSync(out, JSON.stringify(all) + "\n");
' "$TMP" test/fixtures/golden.json $SCENARIOS
echo "wrote test/fixtures/golden.json ($(wc -c < test/fixtures/golden.json) bytes)"
