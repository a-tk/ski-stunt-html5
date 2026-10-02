// Port of physics/Artfig.java: an articulated figure (a tree of rigid links with PD joints) and its
// simulation state. The state vector is (x, vx, y, vy, th0, w0, th1, w1, ...): the root origin plus one
// angle (radians) per link. Contact with the ground and with objects is computed per collision point.
import { RAD_TO_DEG, M_PI } from '../util/math.js';
import { num } from '../util/text.js';
import { Link } from './link.js';
import { Joint } from './joint.js';
import { GroundContactEvent } from './events.js';

export const MAX_LINKS = 20;

export class Artfig {
  /** @param {import('../sim/world.js').World} world */
  constructor(world) {
    this.world = world;
    this.name = null;
    this.nlinks = 0;
    this.tagCount = 0;
    this.root = -1;
    this.current = -1;
    this.currentChild = -1;
    this.ndof = 0;
    this.simState = null;
    this.simTorq = null;
    this.simFext = null;
    this.simAc = null;
    this.joints = null;
    this.rebuild = false;
    this.showLink = true;
    this.showLinkDecor = true;
    this.dyn = null;
    this.links = [];
    for (let i = 0; i < MAX_LINKS; i++) {
      const l = new Link();
      l.pool = this.links;
      this.links.push(l);
    }
    this.decorPose = null;
    this.linkDecors = [];
    this.events = [];
    this.pendingEvents = [];
    this.monitor = null;
    this.active = true;
    this.panTgt = false;
    this.extForceArr = null;
    this.gndKp = -1;
    this.gndKd = -1;
  }

  // ---------------------------------------------------------------- building

  /** Sets a link's origin (global rest-pose coordinates). */
  jtOrg(num_, x, y) {
    if (num_ !== -1) {
      const l = this.links[this.findLink(num_)];
      l.org[0] = x;
      l.org[1] = y;
      this.rebuild = true;
    }
  }

  /** Adds the link described by the point list; it becomes a child of the current link. */
  addLink(plist) {
    ++this.nlinks;
    ++this.tagCount;
    this.rebuild = true;
    const idx = this.getNewLink();
    const l = this.links[idx];
    l.inum = idx;
    l.num = this.tagCount;
    if (this.current !== -1) {
      l.parent = this.current;
      l.theta = this.links[this.current].theta;
      this.links[this.current].addChild(idx);
    } else {
      this.root = idx;
    }
    this.current = idx;
    l.plist = plist.clone();
    const first = l.plist.points[0];
    l.org[0] = first.p[0];
    l.org[1] = first.p[1];
    plist.reset();
  }

  mass(linkNum, m) {
    this.buildDof();
    this.links[this.findLink(linkNum)].updateMass(m);
  }

  density(linkNum, d) {
    this.buildDof();
    this.links[this.findLink(linkNum)].updateDensity(d);
  }

  /** Allocates the state arrays and joints once the links are defined. */
  buildDof() {
    if (!this.rebuild) return;
    this.convertLocal(0);
    this.ndof = this.nlinks + 2;
    this.simState = new Float64Array(this.ndof * 2);
    this.simTorq = new Float64Array(this.nlinks);
    this.simFext = new Float64Array(3 * this.nlinks);
    this.simAc = new Float64Array(this.ndof);
    this.joints = [];
    for (let i = 0; i < this.nlinks; i++) {
      const j = new Joint();
      j.mouseNorm = this.world.mouseNorm;
      this.joints.push(j);
    }
    this.links[this.root].buildDof(0);
    this.rebuild = false;
    this.simInitState();
  }

  convertLocal(reset) { this.links[this.root].convertLocal(reset); }
  convertGlobal() { this.links[this.root].convertGlobal(); }

  findLink(n) {
    for (let i = 0; i < MAX_LINKS; i++) if (this.links[i].num === n) return this.links[i].inum;
    return -1;
  }

  getNewLink() {
    for (let i = 0; i < MAX_LINKS; i++) if (this.links[i].num === -1) return i;
    return 0;
  }

