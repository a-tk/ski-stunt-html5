// Port of util/Vector3.java.
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  normalize() { const s = 1 / Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); return new Vector3(this.x * s, this.y * s, this.z * s); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  add(v) { return new Vector3(v.x + this.x, v.y + this.y, v.z + this.z); }
  subtract(v) { return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z); }
  mult(s) { return new Vector3(this.x * s, this.y * s, this.z * s); }
  mag() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  cross(v) { return new Vector3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
}
