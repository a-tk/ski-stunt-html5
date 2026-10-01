// Port of gfx/Winview.java: the camera (position, zoom and the smoothing filter that follows the skier).
export class Winview {
  constructor(world) {
    this.world = world;
    this.gfx2d = null;
    this.width = 0;
    this.height = 0;
    this.x_org = 0;          // lower-left corner of the view, in world coordinates
    this.y_org = 0;
    this.sf = 1;             // pixels per world unit
    this.x_avg = 0;
    this.y_avg = 0;
    this.x_rate = 1;
    this.y_rate = 1;
    this.x_offset = 0.5;
    this.y_offset = 0.5;
    this.zoomLevel = 0;
    this.SETCAM = 999;
  }

  setGfx2D(g) { this.gfx2d = g; }

  init(width, height, xOrg, yOrg, sf) {
    this.width = width;
    this.height = height;
    this.x_org = xOrg;
    this.y_org = yOrg;
    this.sf = sf;
    this.x_avg = this.x_org + 0.5 * width / sf;
    this.y_avg = this.y_org + 0.5 * height / sf;
    this.x_rate = 0.05;
    this.y_rate = 0.01;
  }

  /** The drawing area changed size: keep the scale and the point at the view's center. */
  resize(width, height) {
    const cx = this.x_org + 0.5 * this.width / this.sf;
    const cy = this.y_org + 0.5 * this.height / this.sf;
    this.width = width;
    this.height = height;
    this.x_org = cx - 0.5 * width / this.sf;
    this.y_org = cy - 0.5 * height / this.sf;
    this.modelview();
  }

  setZoom(level) { this.changeZoom(level - this.zoomLevel); }

  /** Zooms by n steps (each x1.3; negative zooms out) around the view's center. */
  changeZoom(n) {
    const factor = 1.3;
    this.zoomLevel += n;
    let f = factor;
    if (n < 0) { n = -n; f = 1 / factor; }
    const cx = this.x_org + 0.5 * this.width / this.sf;
    const cy = this.y_org + 0.5 * this.height / this.sf;
    for (let i = 0; i < n; i++) this.sf *= f;
    this.x_org = cx - this.x_offset * this.width / this.sf;
    this.y_org = cy - this.y_offset * this.height / this.sf;
    const skier = this.world.findArtfig('skier');
    if (skier) this.recenter(skier.links[skier.root].org_loc, 999);
    else this.modelview();
  }

  modelview() {
    if (!this.gfx2d) return;
    const top = this.y_org + this.height / this.sf;
    this.gfx2d.ortho(this.x_org, this.x_org + this.width / this.sf, this.y_org, top);
  }

  /** Moves the camera toward target [x, y]; steps = SETCAM snaps to it first. */
  recenter(target, steps = 1) {
    if (steps === 999) {
      this.x_avg = target[0];
      this.y_avg = target[1];
      steps = 1;
    }
    if (this.x_rate !== 0 || this.y_rate !== 0) {
      for (let i = 0; i < steps; i++) this.#track(target, this.x_rate, this.y_rate);
    }
  }

  /**
   * Like recenter, but for a camera that moves every rendered frame: 'dt' seconds of sim time have
   * passed since the last call, and the smoothing rates (which are per 'dtDisp' step) are rescaled to match.
   */
  follow(target, dt, dtDisp) {
    if (this.x_rate === 0 && this.y_rate === 0) return;
    const k = dt / dtDisp;
    this.#track(target, 1 - (1 - this.x_rate) ** k, 1 - (1 - this.y_rate) ** k);
  }

  #track(target, xRate, yRate) {
    this.x_avg = xRate * target[0] + (1 - xRate) * this.x_avg;
    this.y_avg = yRate * target[1] + (1 - yRate) * this.y_avg;
    this.x_org = this.x_avg - this.x_offset * this.width / this.sf;
    this.y_org = this.y_avg - this.y_offset * this.height / this.sf;
    this.modelview();
  }

  set_autopan(xRate, yRate, xOffset, yOffset) {
    this.x_rate = xRate;
    this.y_rate = yRate;
    this.x_offset = xOffset;
    this.y_offset = yOffset;
  }
}