  numlinks() { return this.nlinks; }
  setCurrent(i) { this.current = i; }
  curr() { return this.current; }
  currNum() { return this.links[this.current].num; }
  togglelink() { this.showLink = !this.showLink; }

  jtPd(i, kp, kd, min, max, tmin, tmax) {
    if (i >= this.nlinks) { console.log('Artfig.jtPd(): bad link #'); return; }
    this.joints[i].init(kp, kd, min, max, tmin, tmax);
  }

  jtPdLimit(i, kp, kd, tmin, tmax) {
    if (i < this.nlinks) this.joints[i].limit(kp, kd, tmin, tmax);
  }

  jtMousemap(i, axis, p0, p1) {
    if (i >= this.nlinks) { console.log('Artfig.jtSet(): bad link #'); return; }
    this.joints[i].mousemap(axis, p0, p1);
  }

  jtSet(mode, i, v, delay) {
    if (i >= this.nlinks) { console.log('Artfig.jtSet(): bad link #'); return; }
    this.joints[i].set(mode, v, delay);
  }

  /** Remembers the current link poses as the reference pose for link decor (first call only). */
  captureDecorPose() {
    if (this.decorPose == null) {
      this.decorPose = new Array(MAX_LINKS).fill(null);
      for (let i = 0; i < this.nlinks; i++) {
        const l = this.links[i];
        this.decorPose[i] = [l.org[0], l.org[1], l.cth, l.sth];
      }
    }
  }

  // ---------------------------------------------------------------- state

  simInitState() {
    const r = this.links[this.root];
    this.simState[0] = r.orgLoc[0];
    this.simState[1] = 0;
    this.simState[2] = r.orgLoc[1];
    this.simState[3] = 0;
    for (let i = 2; i < this.ndof; i++) {
      const k = 2 * i;
      this.simState[k] = this.links[i - 2].thetaLoc * M_PI / 180;
      this.simState[k + 1] = 0;
    }
  }

  simDispState() {
    const r = this.links[this.root];
    r.orgLoc[0] = this.simState[0];
    r.orgLoc[1] = this.simState[2];
    for (let i = 2; i < this.ndof; i++) this.links[i - 2].thetaLoc = this.simState[2 * i] * 180 / M_PI;
    this.convertGlobal();
  }

  getStateXy(out) { out[0] = this.simState[0]; out[1] = this.simState[2]; }

  /** Loads a state from a 'showall' line's tokens. Returns false if the line has no state. */
  simShowallState(args) {
    const n = args.length;
    let i = 1;
    if (n <= i) return false;
    if (args[i] === 'ndisp') ++i;
    if (n <= i) return false;
    if (args[i].charAt(0) === 't') { num(args[i].slice(1)); ++i; }
    let count = 2 * this.ndof;
    if (count > n - i) count = n - i;
    if (count < 0) return false;
    for (let k = i; k < count + i; k++) this.simState[k - i] = num(args[k]);
    i += count;
    let j = 0;
    while (i <= n - 3) {
      const setval = num(args[i++]);
      const future = num(args[i++]);
      const delay = num(args[i++]);
      if (j >= this.joints.length) break;
      if (delay > 0) this.joints[j].set('a', future, delay);
      else this.joints[j++].set('a', setval, 0);
    }
    return true;
  }

  /** A 'showall' log line for the current state. */
  simLogState(t, display = true) {
    let s = 'showall ';
    if (!display) s += 'ndisp ';
    s += `t${t} `;
    for (let i = 0; i < 2 * this.ndof; i++) s += `${this.simState[i]} `;
    for (let i = 0; i < this.nlinks; i++) s = this.joints[i].writeState(s);
    this.world.log?.write(`${s}\n`);
  }

