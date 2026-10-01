/** A collision point on a link (port of physics/LinkPoint.java). */
export class LinkPoint {
  constructor() {
    this.p = [0, 0];        // world position
    this.ploc = [0, 0];     // position in the link's frame
    this.cflag = false;     // currently in contact
    this.cp = [0, 0];       // contact anchor
    this.cnorm = [1, 0];    // contact normal
    this.cfric = 0;
    this.gndSegIndex = -1;
    this.gnd = null;        // the surface (Ground) in contact
    this.pLast = null;      // position at the previous step
    this.bodyCFric = 0;
    this.active = true;
    this.tag = null;
    this.initCollision();
  }

  /** Tags are joined with ':'; each is matched as a prefix of its segment (as in the Java version). */
  containsTag(name) {
    if (this.tag == null) return false;
    let start = 0;
    let sawColon = false;
    for (let i = 0; i < this.tag.length; ++i) {
      if (this.tag.charAt(i) === ':') {
        sawColon = true;
        if (this.tag.startsWith(name, start)) return true;
        start = i + 1;
      }
    }
    if (this.tag.startsWith(name, start)) return true;
    return !sawColon && this.tag === name;
  }

  updateHist() {
    if (this.pLast == null) this.pLast = [0, 0];
    this.pLast[0] = this.p[0];
    this.pLast[1] = this.p[1];
  }

  initCollision() {
    this.cflag = false;
    this.cp[0] = 0; this.cp[1] = 0;
    this.cnorm[0] = 1; this.cnorm[1] = 0;
    this.cfric = 0;
    this.gnd = null;
    this.gndSegIndex = -1;
    this.pLast = null;
  }
}
