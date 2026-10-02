// Port of ui/Hotzone.java: the square on screen whose mouse position steers the skier.
// Coordinates are in pixels of the game canvas; y is measured up from the bottom.
const ZONE_FRACTION = 0.6;   // the steering square's side, as a fraction of the canvas's shorter side

export class Hotzone {
  constructor(width = 0, height = 0) {
    this.show = true;
    this.x1 = 5; this.x2 = 205; this.y1 = 5; this.y2 = 205;
    this.dx = 200; this.dy = 200;
    this.width = width;
    this.height = height;
    this.init(width, height);
  }

  /** The default zone: the whole canvas, 5 px in from each side. */
  init(width, height) {
    this.width = width;
    this.height = height;
    this.x1 = 5;
    this.x2 = width - 5;
    this.y1 = 5;
    this.y2 = height - 5;
    this.dx = this.x2 - this.x1;
    this.dy = this.y2 - this.y1;
  }

  set(x1, x2, y1, y2) {
    this.x1 = x1; this.x2 = x2; this.y1 = y1; this.y2 = y2;
    this.dx = x2 - x1;
    this.dy = y2 - y1;
  }

  /** Mouse position (px, py from the top left) -> normalized (0..1 inside the zone, unclamped). */
  normalize(px, py, out) {
    out[0] = (px - this.x1) / this.dx;
    out[1] = (this.height - py - this.y1) / this.dy;
  }

  /**
   * Makes the zone a square 'fraction' of the canvas's shorter side, centered on the canvas, so the same
   * pointer position always gives the same steering input whatever the screen size.
   */
  fitViewport(width, height, fraction = ZONE_FRACTION) {
    const side = Math.round(Math.min(width, height) * fraction);
    const x1 = Math.round((width - side) / 2);
    const y1 = Math.round((height - side) / 2);
    this.width = width;
    this.height = height;
    this.set(x1, x1 + side, y1, y1 + side);
  }

  /** Moves the zone (keeping its size) so it is centered on the pointer, as far as the canvas edges allow. */
  centerOn(mx, my, width = this.width, height = this.height) {
    const w = this.x2 - this.x1;
    const h = this.y2 - this.y1;
    const x1 = Math.max(0, Math.min(width - w, Math.round(mx - w / 2)));
    const y1 = Math.max(0, Math.min(height - h, Math.round(height - my - h / 2)));
    this.set(x1, x1 + w, y1, y1 + h);
    this.height = height;
    this.width = width;
  }

  toggle() { this.show = !this.show; }

  draw(r) {
    if (!this.show) return;
    const top = this.height - this.y2;
    const bottom = this.height - this.y1;
    r.strokeRectPx(this.x1, top, this.x2 - this.x1, bottom - top, '#000');
  }
}
