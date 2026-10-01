// Port of terrain/ObjectType.java and ObjectLibrary.java: a reusable object (a crate, a ramp ...)
// stored as objects/NAME.obj -- header commands, then the shape as "x y friction [snow]" lines in
// local coordinates (origin = where the object is placed, y up, clockwise).
import { tokens, num } from '../util/text.js';
import { MapData, Pt } from './mapdata.js';

export const OBJECTS_DIR = 'objects/';
export const objectPath = (name) => `${OBJECTS_DIR}${name}.obj`;

/** A 1 x 1 box standing on its base, with terrain-like friction and snow-spray. */
export function box() {
  const d = new MapData();
  for (const [x, y] of [[-0.5, 0], [-0.5, 1], [0.5, 1], [0.5, 0]]) {
    const p = new Pt(x, y, 0.4);
    p.setExtra0(0.5);
    d.pts.push(p);
  }
  return d;
}

export class ObjectType {
  constructor() {
    this.name = 'object';
    this.fill = [170, 120, 60];
    this.outline = [60, 40, 20];
    this.outlineWidth = 1;
    this.textureFile = null;
    this.texture = null;       // a loaded image, or null
    this.textureScale = 1;
    this.mass = 10;            // kg, when placed as a pushable object
    this.shape = box();
  }

  /** Parses .obj text; loadImage(path) -> Promise<image|null> is used for the texture. */
  static async parse(text, dir, loadImage) {
    const t = new ObjectType();
    for (const line of text.split(/\r\n|\n|\r/)) {
      const tok = tokens(line);
      if (tok.length === 0) continue;
      try {
        const cmd = tok[0];
        if (cmd === 'name' && tok.length > 1) t.name = line.trim().substring(4).trim();
        else if (cmd === 'color') t.fill = [num(tok[1]), num(tok[2]), num(tok[3])];
        else if (cmd === 'outline') {
          t.outline = [num(tok[1]), num(tok[2]), num(tok[3])];
          if (tok.length > 4) t.outlineWidth = num(tok[4]);
        } else if (cmd === 'mass') t.mass = Math.max(0.1, num(tok[1]));
        else if (cmd === 'texture') {
          t.textureFile = tok[1];
          if (tok.length > 2) t.textureScale = num(tok[2]);
          t.texture = loadImage ? await loadImage(dir + tok[1]) : null;
        }
      } catch {
        console.log(`Warning: object file: bad line: ${line.trim()}`);
      }
    }
    t.shape = MapData.parse(text);
    return t;
  }

  /** The .obj file text. */
  toText() {
    let s = `name ${this.name}\r\n`;
    s += `color ${this.fill.join(' ')}\r\n`;
    s += `outline ${this.outline.join(' ')} ${this.outlineWidth}\r\n`;
    if (this.textureFile != null) s += `texture ${this.textureFile} ${this.textureScale}\r\n`;
    s += `mass ${this.mass}\r\n`;
    s += this.shape.toText('shape: x y friction [snow-spray], local coordinates, clockwise');
    return s;
  }

  /** Loads objects/NAME.obj, or null (with a warning) if there is none or it is unusable. */
  static async load(world, name) {
    const text = await world.vfs.readText(objectPath(name));
    if (text == null) { console.log(`Warning: unable to load object ${name}`); return null; }
    const t = await ObjectType.parse(text, OBJECTS_DIR, (p) => world.loadImage(p));
    if (t.shape.pts.length < 3) { console.log(`Warning: object ${name} has fewer than 3 points`); return null; }
    return t;
  }
}

/** Names of the installed objects (built-in and user-made), sorted. */
export async function listObjects(vfs) {
  const m = await vfs.manifest();
  const names = new Set(m.objects);
  for (const f of vfs.userFiles()) {
    const mm = /^objects\/([^/]+)\.obj$/.exec(f);
    if (mm) names.add(mm[1]);
  }
  return [...names].sort();
}
