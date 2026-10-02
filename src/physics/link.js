// Port of physics/Link.java: one rigid link of an articulated figure.
// Angles (theta, thetaLoc) are in degrees; positions are world units (y up).
import { NOVAL, M_PI } from '../util/math.js';
import { BBox } from '../util/bbox.js';
import { Vector3 } from '../util/vector3.js';
import { inerTri, ptInPoly } from '../util/geom.js';

export class Link {
  constructor() {
    this.plist = null;
    this.num = -1;
    this.inum = -1;
    this.cnum = -1;
    this.parent = -1;
    this.children = [];
    this.com = [NOVAL, NOVAL];
    this.comLoc = [0, 0];
    this.org = [NOVAL, NOVAL];
    this.orgLoc = [0, 0];
    this.fix = [NOVAL, NOVAL];
    this.fixLoc = [0, 0];
    this.fixpt = 0;
    this.theta = 0;
    this.thetaLoc = 0;
    this.orgv = [0, 0];
    this.thetav = 0;
    this.thetavLoc = 0;
    this.cth = 0;
    this.sth = 0;
    this.inerCom = 1;
    this.area = 1;
    this.mass = 1;
    this.density = 200;
    this.bbox = new BBox();
    this.pool = null;
  }


  delChild(i) {
    const k = this.children.indexOf(i);
    if (k >= 0) this.children.splice(k, 1);
  }

  addChild(i) { this.children.push(i); }

  updateMass(m) {
    const old = this.mass;
    this.mass = m;
    this.density = this.mass / this.area;
    this.inerCom *= this.mass / old;
  }

  updateDensity(d) {
    const old = this.density;
    this.density = d;
    this.mass = this.area * this.density;
    this.inerCom *= this.density / old;
  }

  getMass() { return this.mass; }
  assignParent(p) { this.parent = p; }

  /** Velocity of a point given in this link's frame. */
  ptVelocity(ploc, out) {
    const rx = ploc[0] * this.cth - ploc[1] * this.sth;
    const ry = ploc[0] * this.sth + ploc[1] * this.cth;
    out[0] = this.orgv[0] - this.thetav * ry;
    out[1] = this.orgv[1] + this.thetav * rx;
  }

  globToLoc(g, out) {
    const dx = g[0] - this.org[0];
    const dy = g[1] - this.org[1];
    out[0] = dx * this.cth + dy * this.sth;
    out[1] = -dx * this.sth + dy * this.cth;
  }

  vecGlobToLoc(g, out) {
    const x = g[0];
    const y = g[1];
    out[0] = x * this.cth + y * this.sth;
    out[1] = -x * this.sth + y * this.cth;
  }

  locToGlob(l, out) {
    out[0] = this.org[0] + l[0] * this.cth - l[1] * this.sth;
    out[1] = this.org[1] + l[0] * this.sth + l[1] * this.cth;
  }

  vecLocToGlob(l, out) {
    out[0] = l[0] * this.cth - l[1] * this.sth;
    out[1] = l[0] * this.sth + l[1] * this.cth;
  }

  /** Adds force (fx, fy) at world point p to f (3 floats per link: Fx, Fy, torque about the origin). */
  applyForce(p, fx, fy, f) {
    const i = 3 * (this.cnum - 1);
    const rx = p[0] - this.org[0];
    const ry = p[1] - this.org[1];
    f[i] += fx;
    f[i + 1] += fy;
    f[i + 2] += fy * rx - fx * ry;
  }

  /** Recomputes world positions of this link and its children from the local state. */
  convertGlobal() {
    const par = this.parent !== -1 ? this.pool[this.parent] : null;
    this.theta = par ? par.theta + this.thetaLoc : this.thetaLoc;
    const rad = this.theta * M_PI / 180;
    this.cth = Math.cos(rad);
    this.sth = Math.sin(rad);
    if (!par) {
      this.org[0] = this.orgLoc[0];
      this.org[1] = this.orgLoc[1];
    } else {
      par.locToGlob(this.orgLoc, this.org);
    }
    this.bbox.buildInit();
    for (const pt of this.plist.points) {
      this.locToGlob(pt.ploc, pt.p);
      this.bbox.addPoint(pt.p[0], pt.p[1]);
    }
    this.bbox.buildEnd();
    this.locToGlob(this.comLoc, this.com);
    if (this.fixpt !== 0) this.locToGlob(this.fixLoc, this.fix);
    for (const c of this.children) this.pool[c].convertGlobal();
  }

