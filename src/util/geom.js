// Geometry helpers ported from util/Util.java.
import { Vector3 } from './vector3.js';

/** Crossing-number point-in-polygon test; poly is an array of {x, y}. Returns 1 inside, 0 outside. */
export function ptInPoly(poly, p) {
  let inside = false;
  const x = p[0];
  const y = p[1];
  const n = poly.length;
  let v0 = poly[n - 1];
  let ycur = v0.y >= y;
  for (let i = 0; i < n; i++) {
    const v1 = poly[i];
    const ynext = v1.y >= y;
    if (ycur !== ynext) {
      const xcur = v0.x >= x;
      if (xcur === (v1.x >= x)) {
        if (xcur) inside = !inside;
      } else if (v1.x - (v1.y - y) * (v0.x - v1.x) / (v0.y - v1.y) >= x) {
        inside = !inside;
      }
    }
    ycur = ynext;
    v0 = v1;
  }
  return inside ? 1 : 0;
}

/** Moment of inertia of a right triangle (legs a, b) about the vertex opposite... (Util.rt_tri_iner). */
export function rtTriIner(a, b) {
  const v2 = b * a * a * a / 4;
  const v3 = b * b / (3 * a * a);
  return v2 * (1 + v3);
}

/** Moment of inertia contribution of triangle (p0, p1, p2) about p0 (Util.iner_tri). */
export function inerTri(p0, p1, p2) {
  const z = new Vector3(0, 0, 1);
  const e12 = p1.subtract(p2);
  const nrm = z.cross(e12).normalize();
  const a = p1.subtract(p0);
  const b = p2.subtract(p0);
  const h = a.dot(nrm);
  const hv = nrm.mult(h);
  const a1 = a.subtract(hv);
  const s1 = a1.dot(e12) > 0 ? a1.mag() : -1 * a1.mag();
  const i1 = rtTriIner(h, s1);
  const b1 = b.subtract(hv);
  const s2 = b1.dot(e12) < 0 ? b1.mag() : -1 * b1.mag();
  const i2 = rtTriIner(h, s2);
  return i1 + i2;
}
