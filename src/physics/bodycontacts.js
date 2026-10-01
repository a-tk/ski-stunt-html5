// Port of physics/BodyContacts.java: contact between the skier (or any figure with collision
// points) and pushable objects.
//
// Every step, before the figures are integrated, each active collision point that lies inside a
// pushable object's outline gets a penalty spring-damper force along the outward normal of the edge
// it entered through, plus Coulomb friction (both from the relative velocity of the point and the
// object), and the object gets the opposite force at that point. The forces go into each figure's
// external-force accumulator (Artfig.extForce), which sim_step folds into sim_fext.
import { MAX_LINKS } from './artfig.js';
import { GroundContactEvent } from './events.js';
import { Ground } from '../terrain/ground.js';
import { FLOAT_MAX } from '../util/math.js';

/** A collision point that is currently inside a pushable object. */
class Touch {
  constructor(fig, linkNum, pt, ob) {
    this.fig = fig;
    this.linkNum = linkNum;
    this.pt = pt;
    this.ob = ob;
    /** The edge the point came in through; it keeps pushing the point back out that way. */
    this.edge = 0;
  }
}

/** Computes all point-vs-object forces for the current positions. */
export function applyBodyContacts(world) {
  if (!world.obstacles.some((o) => o.dynamic)) {
    world.bodyTouching.length = 0;
    return;
  }
  for (const f of world.artfigList) f.clearExtForce();
  const before = world.bodyTouching;
  world.bodyTouching = [];
  for (const ob of world.obstacles) {
    if (ob.dynamic && ob.fig.active) collide(world, ob, before);
  }
  // points that were touching and no longer are
  for (const t of before) {
    const e = new GroundContactEvent();
    e.state = GroundContactEvent.RemoveContact;
    e.linkNum = t.linkNum;
    e.pt = t.pt;
    t.fig.pendingEvents.push(e);
  }
}

function collide(world, ob, before) {
  const crate = ob.fig;
  const body = crate.links[crate.root];
  for (const fig of world.artfigList) {
    if (fig === crate || !fig.active) continue;
    for (let l = 0; l < MAX_LINKS; l++) {
      const link = fig.links[l];
      if (link.num === -1 || !link.bbox.intersects(body.bbox)) continue;
      for (const pt of link.plist.getPoints()) {
        if (pt.active) contact(world, ob, crate, body, fig, l, link, pt, before);
      }
    }
  }
}

function contact(world, ob, crate, body, fig, linkNum, link, pt, before) {
  const local = [0, 0];
  body.glob_to_loc(pt.p, local);
  const n = ob.lx.length;
  if (!inside(ob.lx, ob.ly, n, local[0], local[1])) return;

  // The edge the point entered through gives the way out (like a ground contact anchor), so a point
  // that sinks deep into a face isn't pushed out through a nearer edge on the far side.
  let touch = null;
  for (let i = 0; i < before.length; i++) {
    if (before[i].pt === pt && before[i].ob === ob) { touch = before.splice(i, 1)[0]; break; }
  }
  let best;
  if (touch != null && touch.edge < n && depthBelow(ob, touch.edge, local[0], local[1]) > 0) best = touch.edge;
  else best = entryEdge(ob, body, pt, local);
  const bestDist = Math.max(0, depthBelow(ob, best, local[0], local[1]));
  const j = (best + 1) % n;
  const ex = ob.lx[j] - ob.lx[best];
  const ey = ob.ly[j] - ob.ly[best];
  const len = Math.sqrt(ex * ex + ey * ey);
  if (len === 0) return;
  // outline is clockwise, so the outward normal is to the left of the edge direction
  const nl = [-ey / len, ex / len];
  const nw = [0, 0];
  body.vec_loc_to_glob(nl, nw);
  const tx = -nw[1];
  const ty = nw[0];

  // velocity of the point relative to the object's material at the same place
  const vp = [0, 0];
  const vb = [0, 0];
  link.pt_velocity(pt.ploc, vp);
  body.pt_velocity(local, vb);
  const vx = vp[0] - vb[0];
  const vy = vp[1] - vb[1];
  const vn = vx * nw[0] + vy * nw[1];
  const vt = vx * tx + vy * ty;

  let kp; let kd;
  if (fig.gndKp >= 0) {
    kp = fig.gndKp; kd = fig.gndKd;
  } else {
    const g = world.ground ?? new Ground();
    const skier = fig.name === 'skier';
    kp = skier ? g.kp : g.kpSki;
    kd = skier ? g.kd : g.kdSki;
  }
  const fn = Math.max(0, kp * bestDist - kd * vn);
  const mu = ob.ecf[best] + pt.bodyCFric;
  let ft = Math.min(mu * fn, kd * Math.abs(vt));
  ft = vt > 0 ? -ft : Math.abs(ft);
  const fx = fn * nw[0] + ft * tx;
  const fy = fn * nw[1] + ft * ty;

  link.apply_force(pt.p, fx, fy, fig.extForce());
  body.apply_force(pt.p, -fx, -fy, crate.extForce());
  report(world, ob, fig, linkNum, pt, best, nw, fx, fy, touch);
}

