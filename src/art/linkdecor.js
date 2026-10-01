// Port of art/LinkDecor.java: a set of polygons attached to one link of a figure.
//
// File format (one command per line, '#' starts a comment):
//   link N                      1-based index of the link the polys attach to
//   start_poly [label]          begin a polygon (a '#' comment just before it also serves as label)
//   color R G B                 fill color
//   outline R G B [width]       outline color and width (default 0 0 0 1; width 0 = no outline)
//   texture FILE [scale]        tile an image over the fill; FILE is relative to this file,
//                               scale is the width of one tile in world units (default 1)
//   new_pt X Y                  vertex, in global rest-pose coordinates
//   end_poly
import { tokens, num, int, lines } from '../util/text.js';

const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/** One filled polygon of a decor, in link-local coordinates. */
export class Poly {
  constructor() {
    this.label = null;
    this.color = null;          // [r, g, b] 0..255
    this.outline = [0, 0, 0];
    this.outlineWidth = 1;
    this.textureFile = null;
    this.texture = null;        // a loaded image or null
    this.textureScale = 1;
    this.xPoints = [];
    this.yPoints = [];
    this.nPoints = 0;
    this.tmpPoints = [];
  }
}

export class LinkDecor {
  constructor() {
    this.link = null;
    this.linkIndex = 0;
    this.links = null;
    this.polygons = [];
    this.name = null;
    this.show = true;
    this.currPoly = null;
    this.path = null;           // where it was loaded from (user decors are written back there)
    this.pendingLabel = null;
    this.pose = null;           // per-link reference pose [orgx, orgy, cos, sin]
    this.restOrg = [0, 0];      // reference transform of the current link
    this.restCth = 1;
    this.restSth = 0;
    this.loadImage = null;      // (path) => Promise<image|null>
  }

  /**
   * A decor for one filled polygon on 'link', given in link-local coordinates, drawn the way an
   * ObjectType looks (fill, outline, optional texture whose tile width is textureWidth).
   */
  static forPolygon(link, lx, ly, type, textureWidth) {
    const d = new LinkDecor();
    d.link = link;
    const p = new Poly();
    p.color = type.fill;
    p.outline = type.outline;
    p.outlineWidth = type.outlineWidth;
    p.textureFile = type.textureFile;
    p.texture = type.texture;
    p.textureScale = textureWidth;
    p.nPoints = lx.length;
    p.xPoints = lx.slice();
    p.yPoints = ly.slice();
    p.tmpPoints = null;
    d.polygons.push(p);
    return d;
  }

  /**
   * Loads a .poly file; its vertices are measured against the per-link reference pose in 'pose'.
   * Returns the decor, or null if the file can't be read.
   */
  static async load(path, world, links, pose) {
    const text = await world.vfs.readText(path);
    if (text == null) { console.log(`Bad URL:${path}`); return null; }
    const d = new LinkDecor();
    d.links = links;
    d.pose = pose;
    d.path = path;
    d.loadImage = (p) => world.loadImage(p);
    const dir = path.substring(0, path.lastIndexOf('/') + 1);
    for (const line of lines(text)) {
      try {
        await d.interp(line, dir);
      } catch (e) {
        console.log(`exception: ${e.message}`);
        return null;
      }
    }
    return d;
  }

  // ---------------------------------------------------------------- coordinates

  /** Link-local to global coordinates, with the link in its current pose or its rest pose. */
  toGlobal(loc, glob, rest) {
    if (rest) {
      glob[0] = this.restOrg[0] + loc[0] * this.restCth - loc[1] * this.restSth;
      glob[1] = this.restOrg[1] + loc[0] * this.restSth + loc[1] * this.restCth;
    } else {
      this.link.loc_to_glob(loc, glob);
    }
  }

  /** Global rest-pose coordinates to link-local coordinates. */
  restGlobalToLocal(glob, loc) {
    const dx = glob[0] - this.restOrg[0];
    const dy = glob[1] - this.restOrg[1];
    loc[0] = dx * this.restCth + dy * this.restSth;
    loc[1] = -dx * this.restSth + dy * this.restCth;
  }

  restLocalToGlobal(loc, glob) { this.toGlobal(loc, glob, true); }

  // ---------------------------------------------------------------- drawing

  draw(r) { if (this.show) this.drawPolys(r, false); }

  /** Draws with the link in its rest pose (as at load time), whether or not the decor is shown. */
  drawRest(r) { this.drawPolys(r, true); }

