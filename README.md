# Ski Stunt (HTML5)

A JavaScript / HTML5-canvas port of the Ski Stunt Simulator demo, ported from the Java/AWT version in
the `ski-stunt-applet` repository. The original game is the Ski Stunt Simulator from UBC
(https://www.cs.ubc.ca/~van/sssjava/javademo.html); this port covers that demo plus the additions made
in the Java repo: skins, a map editor, objects (including pushable crates) and an object editor.

No build step and no dependencies: plain ES modules.

## Running

```
npm start          # serves this folder at http://localhost:8080/
```

Open http://localhost:8080/. A static server is required (browsers don't load modules or data from
`file://`); any static server works, e.g. `python3 -m http.server 8080`. The site is plain static files,
so it can be hosted anywhere.

**Playing:** press <kbd>Space</kbd> to start and stop; the mouse position controls the skier's pose (a
200 x 200 px zone centered on the pointer when the run starts). <kbd>&lt;</kbd> / <kbd>&gt;</kbd> slow down /
speed up, <kbd>↑</kbd> / <kbd>↓</kbd> zoom, <kbd>Esc</kbd> stops. The simulation runs in real time; the speed
slider slows it down (1x to 1/8x). Terrain, skin, replay of your last run and four recorded demos are in the
toolbar.

## Editors

**Edit Map…**, **Edit Objects…** and **Edit Skin…** open an editor next to the game. Changes show in the
game as you make them. Everything you make lives **only in the browser tab's memory**: reloading the page
loses it (the page warns first). Each editor has a **Download…** button that saves your work as a zip with
the same file layout as the Java version (unzip it into the game's `assets/` folder, or the Java repo's
resource folders, to keep using it). There is no import: to use a download again, unzip it into `assets/`
and run `npm run manifest` so the new terrain/skin/object shows up in the lists.

Built-in maps and skins are read-only (use **Save As** to make a copy). Textures are not set in the skin
editor; a skin keeps the `texture` lines of its `.poly` files.

## Tests

```
npm test             # node --test: unit tests, and golden tests against trajectories from the Java version
npm run smoke        # browser smoke test (needs `npm start` running in another terminal, and Chrome)
npm run smoke:editors
```

The golden tests (`test/golden`) run the same scenarios as the Java game (skier at rest, sliding off the
kicker jump, pushing a crate ...) and compare the states to `test/fixtures/golden.json`, recorded from the
Java version by `tools/java-golden/run.sh` (which compiles the Java sources into a temp folder and doesn't
touch the Java repo). The JavaScript engine matches Java to about 1e-4 over 3 simulated seconds; it uses
doubles where Java uses floats, so long runs diverge (the physics is chaotic).

## Layout

- `assets/` - the game's data files, copied unchanged from the Java repo (`tools/import-assets.sh`):
  `config/` scripts, `art/` figure definitions and skins, `terrain/` maps, `objects/`, `animations/`
  demos, `sounds/` (converted from `.au` to WAV), and a generated `manifest.json` (a static server can't
  list folders). `assets/SOURCE.txt` records which Java commit they came from.
- `src/` - the game, in modules that mirror the Java packages:
  `util`, `physics` (figures, joints, contact, `dynamics/`), `terrain` (ground, maps, objects),
  `art` (skins, link decorations), `sim` (world, simulation loop, replay), `monitor` (snow effects, crash
  handling, sound), `script` (the setup-script command interpreter), `gfx` (camera, canvas renderer,
  particles), `storage` (virtual file system, zip, download), `ui` (the page and `editors/`).
  Everything except `gfx/renderer`, `ui/`, `monitor/audio` and `storage/download` runs without a browser.
- `tools/` - dev server, asset import, sound conversion, manifest generator, a small Chrome driver for the
  smoke tests, and the Java golden-trace dumper.
- `test/` - unit tests, golden tests and fixtures.

## Differences from the Java version

- The simulation is tied to the clock (fixed time step); the Java version ran as fast as the CPU allowed.
- Skins, maps and objects are not written to disk; they are kept in memory and offered as downloads.
- Not ported (no shipped file uses them): the `billboard`, `show`, `anidump`, `showlog` and `world ls`
  commands and `linkDecor load/setname`. Everything the shipped scripts, maps, skins and demos use is
  supported (`src/script/commands.js` lists the commands).
