import { FLOAT_MAX } from './math.js';

/** Axis-aligned bounding box: ul = upper-left corner (min x, max y), w, h. Port of util/BBox.java. */
export class BBox {
  constructor() {
    this.ul = [0, 0];
    this.w = 0;
    this.h = 0;
    this.minX = 0; this.maxX = 0; this.minY = 0; this.maxY = 0;
    this.numSample = 0;
  }

  addPoint(x, y) {
    ++this.numSample;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  inside(p) {
    return !(p[0] < this.ul[0]) && !(p[0] > this.ul[0] + this.w) && !(p[1] > this.ul[1]) && !(p[1] < this.ul[1] - this.h);
  }

  intersects(o) {
    if (this.ul[0] > o.ul[0] + o.w) return false;
    if (o.ul[0] > this.ul[0] + this.w) return false;
    if (this.ul[1] < o.ul[1] - o.h) return false;
    return !(o.ul[1] < this.ul[1] - this.h);
  }

  buildInit() {
    this.minX = FLOAT_MAX; this.maxX = -FLOAT_MAX;
    this.minY = FLOAT_MAX; this.maxY = -FLOAT_MAX;
    this.numSample = 0;
  }

  buildEnd() {
    if (this.numSample > 0) {
      this.ul[0] = this.minX;
      this.ul[1] = this.maxY;
      this.w = this.maxX - this.minX;
      this.h = this.maxY - this.minY;
    }
  }
}
