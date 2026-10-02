// Port of gfx/Winview.java: the camera (position, zoom and the smoothing filter that follows the skier).
export class Winview {
  constructor(world) {
    this.world = world;
    this.gfx2d = null;
    this.width = 0;
    this.height = 0;
    this.xOrg = 0;          // lower-left corner of the view, in world coordinates
    this.yOrg = 0;
    this.sf = 1;             // pixels per world unit
    this.xAvg = 0;
    this.yAvg = 0;
    this.xRate = 1;
    this.yRate = 1;
    this.xOffset = 0.5;
    this.yOffset = 0.5;
    this.zoomLevel = 0;
    this.SETCAM = 999;
  }


  init(width, height, xOrg, yOrg, sf) {
    this.width = width;
    this.height = height;
    this.xOrg = xOrg;
    this.yOrg = yOrg;
    this.sf = sf;
    this.xAvg = this.xOrg + 0.5 * width / sf;
    this.yAvg = this.yOrg + 0.5 * height / sf;
    this.xRate = 0.05;
    this.yRate = 0.01;
  }

  /** The drawing area changed size: keep the scale and the point at the view's center. */
  resize(width, height) {
    const cx = this.xOrg + 0.5 * this.width / this.sf;
    const cy = this.yOrg + 0.5 * this.height / this.sf;
    this.width = width;
    this.height = height;
    this.xOrg = cx - 0.5 * width / this.sf;
    this.yOrg = cy - 0.5 * height / this.sf;
    this.modelview();
  }

  setZoom(level) { this.changeZoom(level - this.zoomLevel); }

  /** Zooms by n steps (each x1.3; negative zooms out) around the view's center. */
  changeZoom(n) {
    const factor = 1.3;
    this.zoomLevel += n;
    let f = factor;
    if (n < 0) { n = -n; f = 1 / factor; }
    const cx = this.xOrg + 0.5 * this.width / this.sf;
    const cy = this.yOrg + 0.5 * this.height / this.sf;
    for (let i = 0; i < n; i++) this.sf *= f;
    this.xOrg = cx - this.xOffset * this.width / this.sf;
    this.yOrg = cy - this.yOffset * this.height / this.sf;
    const skier = this.world.findArtfig('skier');
    if (skier) this.recenter(skier.links[skier.root].orgLoc, 999);
    else this.modelview();
  }

  modelview() {
    if (!this.gfx2d) return;
    const top = this.yOrg + this.height / this.sf;
    this.gfx2d.ortho(this.xOrg, this.xOrg + this.width / this.sf, this.yOrg, top);
  }

  /** Moves the camera toward target [x, y]; steps = SETCAM snaps to it first. */
  recenter(target, steps = 1) {
    if (steps === 999) {
      this.xAvg = target[0];
      this.yAvg = target[1];
      steps = 1;
    }
    if (this.xRate !== 0 || this.yRate !== 0) {
      for (let i = 0; i < steps; i++) this.#track(target, this.xRate, this.yRate);
    }
  }

  /**
   * Like recenter, but for a camera that moves every rendered frame: 'dt' seconds of sim time have
   * passed since the last call, and the smoothing rates (which are per 'dtDisp' step) are rescaled to match.
   */
  follow(target, dt, dtDisp) {
    if (this.xRate === 0 && this.yRate === 0) return;
    const k = dt / dtDisp;
    this.#track(target, 1 - (1 - this.xRate) ** k, 1 - (1 - this.yRate) ** k);
  }

  #track(target, xRate, yRate) {
    this.xAvg = xRate * target[0] + (1 - xRate) * this.xAvg;
    this.yAvg = yRate * target[1] + (1 - yRate) * this.yAvg;
    this.xOrg = this.xAvg - this.xOffset * this.width / this.sf;
    this.yOrg = this.yAvg - this.yOffset * this.height / this.sf;
    this.modelview();
  }

  setAutopan(xRate, yRate, xOffset, yOffset) {
    this.xRate = xRate;
    this.yRate = yRate;
    this.xOffset = xOffset;
    this.yOffset = yOffset;
  }
}
