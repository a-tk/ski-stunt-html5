import { LinkPoint } from './linkpoint.js';

/** The list of points being built for the next link (port of physics/PList.java). */
export class PList {
  constructor() { this.points = []; }
  npts() { return this.points.length; }
  reset() { this.points = []; }
  delone() { if (this.points.length > 1) this.points.pop(); }
  newpt(x, y, bodyCFric, tag) {
    const p = new LinkPoint();
    p.p[0] = x; p.p[1] = y;
    p.ploc[0] = 0; p.ploc[1] = 0;
    p.bodyCFric = bodyCFric;
    p.tag = tag ?? null;
    this.points.push(p);
    return 0;
  }
  getPoints() { return this.points; }
  clone() { const c = new PList(); c.points = this.points.slice(); return c; }
}
