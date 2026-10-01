// Port of gfx/Gfx2D.java: the isotropic, y-up world -> pixel mapping used for drawing.
export class Gfx2D {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.xMin = 0; this.xMax = 1; this.yMin = 0; this.yMax = 1;
    this.dx = 1; this.dy = 1;
  }

  resize(width, height) { this.width = width; this.height = height; }

  ortho(xMin, xMax, yMin, yMax) {
    this.xMin = xMin; this.xMax = xMax; this.yMin = yMin; this.yMax = yMax;
    this.dx = xMax - xMin;
    this.dy = yMax - yMin;
  }

  toViewportX(x) { return this.width * (x - this.xMin) / this.dx; }
  toViewportY(y) { return this.height * (this.yMax - y) / this.dy; }

  /** World point [x, y] -> [px, py]. */
  worldToViewport(p, out = [0, 0]) {
    out[0] = this.toViewportX(p[0]);
    out[1] = this.toViewportY(p[1]);
    return out;
  }

  /** Pixels per world unit. */
  get scale() { return this.width / this.dx; }
}
