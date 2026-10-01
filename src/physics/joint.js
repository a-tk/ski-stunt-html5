/** Mouse mapping for a joint set point (port of physics/MouseMap.java). */
export class MouseMap {
  constructor() { this.xmap = false; this.xpos0 = 0; this.xpos1 = 0; this.ymap = false; this.ypos0 = 0; this.ypos1 = 0; }
}

/** A PD-controlled joint (port of physics/Joint.java). Angles are in degrees. */
export class Joint {
  constructor() {
    this.kp = 1; this.kd = 0.1; this.setval = 0; this.min = -10; this.max = 10;
    this.mmap = new MouseMap();
    this.tmin = -100; this.tmax = 100;
    this.limTSet = false; this.limKp = 0; this.limKd = 0; this.limTmin = 0; this.limTmax = 0;
    this.futureAngle = 0; this.timeDelay = 0;
    this.mouseNorm = [0.5, 0.5];
  }

  set(mode, value, delay = 0) {
    if (mode === 'r') {
      this.setval += value;
    } else {
      this.futureAngle = value;
      if (delay > 0) this.timeDelay = delay;
      else this.setval = value;
    }
  }

  /** Joint torque for angle (deg), angular velocity and the step length dt. */
  torque(angle, vel, dt) {
    const nx = this.mouseNorm[0];
    const ny = this.mouseNorm[1];
    if (this.mmap.xmap || this.mmap.ymap) this.setval = 0;
    if (this.mmap.xmap) this.setval += this.mmap.xpos0 + nx * (this.mmap.xpos1 - this.mmap.xpos0);
    if (this.mmap.ymap) this.setval += this.mmap.ypos0 + ny * (this.mmap.ypos1 - this.mmap.ypos0);
    if (this.timeDelay > 0) {
      if (dt > this.timeDelay) {
        this.setval = this.futureAngle;
        this.timeDelay = 0;
      } else {
        this.setval += (this.futureAngle - this.setval) * (dt / this.timeDelay);
        this.timeDelay -= dt;
        if (this.timeDelay < 0) this.timeDelay = 0;
      }
    }
    if (this.setval > this.max) this.setval = this.max;
    if (this.setval < this.min) this.setval = this.min;
    if (!(angle > this.max) && !(angle < this.min)) {
      let t = this.kp * (this.setval - angle) - this.kd * vel;
      if (t < this.tmin) t = this.tmin;
      if (t > this.tmax) t = this.tmax;
      return t;
    }
    // outside the angle limits: a stronger restoring torque
    let t;
    if (this.limTSet) {
      t = 2 * (this.limKp * (this.setval - angle) - this.limKd * vel);
      if (t < this.limTmin) t = this.limTmin;
      if (t > this.limTmax) t = this.limTmax;
    } else {
      t = 2 * (this.kp * (this.setval - angle) - this.kd * vel);
      if (t < this.tmin) t = this.tmin;
      if (t > this.tmax) t = this.tmax;
    }
    return t;
  }

  setMouseNorm(norm) { this.mouseNorm = norm; }

  mousemap(axis, p0, p1) {
    if (axis === 'x') { this.mmap.xmap = true; this.mmap.xpos0 = p0; this.mmap.xpos1 = p1; }
    if (axis === 'y') { this.mmap.ymap = true; this.mmap.ypos0 = p0; this.mmap.ypos1 = p1; }
    if (axis === 'u') { this.mmap.xmap = false; this.mmap.ymap = false; }
  }

  limit(kp, kd, tmin, tmax) {
    this.limTSet = true; this.limKp = kp; this.limKd = kd; this.limTmin = tmin; this.limTmax = tmax;
  }

  writeState(prefix) {
    return `${prefix}${this.setval} ${this.futureAngle} ${this.timeDelay} `;
  }

  init(kp, kd, min, max, tmin, tmax) {
    this.kp = kp; this.kd = kd; this.min = min; this.max = max; this.tmin = tmin; this.tmax = tmax;
    this.limTSet = false;
  }
}
