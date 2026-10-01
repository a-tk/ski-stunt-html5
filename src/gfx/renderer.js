// The Canvas2D renderer. The engine draws through this small interface (fillPolygon, strokePolygon,
// fillCircle, fillPolygonTextured, strokeRectPx ...) in world coordinates; this class maps them to
// pixels with the world's Gfx2D (isotropic, y up), like Gfx2D did for AWT.
export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../sim/world.js').World} world
   */
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.patterns = new WeakMap();
    this.bgImage = null;
  }

  get g() { return this.world.gfx2d; }

  /** Matches the canvas to its CSS size (and the display's pixel ratio); returns the size in CSS px. */
  fit() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width));
    const h = Math.max(100, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    return { w, h };
  }

  /** Draws one frame: background, then the whole world, clipped to the inset game area. */
  render() {
    const { ctx } = this;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, w, h);
    const { clipX, clipY, clipW, clipH } = this.world;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX + 1, clipY + 1, clipW - 2, clipH - 2);
    ctx.clip();
    if (this.bgImage) ctx.drawImage(this.bgImage, 0, 0, w, h);
    else { ctx.fillStyle = '#9fc4e8'; ctx.fillRect(0, 0, w, h); }
    this.world.draw(this);
    ctx.restore();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(clipX + 0.5, clipY + 0.5, clipW - 1, clipH - 1);
    if (this.world.message) {
      ctx.fillStyle = '#f00';
      ctx.font = '14px sans-serif';
      ctx.fillText(this.world.message, clipX + 20, clipY + 20);
    }
  }

  // ---------------------------------------------------------------- drawing calls (world coordinates)

  path(xs, ys) {
    const { ctx } = this;
    const g = this.g;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const px = g.toViewportX(xs[i]);
      const py = g.toViewportY(ys[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  fillPolygon(xs, ys, { color = '#fff' } = {}) {
    if (xs.length < 3) return;
    this.path(xs, ys);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  strokePolygon(xs, ys, { color = '#000', width = 1 } = {}) {
    if (xs.length < 2) return;
    this.path(xs, ys);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  /** A filled circle of world radius r (skipped when it would be under a pixel). */
  fillCircle(x, y, r, color) {
    const g = this.g;
    const px = g.toViewportX(x);
    const py = g.toViewportY(y);
    const pr = g.toViewportX(x + r) - px;
    if (pr < 1) return;
    this.ctx.beginPath();
    this.ctx.arc(px, py, pr, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  /** A rectangle in pixel coordinates (used for the mouse zone). */
  strokeRectPx(x, y, w, h, color) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  /**
   * Fills a polygon with a tiled image. 'frame' = {x, y, cth, sth} is the frame the texture is anchored
   * in (a link's origin and rotation, or the world's), tileW the width of one tile in that frame's units.
   * Image y points down, frame y points up, so tiles are flipped vertically.
   */
  fillPolygonTextured(xs, ys, image, frame, tileW) {
    if (xs.length < 3 || !image) return;
    const g = this.g;
    const tw = Math.max(tileW, 0.01);
    const th = tw * image.height / image.width;
    const toScreen = (a, b) => {
      const u = a * tw / image.width;
      const v = th - b * th / image.height;
      const wx = frame.x + frame.cth * u - frame.sth * v;
      const wy = frame.y + frame.sth * u + frame.cth * v;
      return [g.toViewportX(wx), g.toViewportY(wy)];
    };
    const p00 = toScreen(0, 0);
    const p10 = toScreen(1, 0);
    const p01 = toScreen(0, 1);
    let pattern = this.patterns.get(image);
    if (!pattern) {
      pattern = this.ctx.createPattern(image, 'repeat');
      this.patterns.set(image, pattern);
    }
    pattern.setTransform(new DOMMatrix([p10[0] - p00[0], p10[1] - p00[1], p01[0] - p00[0], p01[1] - p00[1], p00[0], p00[1]]));
    this.path(xs, ys);
    this.ctx.fillStyle = pattern;
    this.ctx.fill();
  }
}