  /** Moves the figure to a rest pose: args = [x, y, angle0, angle1, ...] (angles in degrees). */
  restpose(a) {
    const r = this.links[this.root];
    r.orgLoc[0] = a[0];
    r.orgLoc[1] = a[1];
    for (let i = 2; i < this.ndof; i++) this.links[i - 2].thetaLoc = a[i];
    this.convertGlobal();
    this.world.winview.recenter(a, this.world.winview.SETCAM);
    this.simInit();
    this.simInitState();
    for (let i = 0; i < this.nlinks; i++) this.joints[i].set('a', a[2 + i]);
  }

  /** Clears collision state (and resets the monitor) at the start of a run. */
  simInit() {
    for (let i = 0; i < this.nlinks; i++) {
      for (const pt of this.links[i].plist.points) pt.initCollision();
    }
    this.monitor?.reset();
  }

  simValidateState() {
    for (let i = 0; i < 2 * this.ndof; i++) if (Math.abs(this.simState[i]) > 1000000) return false;
    return true;
  }

  // ---------------------------------------------------------------- stepping

  /** External-force accumulator (3 per link) filled by BodyContacts, created on first use. */
  extForce() {
    if (this.extForceArr == null || this.extForceArr.length !== 3 * this.nlinks) this.extForceArr = new Float64Array(3 * this.nlinks);
    return this.extForceArr;
  }

  clearExtForce() { if (this.extForceArr) this.extForceArr.fill(0); }

  /** One simulation step of length dt. Returns false if the state blew up. */
  simStep(dt) {
    this.events.length = 0;
    for (const e of this.pendingEvents) this.events.push(e);
    this.pendingEvents.length = 0;
    for (let i = 0; i < this.nlinks; i++) {
      const k = 4 + 2 * i;
      this.simTorq[i] = this.joints[i].torque(this.simState[k] * RAD_TO_DEG, this.simState[k + 1], dt) * RAD_TO_DEG;
      const f = i * 3;
      this.simFext[f] = this.simFext[f + 1] = this.simFext[f + 2] = 0;
    }
    this.simGndForces(dt);
    if (this.extForceArr) {
      for (let i = 0; i < this.simFext.length && i < this.extForceArr.length; i++) this.simFext[i] += this.extForceArr[i];
    }
    if (!this.simValidateState()) {
      console.log('Error: invalid state vector value(s)');
      return false;
    }
    this.dyn.eval(this.simState, this.simTorq, this.simFext, this.simAc);
    this.simUpdateState(dt);
    this.simDispState();
    this.monitor?.update(dt);
    return true;
  }

  /** Constant-acceleration Euler step of every degree of freedom. */
  simUpdateState(dt) {
    for (let i = 0; i < this.ndof; i++) {
      const k = 2 * i;
      const v = this.simState[k + 1];
      const a = this.simAc[i];
      this.simState[k] = this.simState[k] + v * dt + 0.5 * a * dt * dt;
      this.simState[k + 1] += a * dt;
    }
    this.links[this.root].linkVelocity(this.simState);
  }

  // ---------------------------------------------------------------- ground contact

  /** The surface (terrain or object) a point presses on: the one it already touches while still inside it, else the first containing it. */
  surfaceFor(pt) {
    const { ground } = this.world;
    if (pt.cflag) {
      if (ground && ground === pt.gnd && ground.inside(pt.p)) return ground;
      for (const ob of this.world.obstacles) {
        const g = ob.ground;
        if (g && g === pt.gnd && g.inside(pt.p)) return g;
      }
    }
    if (ground && ground.inside(pt.p)) return ground;
    for (const ob of this.world.obstacles) {
      const g = ob.ground;
      if (g && g.inside(pt.p)) return g;
    }
    return null;
  }