  drawPolys(r, rest) {
    const loc = [0, 0];
    const glob = [0, 0];
    for (const poly of this.polygons) {
      const gx = new Array(poly.nPoints);
      const gy = new Array(poly.nPoints);
      for (let j = 0; j < poly.nPoints; j++) {
        loc[0] = poly.xPoints[j];
        loc[1] = poly.yPoints[j];
        this.toGlobal(loc, glob, rest);
        gx[j] = glob[0];
        gy[j] = glob[1];
      }
      if (poly.color != null) r.fillPolygon(gx, gy, { color: rgb(poly.color) });
      if (poly.texture != null) {
        const frame = rest
          ? { x: this.restOrg[0], y: this.restOrg[1], cth: this.restCth, sth: this.restSth }
          : { x: this.link.org[0], y: this.link.org[1], cth: this.link.cth, sth: this.link.sth };
        r.fillPolygonTextured(gx, gy, poly.texture, frame, poly.textureScale);
      }
      if (poly.outlineWidth > 0) r.strokePolygon(gx, gy, { color: rgb(poly.outline), width: poly.outlineWidth });
    }
  }

  // ---------------------------------------------------------------- parsing

  async interp(line, dir) {
    const t = tokens(line);
    if (t.length === 0) return;
    const cmd = t[0];
    if (cmd.startsWith('#')) {
      // a comment directly before start_poly names the poly
      const text = line.trim().substring(1).trim();
      this.pendingLabel = text.length > 0 ? text : null;
    } else if (cmd === 'link') this.setLink(t);
    else if (cmd === 'start_poly') this.startPoly(t);
    else if (cmd === 'color') this.setColor(t);
    else if (cmd === 'outline') this.setOutline(t);
    else if (cmd === 'texture') await this.setTexture(t, dir);
    else if (cmd === 'new_pt') this.newPt(t);
    else if (cmd === 'end_poly') this.endPoly();
    else console.log(`Warning: link decor ignoring unknown command: ${cmd}`);
  }

  setLink(a) {
    if (a.length < 2) { console.log('Error: link decor parse error'); return; }
    this.linkIndex = int(a[1]);
    this.link = this.links[this.linkIndex - 1];
    const ref = this.pose[this.linkIndex - 1];
    this.restOrg = [ref[0], ref[1]];
    this.restCth = ref[2];
    this.restSth = ref[3];
  }

  startPoly(a) {
    this.currPoly = new Poly();
    this.currPoly.label = a.length > 1 ? a.slice(1).join(' ') : this.pendingLabel;
    this.pendingLabel = null;
  }

  setColor(a) {
    if (!this.currPoly) return;
    if (a.length < 4) { console.log('Error: link decor parse error'); return; }
    this.currPoly.color = [int(a[1]), int(a[2]), int(a[3])];
  }

  setOutline(a) {
    if (!this.currPoly) return;
    if (a.length < 4) { console.log('Error: link decor parse error'); return; }
    this.currPoly.outline = [int(a[1]), int(a[2]), int(a[3])];
    if (a.length > 4) this.currPoly.outlineWidth = num(a[4]);
  }

  async setTexture(a, dir) {
    if (!this.currPoly) return;
    if (a.length < 2) { console.log('Error: link decor parse error'); return; }
    this.currPoly.textureFile = a[1];
    if (a.length > 2) this.currPoly.textureScale = num(a[2]);
    this.currPoly.texture = this.loadImage ? await this.loadImage(dir + a[1]) : null;
  }

  newPt(a) {
    if (!this.currPoly) return;
    if (a.length < 3) { console.log('Error: link decor parse error'); return; }
    const loc = [0, 0];
    this.restGlobalToLocal([num(a[1]), num(a[2])], loc);
    this.currPoly.tmpPoints.push({ x: loc[0], y: loc[1] });
  }

  endPoly() {
    const p = this.currPoly;
    if (!p) return;
    p.nPoints = p.tmpPoints.length;
    p.xPoints = p.tmpPoints.map((q) => q.x);
    p.yPoints = p.tmpPoints.map((q) => q.y);
    p.tmpPoints = null;
    this.polygons.push(p);
    this.currPoly = null;
  }

  // ---------------------------------------------------------------- saving

  /** The decor in the file format above; points are written in global rest-pose coordinates. */
  toText() {
    let s = `link ${this.linkIndex}\r\n`;
    for (const p of this.polygons) {
      s += '\r\n';
      if (p.label != null) s += `# ${p.label}\r\n`;
      s += 'start_poly\r\n';
      if (p.color != null) s += `color ${p.color.join(' ')}\r\n`;
      if (p.outline.some((v) => v !== 0) || p.outlineWidth !== 1) s += `outline ${p.outline.join(' ')} ${p.outlineWidth}\r\n`;
      if (p.textureFile != null) s += `texture ${p.textureFile} ${p.textureScale}\r\n`;
      const glob = [0, 0];
      for (let j = 0; j < p.nPoints; j++) {
        this.toGlobal([p.xPoints[j], p.yPoints[j]], glob, true);
        s += `new_pt ${glob[0].toFixed(6)} ${glob[1].toFixed(6)}\r\n`;
      }
      s += 'end_poly\r\n';
    }
    return s;
  }
}
