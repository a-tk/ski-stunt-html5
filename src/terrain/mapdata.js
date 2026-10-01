// Port of terrain/MapData.java: an outline as stored in terrain/gnd_*.txt and objects/*.obj --
// one point per line, "x y cf [extra0 ...]", a closed clockwise polygon.
import { tokens, num, lines } from '../util/text.js';

export const MAX_EXTRA = 4;

export class Pt {
  constructor(x, y, cf) { this.x = x; this.y = y; this.cf = cf; this.extra = []; }
  copy() { const p = new Pt(this.x, this.y, this.cf); p.extra = this.extra.slice(); return p; }
  extra0() { return this.extra.length > 0 ? this.extra[0] : 0; }
  setExtra0(v) { if (this.extra.length === 0) this.extra = [0]; this.extra[0] = v; }
}

export class MapData {
  constructor() { this.pts = []; }

  /** A flat box, 200 wide, with the surface at y = 0. */
  static flat() {
    const d = new MapData();
    for (const [x, y] of [[-100, -40], [-100, 0], [100, 0], [100, -40]]) {
      const p = new Pt(x, y, 0);
      p.setExtra0(0.5);
      d.pts.push(p);
    }
    return d;
  }

  /** Reads the format the game reads: '#' lines and lines with fewer than 3 numbers are skipped. */
  static parse(text) {
    const d = new MapData();
    for (const line of lines(text)) {
      const t = tokens(line);
      if (t.length < 3 || line.trim().startsWith('#')) continue;
      try {
        const p = new Pt(num(t[0]), num(t[1]), num(t[2]));
        const ne = Math.min(t.length - 3, MAX_EXTRA);
        for (let i = 0; i < ne; i++) p.extra.push(num(t[3 + i]));
        d.pts.push(p);
      } catch {
        // not a point line; the game would reject it too
      }
    }
    return d;
  }

  copy() { const d = new MapData(); d.pts = this.pts.map((p) => p.copy()); return d; }

  /** The file text, with CRLF line endings like the other game files. */
  toText(header = 'map outline: x y friction [snow-spray]') {
    let s = `# ${header}\r\n`;
    for (const p of this.pts) {
      s += `${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.cf}`;
      for (const e of p.extra) s += ` ${e}`;
      s += '\r\n';
    }
    return s;
  }

  /** Twice the signed area; negative for a clockwise outline, which is what the game expects. */
  signedArea2() {
    let a = 0;
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const q = this.pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a;
  }

  isClockwise() { return this.signedArea2() < 0; }
}