  simGndForces(dt) {
    const force = [0, 0];
    for (let li = 0; li < MAX_LINKS; li++) {
      const link = this.links[li];
      if (link.num === -1) continue;
      // skip the link unless it is near the terrain or one of the objects
      let near = false;
      const { ground } = this.world;
      if (ground && ground.bboxIntersects(link.bbox)) near = true;
      for (let k = 0; k < this.world.obstacles.length && !near; k++) {
        const g = this.world.obstacles[k].ground;
        if (g && g.bboxIntersects(link.bbox)) near = true;
      }
      const skip = !!ground && !near;
      for (const pt of link.plist.points) {
        if (!pt.active) continue;
        const was = pt.cflag;
        let applied = 0;
        if (skip) pt.cflag = false;
        else applied = this.simGndForce(link, pt, dt, force);
        pt.updateHist();
        if (pt.cflag !== was) {
          const e = new GroundContactEvent();
          e.linkNum = li;
          e.pt = pt;
          if (pt.cflag) {
            e.state = GroundContactEvent.AddContact;
            e.cf[0] = force[0];
            e.cf[1] = force[1];
          } else {
            e.state = GroundContactEvent.RemoveContact;
          }
          this.events.push(e);
        }
        if (applied !== 0) link.applyForce(pt.p, force[0], force[1], this.simFext);
      }
    }
  }

  /** Penalty spring-damper contact for one point; fills f with the force and returns 1 if there is contact. */
  simGndForce(link, pt, dt, f) {
    const v = [0, 0];
    const px = pt.p[0];
    const py = pt.p[1];
    const last = pt.pLast == null ? [px, 1000] : [pt.pLast[0], pt.pLast[1]];
    const g = this.surfaceFor(pt);
    if (g == null) {
      pt.cflag = false;
      f[0] = f[1] = 0;
      return 0;
    }
    link.ptVelocity(pt.ploc, v);
    if (g !== pt.gnd) pt.cflag = false;
    if (!pt.cflag) {
      pt.gnd = g;
      const cf = [0];
      const seg = [0];
      if (!g.contactPt(last, pt.p, pt.cp, pt.cnorm, cf, seg)) {
        console.log(`Error: unable to compute ground contact point (${this.name} at ${px}, ${py}; last ${pt.pLast == null ? 'none' : `${pt.pLast[0]}, ${pt.pLast[1]}`})`);
        return 0;
      }
      pt.cfric = cf[0] + pt.bodyCFric;
      pt.cflag = true;
      pt.gndSegIndex = seg[0];
    }
    const nx = pt.cnorm[1];
    const ny = -pt.cnorm[0];
    if (this.gndKp >= 0) {
      f[0] = this.gndKp * (pt.cp[0] - px) - this.gndKd * v[0];
      f[1] = this.gndKp * (pt.cp[1] - py) - this.gndKd * v[1];
    } else if (this.name === 'skier') {
      f[0] = g.kp * (pt.cp[0] - px) - g.kd * v[0];
      f[1] = g.kp * (pt.cp[1] - py) - g.kd * v[1];
    } else {
      f[0] = g.kpSki * (pt.cp[0] - px) - g.kdSki * v[0];
      f[1] = g.kpSki * (pt.cp[1] - py) - g.kdSki * v[1];
    }
    let fn = nx * f[0] + ny * f[1];
    let ft = -ny * f[0] + nx * f[1];
    if (ft < 0) {
      f[0] = fn * nx;
      f[1] = fn * ny;
      ft = 0;
    }
    const ratio = Math.abs(fn / ft);
    if (ratio > pt.cfric) {
      fn = fn * pt.cfric / ratio;
      f[0] = nx * fn - ny * ft;
      f[1] = ny * fn + nx * ft;
      const dist = Math.sqrt(v[0] * v[0] + v[1] * v[1]) * dt;
      const cf = [0];
      const seg = [0];
      g.traverse(pt.gndSegIndex, pt.cp, v, dist, pt.cp, pt.cnorm, cf, seg);
      pt.cfric = cf[0] + pt.bodyCFric;
      pt.gndSegIndex = seg[0];
    }
    return 1;
  }

  // ---------------------------------------------------------------- drawing

  draw(r) {
    if (this.showLink) {
      for (let i = 0; i < MAX_LINKS; i++) if (this.links[i].num !== -1) this.links[i].draw(r);
    }
    if (this.showLinkDecor) for (const d of this.linkDecors) d.draw(r);
    this.monitor?.draw?.(r);
  }
}
