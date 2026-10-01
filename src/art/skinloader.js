// Port of art/SkinLoader.java: puts a skin (art/skins/NAME/skin.txt) onto the skier and ski figures.
//
// skin.txt (files in draw order, later ones paint over earlier ones):
//   name Neon                   the label shown in the dropdown
//   poly torso.poly [decorName] a decoration for the skier
//   ski  dski.poly              a decoration for each detached ski
import { tokens, lines } from '../util/text.js';
import { LinkDecor } from './linkdecor.js';

export const SKINS_DIR = 'art/skins/';
export const SKIER = 'skier';
export const SKI_FIGS = ['drski', 'dlski'];

/** Non-comment, trimmed lines of a file, or null if it can't be read. */
async function readLines(vfs, path) {
  const text = await vfs.readText(path);
  if (text == null) return null;
  return lines(text).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
}

/** Skin directory names (built-in and user-made), sorted. */
export async function listSkins(vfs) {
  const names = new Set((await vfs.manifest()).skins.map((s) => s.dir));
  for (const f of vfs.userFiles()) {
    const m = /^art\/skins\/([^/]+)\/skin\.txt$/.exec(f);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** The 'name' in a skin's manifest, or the directory name. */
export async function skinDisplayName(vfs, skin) {
  const ls = await readLines(vfs, `${SKINS_DIR}${skin}/skin.txt`);
  for (const l of ls ?? []) if (l.startsWith('name ')) return l.substring(5).trim();
  return skin;
}

export class SkinLoader {
  /** Replaces the decors on the skier and ski figures with those of the named skin. */
  static async apply(world, skin) {
    const dir = `${SKINS_DIR}${skin}/`;
    const ls = await readLines(world.vfs, `${dir}skin.txt`);
    if (ls == null) { console.log(`Error: unable to read skin ${skin}`); return false; }
    const skier = world.findArtfig(SKIER);
    const oldShow = new Map();
    for (const f of [skier, ...SKI_FIGS.map((n) => world.findArtfig(n))]) clear(f, oldShow);
    for (const line of ls) {
      const t = tokens(line);
      if (t[0] === 'poly' && t.length > 1) {
        await load(world, skier, dir + t[1], t[2] ?? null, oldShow);
      } else if (t[0] === 'ski' && t.length > 1) {
        for (const n of SKI_FIGS) await load(world, world.findArtfig(n), dir + t[1], null, oldShow);
      }
    }
    return true;
  }
}

/** Removes all decors from a figure, remembering each named decor's visibility. */
function clear(fig, oldShow) {
  if (!fig) return;
  for (const d of fig.linkDecors) if (d.name != null) oldShow.set(d.name, d.show);
  fig.linkDecors = [];
}

async function load(world, fig, path, decorName, oldShow) {
  if (!fig) return;
  fig.captureDecorPose();
  const decor = await LinkDecor.load(path, world, fig.links, fig.decorPose);
  if (!decor) { console.log(`Error: unable to init link decor ${path}`); return; }
  if (decorName != null) {
    decor.name = decorName;
    if (oldShow.has(decorName)) decor.show = oldShow.get(decorName);
  }
  fig.linkDecors.push(decor);
}
