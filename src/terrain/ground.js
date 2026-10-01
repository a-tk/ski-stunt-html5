// Port of terrain/Ground.java: the terrain outline (a closed, clockwise polygon) with per-point
// friction and extra data, plus the geometry queries the contact code needs.
import { BBox } from '../util/bbox.js';
import { Vector3 } from '../util/vector3.js';
import { ptInPoly } from '../util/geom.js';
import { tokens, num, lines } from '../util/text.js';
import { GroundSlice } from './groundslice.js';

export const MaxNumExtraData = 4;

/** One point of the ground outline. */
export class GndPt {
  constructor() {
    this.p = [0, 0];
    this.cf = 0;
    this.norm = [0, 0];
    this.len = 0;
    this.numExtraData = 0;
    this.extraData = new Array(MaxNumExtraData).fill(0);
  }
}

/** Where the path last->p crosses segment a-b: writes the crossing to cp and its parameter along a-b to tOut[0]. */
function intersect(last, p, a, b, cp, tOut) {
  const dx = p[0] - last[0];
  const dy = p[1] - last[1];
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const den = dx * ey * -1 + dy * ex;
  if (den === 0) return false;
  const rx = a[0] - last[0];
  const ry = a[1] - last[1];
  const s = (rx * ey * -1 + ry * ex) / den;
  tOut[0] = (dx * ry - dy * rx) / den;
  const eps = 1.0e-6;
  if (s > -eps && s < 1 + eps && tOut[0] > -eps && tOut[0] < 1 + eps) {
    const u = 1 - tOut[0];
    cp[0] = a[0] * u + b[0] * tOut[0];
    cp[1] = a[1] * u + b[1] * tOut[0];
    return true;
  }
  return false;
}

export class Ground {
  constructor() {
    this.show = true;
    this.cfric = 0.6;
    this.kp = 500;
    this.kd = 50;
    this.kpSki = 200;
    this.kdSki = 20;
    this.xApplause = 10000;
    this.startX = 0;
    this.startY = 1;
    this.pts = [];
    this.polygonPts = [];
    this.xPoints = [];
    this.yPoints = [];
    this.nPoints = 0;
    this.bbox = new BBox();
    this.showSlices = false;
    this.numSlices = 1;
    this.sliceWidth = 0;
    this.slices = null;
    this.color = null;
  }

  findSlice(x) {
    return Math.trunc((x - this.bbox.ul[0]) / this.sliceWidth);
  }

  /** Reads "x y cf [extra...]" lines (see the Java Ground.read for the rules). */
  read(text) {
    let minX = 9999; let maxX = -9999; let minY = 9999; let maxY = -9999;
    let last = null;
    let first = null;
    for (const line of lines(text)) {
      const t = tokens(line);
      if (t.length === 0) continue;
      if (t[0] === '#' || t.length < 3) continue;
      const pt = new GndPt();
      pt.p[0] = num(t[0]);
      pt.p[1] = num(t[1]);
      pt.cf = num(t[2]);
      if (last != null) {
        last.norm[0] = last.p[1] - pt.p[1];
        last.norm[1] = pt.p[0] - last.p[0];
        const len = Math.sqrt(last.norm[0] * last.norm[0] + last.norm[1] * last.norm[1]);
        if (len > 0) { last.norm[0] /= len; last.norm[1] /= len; }
        last.len = len;
        this.pts.push(last);
      } else {
        first = pt;
      }
      last = pt;
      if (pt.p[0] < minX) minX = pt.p[0];
      if (pt.p[0] > maxX) maxX = pt.p[0];
      if (pt.p[1] < minY) minY = pt.p[1];
      if (pt.p[1] > maxY) maxY = pt.p[1];
      pt.numExtraData = 0;
      for (let i = 3; i < t.length; i++) {
        pt.extraData[pt.numExtraData] = num(t[i]);
        ++pt.numExtraData;
        if (pt.numExtraData >= MaxNumExtraData) break;
      }
      this.polygonPts.push(new Vector3(pt.p[0], pt.p[1]));
    }
    if (last == null) {
      this.nPoints = 0; this.xPoints = []; this.yPoints = [];
      return;
    }
    // the closing segment, from the last point back to the first
    last.norm[0] = last.p[1] - first.p[1];
    last.norm[1] = first.p[0] - last.p[0];
    const len = Math.sqrt(last.norm[0] * last.norm[0] + last.norm[1] * last.norm[1]);
    if (len > 0) { last.norm[0] /= len; last.norm[1] /= len; }
    last.len = len;
    this.pts.push(last);
    this.nPoints = this.pts.length;
    this.xPoints = this.pts.map((p) => p.p[0]);
    this.yPoints = this.pts.map((p) => p.p[1]);
    this.bbox.ul[0] = minX;
    this.bbox.ul[1] = maxY;
    this.bbox.w = maxX - minX;
    this.bbox.h = maxY - minY;
  }

