// Port of terrain/Obstacle.java: a placed, solid object.
// A static object collides like terrain (its outline becomes a small world-space Ground). A dynamic
// (pushable) object is a one-link Artfig with DynRigid dynamics: it rests on the ground through the
// normal ground-contact code and exchanges forces with the skier through BodyContacts.
import { Ground } from './ground.js';
import { MapData } from './mapdata.js';
import { ObjectType } from './objecttype.js';
import { DynRigid } from '../physics/dynamics/dynrigid.js';
import { LinkDecor } from '../art/linkdecor.js';

const f6 = (v) => v.toFixed(6);

export class Obstacle {
  constructor(type, typeName, x, y, rotation, scale, ground, gx, gy, dynamic) {
    this.type = type;
    this.typeName = typeName;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.scale = scale;
    this.ground = ground;     // the terrain-style surface of a static object; null for a dynamic one
    this.gx = gx;
    this.gy = gy;
    this.dynamic = dynamic;
    this.fig = null;          // dynamic only: the body ...
    this.lx = null;           // ... its outline in the body's frame (clockwise)
    this.ly = null;
    this.ecf = null;          // ... the friction of each edge
    this.proxy = null;        // the outline as a Ground in its starting pose (surface data for contact events)
    this.homeX = 0;
    this.homeY = 0;
  }

  /** The world-space outline of 'shape' placed at (x, y), turned by rotation degrees and scaled; clockwise. */
  static place(shape, x, y, rotation, scale) {
    const th = rotation * Math.PI / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let out = new MapData();
    for (const sp of shape.pts) {
      const p = sp.copy();
      const lx = p.x * scale;
      const ly = p.y * scale;
      p.x = x + lx * c - ly * s;
      p.y = y + lx * s + ly * c;
      out.pts.push(p);
    }
    if (!out.isClockwise()) {
      // a mirroring scale reverses the winding; reverse the points, keeping each edge's friction
      const n = out.pts.length;
      const rev = new MapData();
      for (let k = 0; k < n; k++) {
        const p = out.pts[n - 1 - k].copy();
        p.cf = out.pts[(((n - 2 - k) % n) + n) % n].cf;
        rev.pts.push(p);
      }
      out = rev;
    }
    return out;
  }

  /** Builds an obstacle from objects/typeName.obj, or returns null (with a warning). */
  static async create(world, typeName, x, y, rotation, scale, dynamic = false, mass = 0) {
    const type = await ObjectType.load(world, typeName);
    if (type == null || scale === 0) return null;
    const placed = Obstacle.place(type.shape, x, y, rotation, scale);
    if (dynamic) {
      const o = new Obstacle(type, typeName, x, y, rotation, scale, null, null, null, true);
      return o.buildBody(world, placed, mass > 0 ? mass : type.mass) ? o : null;
    }
    const g = new Ground();
    try {
      g.read(placed.toText());
    } catch (e) {
      console.log(`Warning: unable to build object ${typeName}: ${e.message}`);
      return null;
    }
    const o = new Obstacle(type, typeName, x, y, rotation, scale, g, placed.pts.map((p) => p.x), placed.pts.map((p) => p.y), false);
    o.syncPhysics(world.ground);
    return o;
  }

