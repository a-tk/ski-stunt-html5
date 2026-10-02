// Port of ui/editor/PolygonView.java: a pannable, zoomable canvas for editing a polygon (a MapData).
// Drag a point to move it, click an edge to add a point, shift-click (or right-click) a point to delete
// it, drag the background to pan, scroll to zoom. The map editor and object editor share it; they add
// overlays and extra things to grab through the hook properties.
import { MapData } from '../../terrain/mapdata.js';

const DRAG_NONE = 0;
const DRAG_POINT = 1;
const DRAG_PAN = 2;
/** Hooks use DRAG_EXTRA (or larger) for their own drags. */
export const DRAG_EXTRA = 3;

function distToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

export class PolygonView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} listener
   * @param {(i:number)=>void} listener.selected   a point was picked (-1 = none)
   * @param {(at:number,x:number,y:number)=>void} listener.insertPoint
   * @param {(i:number)=>void} listener.deletePoint
   * @param {(i:number)=>void} listener.pointMoved   while dragging
   * @param {()=>void} listener.editFinished         a drag finished
   * @param {()=>void} [listener.zoomChanged]
   */
  constructor(canvas, listener) {
    this.canvas = canvas;
    this.listener = listener;
    this.data = new MapData();
    this.sel = -1;
    this.cx = 0;
    this.cy = 0;
    this.scale = 5;          // pixels per world unit
    this.fitScale = 5;       // the scale 'fit' chose, reported as 100%
    this.drag = DRAG_NONE;
    this.lastX = 0;
    this.lastY = 0;
    this.needFit = false;
    // overridable hooks
    this.extendBounds = (_box) => {};
    this.paintUnder = (_ctx) => {};
    this.paintOver = (_ctx) => {};
    this.fillColor = () => '#fff';
    this.edgeColor = (_i) => '#000';
    this.pressExtra = (_e) => false;
    this.draggedExtra = (_e) => {};
    this.released = (_mode) => {};

    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', (e) => this.press(e));
    canvas.addEventListener('pointermove', (e) => this.dragged(e));
    canvas.addEventListener('pointerup', (e) => this.release(e));
    canvas.addEventListener('pointercancel', (e) => this.release(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
    }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      if (e.key === '+' || e.key === '=') this.zoomCentered(1.5);
      else if (e.key === '-' || e.key === '_') this.zoomCentered(1 / 1.5);
      else if (e.key === '0') { this.fit(); this.render(); } else return;
      e.preventDefault();
    });
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(canvas);
  }

  get width() { return this.canvas.clientWidth; }
  get height() { return this.canvas.clientHeight; }

  wx(px) { return this.cx + (px - this.width / 2) / this.scale; }
  wy(py) { return this.cy - (py - this.height / 2) / this.scale; }
  px(x) { return Math.round(this.width / 2 + (x - this.cx) * this.scale); }
  py(y) { return Math.round(this.height / 2 - (y - this.cy) * this.scale); }
  zoomPercent() { return Math.round(100 * this.scale / this.fitScale); }
  zoomed() { this.listener.zoomChanged?.(); }

  /** Frames the whole polygon (and whatever the hooks add). */
  fit() {
    const box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of this.data.pts) {
      box[0] = Math.min(box[0], p.x); box[1] = Math.max(box[1], p.x);
      box[2] = Math.min(box[2], p.y); box[3] = Math.max(box[3], p.y);
    }
    this.extendBounds(box);
    if (box[0] > box[1]) return;
    this.cx = (box[0] + box[1]) / 2;
    this.cy = (box[2] + box[3]) / 2;
    const w = Math.max(this.width, 100);
    const h = Math.max(this.height, 100);
    this.needFit = this.width < 100 || this.height < 100;
    this.scale = 0.9 * Math.min(w / Math.max(box[1] - box[0], 0.01), h / Math.max(box[3] - box[2], 0.01));
    this.fitScale = this.scale;
    this.zoomed();
  }

  zoomBy(factor, ax, ay) {
    const before = this.scale;
    this.scale = Math.max(0.2, Math.min(5000, this.scale * factor));
    const wxp = this.cx + (ax - this.width / 2) / before;
    const wyp = this.cy - (ay - this.height / 2) / before;
    this.cx = wxp - (ax - this.width / 2) / this.scale;
    this.cy = wyp + (ay - this.height / 2) / this.scale;
    this.zoomed();
    this.render();
  }

  zoomCentered(factor) { this.zoomBy(factor, this.width / 2, this.height / 2); }

  /** Centers on point i and zooms to about 10 world units across; false if there is no such point. */
  zoomToPoint(i) {
    if (i < 0 || i >= this.data.pts.length) return false;
    this.cx = this.data.pts[i].x;
    this.cy = this.data.pts[i].y;
    this.scale = Math.max(1, Math.min(5000, Math.max(this.width, 100) / 10));
    this.zoomed();
    this.render();
    return true;
  }

  /** A "nice" grid spacing that's at least ~60 px wide. */
  gridStep() {
    const raw = 60 / this.scale;
    const pow = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
    return 10 * pow;
  }

  // ---------------------------------------------------------------- painting

  render() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = this.width;
    const h = this.height;
    if (w <= 0 || h <= 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    if (this.needFit) { this.needFit = false; this.fit(); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e1ebf5';
    ctx.fillRect(0, 0, w, h);

    const step = this.gridStep();
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    for (let x = Math.floor(this.wx(0) / step) * step; x < this.wx(w); x += step) {
      ctx.strokeStyle = '#c8d4e2';
      ctx.beginPath(); ctx.moveTo(this.px(x) + 0.5, 0); ctx.lineTo(this.px(x) + 0.5, h); ctx.stroke();
      ctx.fillStyle = '#6e7887';
      ctx.fillText(Number(x.toPrecision(4)).toString(), this.px(x) + 2, h - 3);
    }
    for (let y = Math.floor(this.wy(h) / step) * step; y < this.wy(0); y += step) {
      ctx.strokeStyle = '#c8d4e2';
      ctx.beginPath(); ctx.moveTo(0, this.py(y) + 0.5); ctx.lineTo(w, this.py(y) + 0.5); ctx.stroke();
      ctx.fillStyle = '#6e7887';
      ctx.fillText(Number(y.toPrecision(4)).toString(), 3, this.py(y) - 2);
    }

    this.paintUnder(ctx);
    const { pts } = this.data;
    const n = pts.length;
    if (n >= 2) {
      const xs = pts.map((p) => this.px(p.x));
      const ys = pts.map((p) => this.py(p.y));
      ctx.beginPath();
      for (const [i, x] of xs.entries()) {
        if (i === 0) ctx.moveTo(x, ys[i]);
        else ctx.lineTo(x, ys[i]);
      }
      ctx.closePath();
      ctx.fillStyle = this.fillColor();
      ctx.fill();
      ctx.lineWidth = 3;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        ctx.strokeStyle = this.edgeColor(i);
        ctx.beginPath(); ctx.moveTo(xs[i], ys[i]); ctx.lineTo(xs[j], ys[j]); ctx.stroke();
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i === this.sel ? '#e00' : '#fff';
        ctx.fillRect(xs[i] - 3, ys[i] - 3, 7, 7);
        ctx.strokeStyle = i === this.sel ? '#e00' : '#000';
        ctx.strokeRect(xs[i] - 3.5, ys[i] - 3.5, 7, 7);
      }
    }
    this.paintOver(ctx);
  }

  // ---------------------------------------------------------------- mouse

  press(e) {
    this.canvas.focus();
    this.canvas.setPointerCapture(e.pointerId);
    const mx = e.offsetX;
    const my = e.offsetY;
    this.lastX = mx;
    this.lastY = my;
    const remove = e.shiftKey || e.button === 2;
    const { pts } = this.data;
    const n = pts.length;
    // points first (so a point on a marker is still grabbable)
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.px(pts[i].x) - mx) <= 6 && Math.abs(this.py(pts[i].y) - my) <= 6) {
        if (remove) {
          this.listener.deletePoint(i);
          this.listener.editFinished();
        } else {
          this.sel = i;
          this.listener.selected(i);
          this.drag = DRAG_POINT;
        }
        this.render();
        return;
      }
    }
    if (this.pressExtra(e)) { this.render(); return; }
    // click on an edge: add a point there and start dragging it
    for (let i = 0; i < n && !remove; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (distToSegment(mx, my, this.px(a.x), this.py(a.y), this.px(b.x), this.py(b.y)) <= 5) {
        this.listener.insertPoint(i + 1, this.wx(mx), this.wy(my));
        this.drag = DRAG_POINT;
        this.render();
        return;
      }
    }
    this.drag = DRAG_PAN;
  }

  dragged(e) {
    if (this.drag === DRAG_NONE) return;
    const mx = e.offsetX;
    const my = e.offsetY;
    if (this.drag === DRAG_POINT && this.sel >= 0 && this.sel < this.data.pts.length) {
      const p = this.data.pts[this.sel];
      p.x = this.wx(mx);
      p.y = this.wy(my);
      this.listener.pointMoved(this.sel);
    } else if (this.drag === DRAG_PAN) {
      this.cx -= (mx - this.lastX) / this.scale;
      this.cy += (my - this.lastY) / this.scale;
    } else if (this.drag >= DRAG_EXTRA) {
      this.draggedExtra(e);
    }
    this.lastX = mx;
    this.lastY = my;
    this.render();
  }

  release(_e) {
    const was = this.drag;
    this.drag = DRAG_NONE;
    if (was === DRAG_POINT) this.listener.editFinished();
    else if (was >= DRAG_EXTRA) this.released(was);
    this.render();
  }
}