  inside(p) {
    if (!this.bbox.inside(p)) return false;
    if (this.numSlices > 1) return this.slices[this.findSlice(p[0])].inside(p);
    return ptInPoly(this.polygonPts, p) === 1;
  }

  setColor(r, g, b) { this.color = [r, g, b]; }

  /** Splits the ground into n vertical slices (each widened by overlap) for faster queries. */
  slice(n, overlap) {
    this.numSlices = n;
    if (n <= 1) { this.slices = null; return; }
    this.slices = [];
    this.sliceWidth = this.bbox.w / n;
    let x1 = this.bbox.ul[0];
    let x2 = x1 + this.sliceWidth;
    for (let i = 0; i < n; i++) {
      const s = new GroundSlice();
      s.init(x1, x2, overlap, this.polygonPts);
      this.slices.push(s);
      x1 = x2;
      x2 = this.bbox.ul[0] + (i + 2) * this.sliceWidth;
    }
  }

  bboxIntersects(b) {
    if (this.bbox.intersects(b)) {
      if (this.numSlices <= 1) return true;
      let s0 = this.findSlice(b.ul[0]);
      let s1 = this.findSlice(b.ul[0] + b.w);
      if (s0 < 0) s0 = 0;
      if (s1 >= this.numSlices) s1 = this.numSlices - 1;
      for (let i = s0; i <= s1; i++) if (this.slices[i].bbox.intersects(b)) return true;
    }
    return false;
  }

  /**
   * The first ground segment crossed by the path last->p: writes the crossing point (cp), the segment
   * normal (norm), the friction there (cfOut[0]) and the segment index (segOut[0]).
   */
  contactPt(last, p, cp, norm, cfOut, segOut) {
    if (this.nPoints < 2) return false;
    segOut[0] = 0;
    if (this.numSlices > 1) {
      const slice = this.slices[this.findSlice(p[0])];
      for (const si of slice.gndSegs) {
        const a = this.pts[si];
        const b = this.pts[(si + 1) % this.pts.length];
        const t = [0];
        if (intersect(last, p, a.p, b.p, cp, t)) {
          norm[0] = a.norm[0]; norm[1] = a.norm[1];
          cfOut[0] = t[0] * b.cf + (1 - t[0]) * a.cf;
          segOut[0] = si;
          return true;
        }
      }
    }
    let a = this.pts[0];
    for (let i = 1; i < this.pts.length; i++) {
      const b = this.pts[i];
      const t = [0];
      if (intersect(last, p, a.p, b.p, cp, t)) {
        norm[0] = a.norm[0]; norm[1] = a.norm[1];
        cfOut[0] = t[0] * b.cf + (1 - t[0]) * a.cf;
        return true;
      }
      a = b;
      segOut[0]++;
    }
    const b = this.pts[0];
    const t = [0];
    if (intersect(last, p, a.p, b.p, cp, t)) {
      norm[0] = a.norm[0]; norm[1] = a.norm[1];
      cfOut[0] = t[0] * b.cf + (1 - t[0]) * a.cf;
      return true;
    }
    return false;
  }

