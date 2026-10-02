// Port of monitor/SnowEffects.java: snow spray (and the sound) when a point hits the ground hard.
import { GroundContactEvent, EventType } from '../physics/events.js';
import { SoundAssoc } from './soundassoc.js';
import { M_PI } from '../util/math.js';

export const Unknown = 0;
export const Grounded = 1;
export const Flight = 2;
export const AvgPartSize = 0.01;
export const MinSprayArea = AvgPartSize * AvgPartSize;

/**
 * A figure's monitor: watches it each step. A monitor has init(world), reset() when a run starts and
 * update(dt) after every step; draw(r) is optional. (Any object with those will do; see Artfig.)
 */
export class SnowEffects {
  constructor() {
    this.artfig = null;
    this.world = null;
    this.state = Unknown;
    this.soundAssoc = new SoundAssoc();
  }

  async readSounds(path, vfs) { return this.soundAssoc.read(path, vfs); }

  reset() {
    this.state = Unknown;
  }

  /** How much snow a contact event throws: surface spray data * |force|^2 * 4e-10 (it sprays if > MinSprayArea). */
  sprayAmount(evt) {
    const g = evt.pt.gnd;
    const { pt } = evt;
    const t = g.segParam(pt.gndSegIndex, pt.cp);
    const extra = g.extraData(pt.gndSegIndex, t, 0, 0);
    const f2 = evt.cf[0] * evt.cf[0] + evt.cf[1] * evt.cf[1];
    return extra * f2 * 4.0e-10;
  }

  update(dt) {
    const { world } = this;
    const { splash } = world;
    for (const e of this.artfig.events) {
      if (e.type !== EventType.GroundContact) continue;
      const { pt } = e;
      if (e.state !== GroundContactEvent.AddContact) continue;
      this.state = Grounded;
      const amount = this.sprayAmount(e);
      if (!(amount > MinSprayArea)) continue;
      if (splash) {
        const total = Math.sqrt(amount * 3);
        const speedFactor = 0.8;
        const speedVar = 0.1;
        // split the contact force into its normal and tangential parts
        const fnorm = e.cf[0] * pt.cnorm[0] + e.cf[1] * pt.cnorm[1];
        const nx = fnorm * pt.cnorm[0];
        const ny = fnorm * pt.cnorm[1];
        const tx = e.cf[0] - nx;
        const ty = e.cf[1] - ny;
        const dx = nx - tx;
        const dy = ny - ty;
        const spread = M_PI / 4;
        const angle = Math.atan2(dy, dx);
        const v = [0, 0];
        this.artfig.links[e.linkNum].ptVelocity(pt.ploc, v);
        const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1]) * speedFactor;
        const ox = pt.cp[0] - v[0] * dt;
        const oy = pt.cp[1] - v[1] * dt;
        splash.setup(ox, oy, total, AvgPartSize, 0.005, speed, speed * speedVar, angle, spread);
      }
      for (const a of this.soundAssoc.assocList) {
        if (a.linkNum - 1 === e.linkNum && (a.tag == null || pt.containsTag(a.tag))) {
          world.audio?.play(a.fname);
          world.simLog(`sound ${a.fname}`);
          break;
        }
      }
    }
  }

  init(world) {
    this.world = world;
    this.artfig = world.artfig;
    let horizon = 999;
    if (world.ground != null) {
      const b = world.ground.boundingBox();
      const bottom = b.ul[1] - b.h;
      if (bottom < horizon) horizon = bottom;
    }
    if (world.splash != null) world.splash.horizonHeight = horizon;
  }
}
