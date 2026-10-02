// Port of monitor/Ski2Monitor.java: the skier's crash handling. A head hit relaxes the joints; a hard
// impact on a ski binding point detaches the skis; applause past the finish line.
import { SnowEffects, AvgPartSize } from './snoweffects.js';
import { GroundContactEvent, EventType } from '../physics/events.js';
import { frand, M_PI } from '../util/math.js';

export class Ski2Monitor extends SnowEffects {
  constructor() {
    super();
    this.maxHorizImpactForce = 1200;
    this.maxDnImpactForce = 1200;
    this.skierNormProc = null;
    this.skierRelaxProc = null;
    this.skiState = 0;    // 0 attached, 1 detached
    this.skierState = 0;  // 0 normal, 1 relaxed
    this.applause = false;
  }

  reset() {
    super.reset();
    this.skiState = 0;
    this.skierState = 0;
    this.applause = false;
    for (let i = 0; i < this.artfig.numlinks(); i++) {
      for (const pt of this.artfig.links[i].plist.points) pt.active = !pt.containsTag('ia');
    }
    const w = this.world;
    w.interp('linkDecor show lski.decor true');
    w.interp('linkDecor show rski.decor true');
    w.interp('world setaf drski');
    w.interp('artfig active false');
    w.interp('world setaf dlski');
    w.interp('artfig active false');
    w.interp('world setaf skier');
    if (this.skierNormProc != null) w.interp(`< ${this.skierNormProc}`);
  }

  update(dt) {
    super.update(dt);
    const w = this.world;
    if (!this.applause && this.artfig.simState[0] > w.ground.xApplause && this.skierState === 0) {
      this.applause = true;
      w.interp('sound sounds/applause.au');
      w.simLog('sound sounds/applause.au');
    }
    for (const e of this.artfig.events) {
      if (e.type !== EventType.GroundContact) continue;
      const { pt } = e;
      if (e.state !== GroundContactEvent.AddContact) continue;
      const amount = [0];
      if (this.spray(e, AvgPartSize * AvgPartSize, amount) && pt.containsTag('head')) this.skierStateTo(1);
      if (this.skiState === 0 && pt.containsTag('skiD')) {
        const local = [0, 0];
        this.artfig.links[e.linkNum].vecGlobToLoc(e.cf, local);
        if (Math.abs(local[0]) > this.maxHorizImpactForce || local[1] < -this.maxDnImpactForce) {
          this.skiState = 1;
          this.detachSkies();
          this.skierStateTo(1);
        }
      }
    }
  }

  /** Frees the skis: the bindings points go inactive, the boots active, and the two ski figures start moving. */
  detachSkies() {
    const w = this.world;
    w.interp('sound sounds/bindings.au');
    w.simLog('sound sounds/bindings.au');
    for (let i = 0; i < this.artfig.numlinks(); i++) {
      for (const pt of this.artfig.links[i].plist.points) {
        if (pt.containsTag('skiX')) pt.active = false;
        if (pt.containsTag('bt')) pt.active = true;
      }
    }
    w.interp('linkDecor show lski.decor false');
    w.interp('linkDecor show rski.decor false');
    w.interp('world setaf drski');
    w.interp('artfig active true');
    const foot = this.artfig.links[0];
    const right = w.findArtfig('drski');
    const x = foot.org[0];
    const vx = foot.orgv[0];
    const y = foot.org[1];
    const vy = foot.orgv[1];
    let theta = foot.theta * M_PI / 180;
    const omega = foot.thetav;
    const args = ['showall', String(x), String(vx), String(y), String(vy), String(theta), String(omega), '0', '0', '0'];
    right.simShowallState(args);
    w.interp('world setaf dlski');
    w.interp('artfig active true');
    const left = w.findArtfig('dlski');
    const maxDeg = 20;
    const minDeg = 5;
    let off = 0;
    while (Math.abs(off) < minDeg) off = frand(-maxDeg, maxDeg);
    theta += off * M_PI / 180;
    args[5] = String(theta);
    left.simShowallState(args);
    w.interp('world setaf skier');
  }

  init(world) {
    super.init(world);
    if (this.artfig.numlinks() < 4) console.log('Error: monitor requires artfig to have exactly 4 links');
  }

  skierStateTo(s) {
    if (s === 0) {
      if (this.skierState === 1 && this.skierNormProc != null) this.world.interp(`< ${this.skierNormProc}`);
    } else if (s === 1 && this.skierState === 0 && this.skierRelaxProc != null) this.world.interp(`< ${this.skierRelaxProc}`);
    this.skierState = s;
  }
}