  /** Derives the local frame (and physical parameters) from the world coordinates the link was built with. */
  convertLocal(reset) {
    if (reset !== 0) {
      this.theta = 0;
      this.org[0] = 0;
      this.org[1] = 0;
    }
    const rad = this.theta * M_PI / 180;
    this.cth = Math.cos(rad);
    this.sth = Math.sin(rad);
    if (this.parent === -1) {
      this.orgLoc[0] = this.org[0];
      this.orgLoc[1] = this.org[1];
    } else {
      this.pool[this.parent].globToLoc(this.org, this.orgLoc);
    }
    for (const pt of this.plist.points) this.globToLoc(pt.p, pt.ploc);
    this.physParams();
    this.globToLoc(this.com, this.comLoc);
    if (this.fixpt !== 0) this.globToLoc(this.fix, this.fixLoc);
    for (const c of this.children) this.pool[c].convertLocal(reset);
  }

  /** Assigns dof numbers (cnum) depth-first. */
  buildDof(counter) {
    this.cnum = counter + 1;
    for (const c of this.children) this.pool[c].buildDof(this.cnum);
  }

  /** Link and joint velocities from the state vector (x, vx, y, vy, th0, w0, th1, w1, ...). */
  linkVelocity(state) {
    const par = this.parent !== -1 ? this.pool[this.parent] : null;
    this.theta = par ? par.theta + this.thetaLoc : this.thetaLoc;
    const rad = this.theta * M_PI / 180;
    this.cth = Math.cos(rad);
    this.sth = Math.sin(rad);
    const k = 2 * (this.cnum + 1) + 1;
    this.thetavLoc = state[k];
    if (!par) {
      this.thetav = this.thetavLoc;
      this.orgv[0] = state[1];
      this.orgv[1] = state[3];
    } else {
      this.thetav = par.thetav + this.thetavLoc;
      par.ptVelocity(this.orgLoc, this.orgv);
    }
    for (const c of this.children) this.pool[c].linkVelocity(state);
  }

  /** Whether a world point is inside the link's outline. */
  inside(p) {
    const poly = this.plist.points.map((pt) => new Vector3(pt.p[0], pt.p[1]));
    return ptInPoly(poly, p);
  }

  /**
   * Area, center of mass, mass and inertia from the outline. This is a faithful port, including the
   * original's quirk that the first loop measures every point against the FIRST point.
   */
  physParams() {
    let a = 0; let b = 0; let c = 0; let d = 0;
    const pts = this.plist.points;
    if (pts.length > 0) {
      let ref = pts[0];
      for (const pt of pts) {
        const x1 = pt.p[0]; const y1 = pt.p[1];
        const x0 = ref.p[0]; const y0 = ref.p[1];
        if (x1 - x0 !== 0) {
          const s = (y1 - y0) / (x1 - x0);
          const t = y0 - x0 * s;
          a += s / 2 * (x1 * x1 - x0 * x0) + t * (x1 - x0);
          c += s / 3 * (x1 * x1 * x1 - x0 * x0 * x0) + t / 2 * (x1 * x1 - x0 * x0);
        }
        if (y1 - y0 !== 0) {
          const s = (x1 - x0) / (y1 - y0);
          const t = x0 - y0 * s;
          b += s / 2 * (y1 * y1 - y0 * y0) + t * (y1 - y0);
          d += s / 3 * (y1 * y1 * y1 - y0 * y0 * y0) + t / 2 * (y1 * y1 - y0 * y0);
        }
      }
      this.area = Math.abs(a);
      this.mass = this.density * this.area;
      this.com[0] = c / a;
      this.com[1] = d / b;
      let sum = 0;
      ref = pts[0];
      for (const pt of pts) {
        const com = new Vector3(this.com[0], this.com[1]);
        sum += inerTri(com, new Vector3(ref.p[0], ref.p[1]), new Vector3(pt.p[0], pt.p[1]));
        ref = pt;
      }
      this.inerCom = this.density * Math.abs(sum);
    }
  }

  /** Draws the outline of the active points. */
  draw(r) {
    const xs = []; const ys = [];
    for (const pt of this.plist.points) if (pt.active) { xs.push(pt.p[0]); ys.push(pt.p[1]); }
    r.strokePolygon(xs, ys, { color: '#000', width: 1 });
  }
}