  /** Creates the rigid body for a dynamic object; false (with a warning) if it can't be built. */
  buildBody(world, placed, mass) {
    const n = placed.pts.length;
    // centroid and moment of inertia of the outline (uniform density), via the shoelace sums
    let a2 = 0; let cx = 0; let cy = 0;
    for (let i = 0; i < n; i++) {
      const p = placed.pts[i];
      const q = placed.pts[(i + 1) % n];
      const cr = p.x * q.y - q.x * p.y;
      a2 += cr;
      cx += (p.x + q.x) * cr;
      cy += (p.y + q.y) * cr;
    }
    if (Math.abs(a2) < 1e-6) { console.log(`Warning: object ${this.typeName} has no area`); return false; }
    cx /= 3 * a2;
    cy /= 3 * a2;
    this.homeX = cx;
    this.homeY = cy;
    this.lx = placed.pts.map((p) => p.x - cx);
    this.ly = placed.pts.map((p) => p.y - cy);
    this.ecf = placed.pts.map((p) => p.cf);
    let polar = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cr = this.lx[i] * this.ly[j] - this.lx[j] * this.ly[i];
      polar += cr * (this.lx[i] * this.lx[i] + this.lx[i] * this.lx[j] + this.lx[j] * this.lx[j]
        + this.ly[i] * this.ly[i] + this.ly[i] * this.ly[j] + this.ly[j] * this.ly[j]);
    }
    const inertia = Math.abs(polar) / 12 * mass / (Math.abs(a2) / 2);
    this.proxy = new Ground();
    try { this.proxy.read(placed.toText()); } catch (e) { console.log(`Warning: unable to build object surface data: ${e.message}`); }

    const saved = world.artfig;
    let id = world.artfigList.length;
    while (world.findArtfig(`obj${id}`) != null) ++id;
    const f = world.newArtfig(`obj${id}`);
    // the outline plus points along each edge, so the object rests on the ground without sinking in between corners
    world.interp('new_link');
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = this.lx[j] - this.lx[i];
      const ey = this.ly[j] - this.ly[i];
      const k = Math.max(1, Math.ceil(Math.sqrt(ex * ex + ey * ey) / 0.25));
      for (let s = 0; s < k; s++) {
        const t = s / k;
        world.interp(`new_pt ${f6(this.lx[i] + t * ex + cx)} ${f6(this.ly[i] + t * ey + cy)} ${f6(this.ecf[i])}`);
      }
    }
    world.interp('link_close');
    world.interp(`jt_org 1 ${f6(cx)} ${f6(cy)}`);
    // the mass command also allocates the figure's state; DynRigid below does the real dynamics
    world.interp(`mass ${f6(mass)} 1`);
    world.interp('tog_link');
    world.interp('jt_pd 1 0 0.00 -10 10 -1 1');
    f.dyn = new DynRigid(mass, inertia);
    // contact stiffness scaled to the mass: about 1 cm of sag, well damped
    f.gndKp = 200 * mass;
    f.gndKd = 15 * mass;
    this.fig = f;
    f.linkDecors.push(LinkDecor.forPolygon(f.links[f.root], this.lx, this.ly, this.type, this.type.textureScale * Math.abs(this.scale)));
    world.artfig = saved;
    this.resetPose();
    return true;
  }

  /** Puts a dynamic object back at its starting place, at rest. */
  resetPose() {
    if (this.fig == null) return;
    const l = this.fig.links[this.fig.root];
    l.org_loc[0] = this.homeX;
    l.org_loc[1] = this.homeY;
    l.theta_loc = 0;
    l.orgv[0] = 0;
    l.orgv[1] = 0;
    l.thetav = 0;
    this.fig.convert_global();
    this.fig.sim_init_state();
    this.fig.sim_init();
  }

  /** Uses the terrain's contact stiffness/damping so objects feel like the ground. */
  syncPhysics(terrain) {
    if (terrain != null && this.ground != null) {
      this.ground.kp = terrain.kp;
      this.ground.kd = terrain.kd;
      this.ground.kpSki = terrain.kpSki;
      this.ground.kdSki = terrain.kdSki;
      this.ground.cfric = terrain.cfric;
    }
  }

  draw(r) {
    if (this.dynamic) return; // drawn by its Artfig
    const t = this.type;
    r.fillPolygon(this.gx, this.gy, { color: rgb(t.fill) });
    if (t.texture != null) {
      // the texture is anchored in world coordinates
      r.fillPolygonTextured(this.gx, this.gy, t.texture, { x: 0, y: 0, cth: 1, sth: 0 }, t.textureScale * Math.abs(this.scale));
    }
    if (t.outlineWidth > 0) r.strokePolygon(this.gx, this.gy, { color: rgb(t.outline), width: t.outlineWidth });
  }
}

export const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
