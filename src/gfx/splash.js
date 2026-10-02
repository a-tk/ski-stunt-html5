// Ports of gfx/Particle.java, Splash.java and SnowSplash.java (merged: Splash was never used on its own): small snow particles thrown up by contact.
import { G, M_PI, frand } from '../util/math.js';
import { num } from '../util/text.js';

export class Particle {
  constructor() {
    this.radius = 0;
    this.color = [0.7 * 255, 0.7 * 255, 255]; // r, g, b in 0..255
    this.orig = [0, 0];
    this.vel = [0, 0];
  }

  draw(r) {
    r.fillCircle(this.orig[0], this.orig[1], this.radius, `rgb(${Math.round(this.color[0])},${Math.round(this.color[1])},${Math.round(this.color[2])})`);
  }

  /** From the tokens of a 'splash particle' line: radius R G B x y vx vy. */
  read(args, i) {
    this.radius = num(args[i++]);
    const r = num(args[i++]);
    const g = num(args[i++]);
    const b = num(args[i++]);
    this.color = [r, g, b];
    this.orig[0] = num(args[i++]);
    this.orig[1] = num(args[i++]);
    this.vel[0] = num(args[i++]);
    this.vel[1] = num(args[i++]);
  }

  write(prefix) {
    return `${prefix}${this.radius} ${Math.round(this.color[0])} ${Math.round(this.color[1])} ${Math.round(this.color[2])} ${this.orig[0]} ${this.orig[1]} ${this.vel[0]} ${this.vel[1]}`;
  }
}

export class SnowSplash {
  constructor(world) {
    this.world = world;
    this.horizonHeight = 0;
    this.particles = [];
  }

  reset() { this.particles = []; }
  empty() { return this.particles.length === 0; }
  numParticles() { return this.particles.length; }

  draw(r) { for (const p of this.particles) p.draw(r); }

  simStep(dt) {
    const a = [0, 0];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!this.valid(p)) {
        this.particles.splice(i, 1);
        --i;
      } else {
        p.orig[0] += p.vel[0] * dt;
        p.orig[1] += p.vel[1] * dt;
        this.accel(p, a);
        p.vel[0] += a[0] * dt;
        p.vel[1] += a[1] * dt;
      }
    }
    if (!this.empty()) this.world.simLog(`splash step ${dt}`);
  }

  addParticle(p) {
    this.particles.push(p);
    this.world.simLog(p.write('splash particle '));
  }

  /** Throws up 'total' area of snow in particles around (x, y); see SnowEffects for the arguments. */
  setup(x, y, total, avgSize, sizeVar, speed, speedVar, angle, spread) {
    while (total > 0) {
      const p = new Particle();
      let area = avgSize + sizeVar * frand(-1, 1);
      if (area > total) area = total;
      p.radius = Math.sqrt(area / M_PI);
      total -= area;
      const g = frand(0.7, 1.0) * 255;
      p.color = [g, g, g];
      p.orig[0] = x;
      p.orig[1] = y;
      let lo = angle - spread / 2;
      if (lo < 0) lo = 0;
      let hi = angle + spread / 2;
      if (hi > M_PI) hi = M_PI;
      const a = frand(lo, hi);
      const s = speed + speedVar * frand(-1, 1);
      p.vel[0] = s * Math.cos(a);
      p.vel[1] = s * Math.sin(a);
      this.addParticle(p);
    }
  }

  valid(p) {
    if (p.orig[1] < this.horizonHeight) return false;
    return this.world.ground == null || !this.world.ground.inside(p.orig);
  }

  accel(p, out) {
    out[0] = 0;
    out[1] = G;
    const drag = 5;
    out[0] -= p.vel[0] * drag;
    out[1] -= p.vel[1] * drag;
  }
}