/**
 * Tells the figure's monitor about the contact, as for ground contact: an AddContact event when the
 * point first touches the object (with the first force), a RemoveContact when it stops. The point
 * carries the object's surface data the monitors look at.
 */
function report(world, ob, fig, linkNum, pt, edge, normal, fx, fy, touch) {
  let t = touch;
  if (t == null) {
    t = new Touch(fig, linkNum, pt, ob);
    pt.gnd = ob.proxy;
    pt.gndSegIndex = edge;
    pt.cp[0] = pt.p[0];
    pt.cp[1] = pt.p[1];
    pt.cnorm[0] = normal[0];
    pt.cnorm[1] = normal[1];
    const e = new GroundContactEvent();
    e.state = GroundContactEvent.AddContact;
    e.linkNum = linkNum;
    e.pt = pt;
    e.cf[0] = fx;
    e.cf[1] = fy;
    fig.pendingEvents.push(e);
  }
  t.edge = edge;
  world.bodyTouching.push(t);
}

/** How far inside the object the point is, measured against edge i's line (negative = outside it). */
function depthBelow(ob, i, x, y) {
  const j = (i + 1) % ob.lx.length;
  const ex = ob.lx[j] - ob.lx[i];
  const ey = ob.ly[j] - ob.ly[i];
  const len = Math.sqrt(ex * ex + ey * ey);
  if (len === 0) return 0;
  // outward normal (-ey, ex) / len for a clockwise outline
  return -((x - ob.lx[i]) * (-ey) + (y - ob.ly[i]) * ex) / len;
}

/** The edge a point that is now inside came in through: the one its last step crossed (the first, preferring faces it was moving against); otherwise the nearest edge. */
function entryEdge(ob, body, pt, local) {
  const n = ob.lx.length;
  if (pt.pLast != null) {
    const last = [0, 0];
    body.glob_to_loc(pt.pLast, last);
    const dx = local[0] - last[0];
    const dy = local[1] - last[1];
    let found = -1;
    let foundT = FLOAT_MAX;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = ob.lx[j] - ob.lx[i];
      const ey = ob.ly[j] - ob.ly[i];
      const den = dx * ey - dy * ex;
      if (den === 0) continue;
      const t = ((ob.lx[i] - last[0]) * ey - (ob.ly[i] - last[1]) * ex) / den;
      const u = ((ob.lx[i] - last[0]) * dy - (ob.ly[i] - last[1]) * dx) / den;
      // moving against the outward normal (-ey, ex)
      const against = dx * (-ey) + dy * ex < 0;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && against && t < foundT) { foundT = t; found = i; }
    }
    if (found >= 0) return found;
  }
  let best = 0;
  let bestDist = FLOAT_MAX;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = distToSegment(local[0], local[1], ob.lx[i], ob.ly[i], ob.lx[j], ob.ly[j]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

export function inside(xs, ys, n, x, y) {
  let inn = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if ((ys[i] > y) !== (ys[j] > y) && x < (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i]) inn = !inn;
  }
  return inn;
}

export function distToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
