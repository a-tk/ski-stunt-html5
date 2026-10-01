# Ski Stunt (HTML5)

A JavaScript / HTML5-canvas port of the Ski Stunt Simulator demo, ported from the Java/AWT version in
the `ski-stunt-applet` repository. The original game is the Ski Stunt Simulator from UBC
(https://www.cs.ubc.ca/~van/sssjava/javademo.html); this is a port of that demo plus the additions
made in the Java repo (skins, a map editor, objects and an object editor).

No build step and no dependencies: plain ES modules.

## Running

```
npm start          # serves this folder at http://localhost:8080/
```

Open http://localhost:8080/ (a static server is required: browsers don't load modules or data from
`file://`). Any static server works, e.g. `python3 -m http.server 8080`.

## Tests

```
npm test           # node --test: unit tests and golden tests against the Java version
```

## Layout

- `assets/` - the game's data files, copied unchanged from the Java repo (`tools/import-assets.sh`):
  `config/` scripts, `art/` figure definitions and skins, `terrain/` maps, `objects/`, `animations/`
  demos, `sounds/` (converted to WAV), and a generated `manifest.json`.
- `src/` - the game, in modules that mirror the Java packages (`util`, `physics`, `terrain`, `art`,
  `sim`, `monitor`, `script`, `gfx`, `storage`, `ui`).
- `tools/` - dev server, asset import, sound conversion, manifest generator.
- `test/` - unit tests, golden fixtures produced from the Java version.

See `assets/SOURCE.txt` for the Java commit the data came from.