  /**
   * Slides a contact anchor along the ground: from pos (on segment seg) by distance in the direction
   * of vel, wrapping around vertices. Writes the new position/normal/friction/segment and returns the
   * distance actually moved (or -1 for no distance).
   */
  traverse(seg, pos, vel, dist, outPos, outNorm, outCf, outSeg) {
    let traveled = 0;
    outSeg[0] = seg;
    const n = this.nPoints;
    let a = this.pts[outSeg[0]];
    let b = this.pts[(outSeg[0] + 1) % n];
    const edge = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
    let along = edge[0] * vel[0] + edge[1] * vel[1];
    let dir;
    let target; // 'a' or 'b'
    if (along > 0) {
      dir = 1; target = 'b';
    } else if (along < 0) {
      dir = -1; target = 'a';
    } else {
      // not moving along the segment: stay put
      outPos[0] = pos[0]; outPos[1] = pos[1];
      outNorm[0] = a.norm[0]; outNorm[1] = a.norm[1];
      const dx = pos[0] - a.p[0];
      const dy = pos[1] - a.p[1];
      let t = Math.sqrt(dx * dx + dy * dy) / a.len;
      if (t > 1) t = 1;
      outCf[0] = a.cf * (1 - t) + t * b.cf;
      return traveled;
    }
    while (dist > 0) {
      const tp = target === 'a' ? a : b;
      const dx = tp.p[0] - pos[0];
      const dy = tp.p[1] - pos[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= dist) {
        const el = Math.sqrt(edge[0] * edge[0] + edge[1] * edge[1]);
        if (el > 0) { edge[0] /= el; edge[1] /= el; }
        outPos[0] = pos[0] + dist * edge[0] * dir;
        outPos[1] = pos[1] + dist * edge[1] * dir;
        outNorm[0] = a.norm[0]; outNorm[1] = a.norm[1];
        const px = pos[0] - a.p[0];
        const py = pos[1] - a.p[1];
        let t = Math.sqrt(px * px + py * py) / a.len;
        if (t > 1) t = 1;
        outCf[0] = a.cf * (1 - t) + t * b.cf;
        return traveled + dist;
      }
      dist -= d;
      traveled += d;
      pos[0] = tp.p[0];
      pos[1] = tp.p[1];
      if (dir > 0) {
        a = b;
        outSeg[0] = (outSeg[0] + 1) % n;
        b = this.pts[(outSeg[0] + 1) % n];
      } else {
        b = a;
        outSeg[0] = (outSeg[0] + n - 1) % n;
        a = this.pts[outSeg[0]];
      }
      edge[0] = b.p[0] - a.p[0];
      edge[1] = b.p[1] - a.p[1];
      along = edge[0] * vel[0] + edge[1] * vel[1];
      if (along * dir <= 0) {
        // the motion turns around at the vertex: stop there
        if (dir > 0) {
          outPos[0] = a.p[0]; outPos[1] = a.p[1];
          outCf[0] = a.cf;
          const prev = this.pts[(outSeg[0] + n - 1) % n];
          outNorm[0] = a.norm[0] + prev.norm[0];
          outNorm[1] = a.norm[1] + prev.norm[1];
        } else {
          outPos[0] = b.p[0]; outPos[1] = b.p[1];
          outCf[0] = b.cf;
          outNorm[0] = a.norm[0] + b.norm[0];
          outNorm[1] = a.norm[1] + b.norm[1];
        }
        const nl = Math.sqrt(outNorm[0] * outNorm[0] + outNorm[1] * outNorm[1]);
        if (nl > 0) { outNorm[0] /= nl; outNorm[1] /= nl; }
        return traveled;
      }
    }
    return -1;
  }

  /** Position of p along segment seg, 0..1 (by x, or by y for a vertical segment). */
  segParam(seg, p) {
    const i = seg % this.nPoints;
    const j = (i + 1) % this.nPoints;
    let t = 0;
    let d = this.xPoints[j] - this.xPoints[i];
    if (d !== 0) {
      t = (p[0] - this.xPoints[i]) / d;
    } else {
      d = this.yPoints[j] - this.yPoints[i];
      if (d !== 0) t = (p[1] - this.yPoints[i]) / d;
    }
    return t;
  }

  /** Extra data column k along segment seg at parameter t (def if a point has no such column). */
  extraData(seg, t, k, def) {
    const i = seg % this.nPoints;
    const j = (i + 1) % this.nPoints;
    const a = this.pts[i];
    const b = this.pts[j];
    let va = def; let vb = def;
    if (a.numExtraData > k) va = a.extraData[k];
    if (b.numExtraData > k) vb = b.extraData[k];
    return va * (1 - t) + t * vb;
  }

  numPoints() { return this.pts.length; }
  boundingBox() { return this.bbox; }

  draw(r) {
    if (!this.show) return;
    const c = this.color;
    const css = c ? `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})` : '#fff';
    r.fillPolygon(this.xPoints, this.yPoints, { color: css });
    if (this.numSlices > 1 && this.showSlices) for (const s of this.slices) s.draw(r);
  }
}
