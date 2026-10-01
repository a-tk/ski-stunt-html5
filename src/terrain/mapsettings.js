// Port of terrain/MapSettings.java: the per-map settings that can differ between maps -- the values of
// the "gnd ..." commands and the placed objects. Shared defaults come from terrain/gnd_setup.txt; a map
// overrides them in terrain/gnd_NAME.map, which the 'terrain' command runs after gnd_setup.txt.
import { tokens, num, lines } from '../util/text.js';

/** One placed object: which type, where, turned by 'rotation' degrees, scaled; optionally pushable. */
export class Placed {
  constructor(type, x, y, rotation = 0, scale = 1) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.scale = scale;
    this.dynamic = false;  // pushable (a rigid body) instead of fixed
    this.mass = 0;         // kg for a pushable object; 0 = the object type's mass
  }

  copy() {
    const p = new Placed(this.type, this.x, this.y, this.rotation, this.scale);
    p.dynamic = this.dynamic;
    p.mass = this.mass;
    return p;
  }

  command() {
    let c = `object ${this.type} ${this.x} ${this.y} ${this.rotation} ${this.scale}`;
    if (this.dynamic) c += ` dynamic${this.mass > 0 ? ` ${this.mass}` : ''}`;
    return c;
  }
}

/** terrain/gnd_NAME.txt -> terrain/gnd_NAME.map */
export const mapFile = (gndFile) => `${gndFile.endsWith('.txt') ? gndFile.slice(0, -4) : gndFile}.map`;

export class MapSettings {
  constructor() {
    this.startX = 0;
    this.startY = 1;
    this.xApplause = 10000;
    this.kp = 500;
    this.kd = 50;
    this.kpSki = 200;
    this.kdSki = 20;
    this.cf = 0.6;
    this.color = [1, 1, 1];
    this.objects = [];
  }

  /** The settings a map gets: gnd_setup.txt's values, then the map's own .map file if it has one. */
  static async load(vfs, gndFile) {
    const s = new MapSettings();
    for (const path of ['terrain/gnd_setup.txt', gndFile ? mapFile(gndFile) : null]) {
      if (!path) continue;
      const text = await vfs.readText(path);
      if (text != null) s.applyAll(text);
    }
    return s;
  }

  copy() {
    const s = new MapSettings();
    Object.assign(s, { startX: this.startX, startY: this.startY, xApplause: this.xApplause, kp: this.kp, kd: this.kd, kpSki: this.kpSki, kdSki: this.kdSki, cf: this.cf });
    s.color = this.color.slice();
    s.objects = this.objects.map((o) => o.copy());
    return s;
  }

  applyAll(text) {
    for (const line of lines(text)) {
      const l = line.trim();
      if (l.length > 0 && !l.startsWith('#')) this.apply(l);
    }
  }

  /** Applies one "gnd NAME args" or "object ..." line; anything else (comments, gnd slices ...) is ignored. */
  apply(line) {
    const t = tokens(line);
    if (t.length < 3) return;
    try {
      if (t[0] === 'object' && t.length >= 4) {
        const p = new Placed(t[1], num(t[2]), num(t[3]), t.length > 4 ? num(t[4]) : 0, t.length > 5 ? num(t[5]) : 1);
        if (t[6] === 'dynamic') {
          p.dynamic = true;
          p.mass = t.length > 7 ? num(t[7]) : 0;
        }
        this.objects.push(p);
        return;
      }
      if (t[0] !== 'gnd') return;
      const k = t[1];
      const v = num(t[2]);
      if (k === 'kp') this.kp = v;
      else if (k === 'kd') this.kd = v;
      else if (k === 'kpSki') this.kpSki = v;
      else if (k === 'kdSki') this.kdSki = v;
      else if (k === 'cf') this.cf = v;
      else if (k === 'xApplause') this.xApplause = v;
      else if (k === 'start' && t.length > 3) { this.startX = v; this.startY = num(t[3]); }
      else if (k === 'color' && t.length >= 5) this.color = [v, num(t[3]), num(t[4])];
    } catch {
      // malformed line; the game would reject it as well
    }
  }

  /** The commands that put these settings into effect (run after gnd_setup.txt); objects come last. */
  commands() {
    return [
      `gnd kp ${this.kp}`, `gnd kd ${this.kd}`, `gnd kpSki ${this.kpSki}`, `gnd kdSki ${this.kdSki}`, `gnd cf ${this.cf}`,
      `gnd color ${this.color[0]} ${this.color[1]} ${this.color[2]}`, `gnd xApplause ${this.xApplause}`,
      `gnd start ${this.startX} ${this.startY}`,
      ...this.objects.map((o) => o.command()),
    ];
  }

  /** The .map file text. */
  toText() {
    return `# per-map settings, run after terrain/gnd_setup.txt\r\n${this.commands().join('\r\n')}\r\n`;
  }
}
