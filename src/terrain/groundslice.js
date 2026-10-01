// Port of terrain/GroundSlice.java: the part of the ground outline inside a vertical strip,
// used to speed up point-in-ground tests and contact lookups.
import { BBox } from '../util/bbox.js';
import { Vector3 } from '../util/vector3.js';
import { ptInPoly } from '../util/geom.js';

const Outside = -1;
const Inside = 1;
const OnBound = 0;

function state(x, lo, hi) {
  if (!(x < lo) && !(x > hi)) return x !== lo && x !== hi ? Inside : OnBound;
  return Outside;
}

/** Point where segment a-b crosses the vertical line at x (strictly between its ends), or null. */
function intersect(a, b, x) {
  let p = a; let q = b;
  if (a.x > b.x) { p = b; q = a; }
  if (p.x < x && q.x > x) {
    const dy = q.y - p.y;
    const dx = q.x - p.x;
    const t = x - p.x;
    return new Vector3(x, p.y + dy * (t / dx));
  }
  return null;
}

export class GroundSlice {
  constructor() {
    this.startX = 0;
    this.endX = 0;
    this.gndSegs = [];
    this.bbox = new BBox();
    this.polygonPts = [];
  }

  inside(p) {
    if (!this.bbox.inside(p)) return false;
    return ptInPoly(this.polygonPts, p) === 1;
  }

  /** Clips the ground polygon pts to the strip [x1 - overlap, x2 + overlap]. */
  init(x1, x2, overlap, pts) {
    x1 -= overlap;
    x2 += overlap;
    this.startX = x1;
    this.endX = x2;
    let prevIdx = pts.length - 1;
    let prev = pts[prevIdx];
    let prevState = state(prev.x, x1, x2);
    for (let i = 0; i < pts.length; prevIdx = i++) {
      const cur = pts[i];
      const curState = state(cur.x, x1, x2);
      let added = false;
      if (curState !== Inside && curState !== OnBound) {
        if (prevState === Inside) {
          let h = intersect(prev, cur, x1);
          if (h == null) h = intersect(prev, cur, x2);
          if (h != null) { this.polygonPts.push(h); added = true; }
        } else if (prevState === Outside) {
          const h1 = intersect(prev, cur, x1);
          const h2 = intersect(prev, cur, x2);
          if (h1 != null && h2 != null) {
            added = true;
            const d1 = Math.abs(h1.x - prev.x);
            const d2 = Math.abs(h2.x - prev.x);
            if (d1 < d2) { this.polygonPts.push(h1); this.polygonPts.push(h2); }
            else { this.polygonPts.push(h2); this.polygonPts.push(h1); }
          } else {
            if (h1 != null) { this.polygonPts.push(h1); added = true; }
            if (h2 != null) { this.polygonPts.push(h2); added = true; }
          }
        } else if (prevState === OnBound) {
          if (prev.x === x1) {
            const h = intersect(prev, cur, x2);
            if (h != null) { this.polygonPts.push(h); added = true; }
          } else if (prev.x === x2) {
            const h = intersect(prev, cur, x1);
            if (h != null) { this.polygonPts.push(h); added = true; }
          }
        }
      } else {
        if (prevState === Outside) {
          let h = intersect(prev, cur, x1);
          if (h != null && h.x !== cur.x) { this.polygonPts.push(h); added = true; }
          h = intersect(prev, cur, x2);
          if (h != null && h.x !== cur.x) { this.polygonPts.push(h); added = true; }
        }
        this.polygonPts.push(new Vector3(cur.x, cur.y));
      }
      let keep = false;
      if (curState === Inside) keep = true;
      else if (curState === Outside) { if (added) keep = true; }
      else if (added || prevState !== Outside) keep = true;
      if (keep) this.gndSegs.push(prevIdx);
      prev = cur;
      prevState = curState;
    }
    let minX = 9999; let maxX = -9999; let minY = 9999; let maxY = -9999;
    for (const p of this.polygonPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    this.bbox.ul[0] = minX;
    this.bbox.ul[1] = maxY;
    this.bbox.w = maxX - minX;
    this.bbox.h = maxY - minY;
  }

  draw(r) {
    r.strokePolygon(this.polygonPts.map((p) => p.x), this.polygonPts.map((p) => p.y), { color: '#000', width: 1 });
  }
}
