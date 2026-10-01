// Writes assets/manifest.json: the lists a static server can't give us (terrains, skins, objects, demos).
// node tools/make-manifest.mjs
import { readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const ls = async (d) => { try { return (await readdir(path.join(assets, d))).sort(); } catch { return []; } };
const isDir = async (p) => (await stat(path.join(assets, p))).isDirectory();

const terrainFiles = await ls('terrain');
const terrains = terrainFiles
  .filter((f) => /^gnd_.*\.txt$/.test(f) && f !== 'gnd_setup.txt')
  .map((f) => ({ file: `terrain/${f}`, map: terrainFiles.includes(f.replace(/\.txt$/, '.map')) }));

const skins = [];
for (const d of await ls('art/skins')) {
  if (!(await isDir(`art/skins/${d}`))) continue;
  const files = await ls(`art/skins/${d}`);
  if (files.includes('skin.txt')) skins.push({ dir: d, files });
}

const objects = (await ls('objects')).filter((f) => f.endsWith('.obj')).map((f) => f.replace(/\.obj$/, ''));
const objectFiles = await ls('objects');
const demos = (await ls('animations')).filter((f) => f.endsWith('.ani')).map((f) => `animations/${f}`);
const sounds = (await ls('sounds')).filter((f) => f.endsWith('.wav')).map((f) => `sounds/${f}`);

await writeFile(path.join(assets, 'manifest.json'), JSON.stringify({ terrains, skins, objects, objectFiles, demos, sounds }, null, 1) + '\n');
console.log(`manifest: ${terrains.length} terrains, ${skins.length} skins, ${objects.length} objects, ${demos.length} demos, ${sounds.length} sounds`);
