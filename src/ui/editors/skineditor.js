// Port of ui/editor/SkinEditor.java: edits the polygons of the current skin -- drag vertices, add and
// delete polygons, change fill and outline color/width and the polygon's name. Edits to the skier show
// up in the game immediately (the detached skis update on Save). Skins live in memory (the virtual file
// system); built-in skins are read-only and Download saves a skin as a zip. Textures are not set here:
// they stay in the .poly files and are kept when saving.
import { el, field, parse, toHex, fromHex } from '../dom.js';
import { openEditor } from './host.js';
import { PolygonView } from './polygonview.js';
import { ContextRenderer } from '../../gfx/renderer.js';
import { MapData, Pt } from '../../terrain/mapdata.js';
import { Poly } from '../../art/linkdecor.js';
import { SkinLoader, SKINS_DIR, SKIER, SKI_FIGS } from '../../art/skinloader.js';
import { makeZip } from '../../storage/zip.js';
import { downloadFile } from '../../storage/download.js';

export function openSkinEditor(app) {
  return openEditor(app, 'Skin Editor', (body, a, close) => new SkinEditor(body, a, close));
}

class SkinEditor {
  constructor(body, app, close) {
    this.app = app;
    this.world = app.world;
    this.vfs = app.vfs;
    this.close = close;
    this.entries = [];       // {decor, poly, index}
    this.sel = -1;
    this.updating = false;
    this.figName = SKIER;
    this.build(body);
    app.onSkinChanged = () => this.rebuild(true);
    this.rebuild(true);
  }

  destroy() { if (this.app.onSkinChanged) this.app.onSkinChanged = null; }

  get skin() { return this.app.currentSkin; }
  get fig() { return this.world.findArtfig(this.figName); }

  // ---------------------------------------------------------------- UI

  build(body) {
    const btn = (label, fn) => el('button', { type: 'button', onclick: fn }, label);
    const canvas = el('canvas', { class: 'poly' });
    this.zoomLabel = el('span', { class: 'zoom' }, 'Zoom 100%');
    this.figSel = el('select', { onchange: () => { this.figName = this.figSel.value; this.rebuild(true); } },
      el('option', { value: SKIER }, 'Skier'), el('option', { value: SKI_FIGS[0] }, 'Detached ski'));
    body.append(
      el('div', { class: 'tools' }, this.figSel, btn('Zoom +', () => this.view.zoomCentered(1.5)), btn('Zoom −', () => this.view.zoomCentered(1 / 1.5)),
        btn('Fit all', () => { this.view.fit(); this.view.render(); }), this.zoomLabel),
      canvas,
      el('div', { class: 'small hint' }, 'Click a polygon to select it; drag its points; click an edge to add a point; shift-click a point to delete it.'),
    );
    this.view = new PolygonView(canvas, {
      selected: (i) => { this.view.sel = i; this.view.render(); },
      insertPoint: (at, x, y) => { this.view.data.pts.splice(at, 0, new Pt(x, y, 0)); this.view.sel = at; this.writeBack(); },
      deletePoint: (i) => { if (this.view.data.pts.length > 3) { this.view.data.pts.splice(i, 1); this.view.sel = Math.min(i, this.view.data.pts.length - 1); this.writeBack(); } },
      pointMoved: () => this.writeBack(),
      editFinished: () => this.writeBack(),
      zoomChanged: () => { this.zoomLabel.textContent = `Zoom ${this.view.zoomPercent()}%`; },
    });
    this.installHooks();

    this.polyList = el('select', { size: 7, onchange: () => this.select(this.polyList.selectedIndex) });
    body.append(el('details', { open: true }, el('summary', {}, 'Polygons'), this.polyList,
      el('div', { class: 'row' }, btn('New', () => this.addPoly()), btn('Delete', () => this.deletePoly()), btn('Up', () => this.movePoly(-1)), btn('Down', () => this.movePoly(1)))));

    this.labelF = field('name', { width: 130, onChange: (t) => this.setLabel(t) });
    this.fillIn = el('input', { type: 'color', oninput: () => this.setColor('color', this.fillIn.value) });
    this.outlineIn = el('input', { type: 'color', oninput: () => this.setColor('outline', this.outlineIn.value) });
    this.widthF = field('outline width', { width: 50, onChange: (t) => this.setWidth(t) });
    body.append(el('details', { open: true }, el('summary', {}, 'Look'),
      el('div', { class: 'row' }, this.labelF.row),
      el('div', { class: 'row' }, el('label', { class: 'field' }, el('span', {}, 'fill'), this.fillIn), el('label', { class: 'field' }, el('span', {}, 'outline'), this.outlineIn), this.widthF.row)));

    this.nameIn = el('input', { type: 'text', size: 14, placeholder: 'skin name' });
    this.status = el('div', { class: 'status' });
    body.append(el('details', { open: true }, el('summary', {}, 'Skin files (kept in this tab only)'),
      el('div', { class: 'row' }, btn('Save', () => this.save()), this.nameIn, btn('Save As', () => this.saveAs()), btn('Reload', () => this.reload()), btn('Download…', () => this.download()))), this.status);
  }

  installHooks() {
    const v = this.view;
    v.extendBounds = (box) => {
      for (const e of this.entries) {
        for (let j = 0; j < e.poly.nPoints; j++) {
          const g = [0, 0];
          e.decor.restLocalToGlobal([e.poly.xPoints[j], e.poly.yPoints[j]], g);
          box[0] = Math.min(box[0], g[0]); box[1] = Math.max(box[1], g[0]);
          box[2] = Math.min(box[2], g[1]); box[3] = Math.max(box[3], g[1]);
        }
      }
    };
    v.fillColor = () => 'rgba(255,255,255,0)';
    v.edgeColor = () => '#e00';
    v.paintUnder = (ctx) => {
      const r = new ContextRenderer(ctx, (x) => v.px(x), (y) => v.py(y));
      for (const d of this.fig?.linkDecors ?? []) d.drawRest(r);
    };
    v.pressExtra = (e) => {
      // pick the topmost polygon under the pointer
      const x = v.wx(e.offsetX);
      const y = v.wy(e.offsetY);
      for (let k = this.entries.length - 1; k >= 0; k--) {
        if (this.polyContains(this.entries[k], x, y)) { this.select(k); return true; }
      }
      return false;
    };
  }

  polyContains(entry, x, y) {
    const g = [0, 0];
    const pts = [];
    for (let j = 0; j < entry.poly.nPoints; j++) { entry.decor.restLocalToGlobal([entry.poly.xPoints[j], entry.poly.yPoints[j]], g); pts.push([g[0], g[1]]); }
    let inn = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) inn = !inn;
    }
    return inn;
  }

  setStatus(text, warn = false) { this.status.textContent = text; this.status.classList.toggle('warn', warn); }
  isBuiltin() { return !!this.vfs.manifestData && this.vfs.manifestData.skins.some((s) => s.dir === this.skin) && !this.vfs.isUserFile(`${SKINS_DIR}${this.skin}/skin.txt`); }

  // ---------------------------------------------------------------- model <-> UI

  describe(e) {
    const file = (e.decor.path ?? '?').split('/').pop();
    return `${file}: ${e.poly.label ?? `poly ${e.index + 1}`}`;
  }

  rebuild(refit) {
    const keep = this.sel;
    this.entries = [];
    for (const d of this.fig?.linkDecors ?? []) d.polygons.forEach((p, i) => this.entries.push({ decor: d, poly: p, index: i }));
    this.updating = true;
    this.polyList.replaceChildren(...this.entries.map((e) => el('option', {}, this.describe(e))));
    this.updating = false;
    this.sel = -1;
    this.select(!refit && keep >= 0 && keep < this.entries.length ? keep : (this.entries.length ? 0 : -1));
    if (refit) this.view.fit();
    this.view.render();
    this.setStatus(`Skin: ${this.skin}${this.isBuiltin() ? ' (built-in, read-only: use Save As)' : ''}`);
  }

  select(i) {
    this.sel = i;
    this.updating = true;
    if (i >= 0) this.polyList.selectedIndex = i;
    this.updating = false;
    const e = this.entries[i];
    const data = new MapData();
    if (e) {
      const g = [0, 0];
      for (let j = 0; j < e.poly.nPoints; j++) { e.decor.restLocalToGlobal([e.poly.xPoints[j], e.poly.yPoints[j]], g); data.pts.push(new Pt(g[0], g[1], 0)); }
    }
    this.view.data = data;
    this.view.sel = data.pts.length ? 0 : -1;
    this.showProps();
    this.view.render();
  }

  showProps() {
    const e = this.entries[this.sel];
    this.updating = true;
    for (const f of [this.labelF, this.widthF]) f.input.disabled = !e;
    this.fillIn.disabled = this.outlineIn.disabled = !e;
    if (e) {
      this.labelF.input.value = e.poly.label ?? '';
      this.fillIn.value = toHex(e.poly.color ?? [128, 128, 128]);
      this.outlineIn.value = toHex(e.poly.outline);
      this.widthF.input.value = String(e.poly.outlineWidth);
    }
    this.updating = false;
  }

  /** The view's points (global rest-pose coordinates) -> the polygon's link-local arrays. */
  writeBack() {
    const e = this.entries[this.sel];
    if (!e) return;
    const pts = this.view.data.pts;
    const loc = [0, 0];
    e.poly.nPoints = pts.length;
    e.poly.xPoints = [];
    e.poly.yPoints = [];
    for (const p of pts) { e.decor.restGlobalToLocal([p.x, p.y], loc); e.poly.xPoints.push(loc[0]); e.poly.yPoints.push(loc[1]); }
    this.app.requestRedraw();
    this.view.render();
  }

  setLabel(t) {
    const e = this.entries[this.sel];
    if (this.updating || !e) return;
    e.poly.label = t.trim() === '' ? null : t.trim();
    this.polyList.options[this.sel].textContent = this.describe(e);
  }

  setColor(which, hex) {
    const e = this.entries[this.sel];
    if (this.updating || !e) return;
    e.poly[which] = fromHex(hex);
    this.app.requestRedraw();
    this.view.render();
  }

  setWidth(t) {
    const e = this.entries[this.sel];
    const v = parse(t);
    if (this.updating || !e || v === undefined) return;
    e.poly.outlineWidth = Math.max(0, v);
    this.app.requestRedraw();
    this.view.render();
  }

  addPoly() {
    const at = this.entries[this.sel] ?? this.entries[0];
    if (!at) return;
    const g = [this.view.cx, this.view.cy];
    const loc = [0, 0];
    at.decor.restGlobalToLocal(g, loc);
    const r = 0.1;
    const p = new Poly();
    p.label = 'new poly';
    p.color = [200, 200, 200];
    p.nPoints = 3;
    p.xPoints = [loc[0] - r, loc[0] + r, loc[0]];
    p.yPoints = [loc[1] - r, loc[1] - r, loc[1] + r];
    p.tmpPoints = null;
    at.decor.polygons.splice(at.index + 1, 0, p);
    this.rebuild(false);
    this.select(this.entries.findIndex((e) => e.poly === p));
    this.app.requestRedraw();
  }

  deletePoly() {
    const e = this.entries[this.sel];
    if (!e) return;
    e.decor.polygons.splice(e.index, 1);
    const keep = Math.min(this.sel, this.entries.length - 2);
    this.rebuild(false);
    this.select(keep);
    this.app.requestRedraw();
  }

  /** Moves the selected polygon earlier (-1) or later (+1) in its file, which changes draw order. */
  movePoly(dir) {
    const e = this.entries[this.sel];
    if (!e) return;
    const polys = e.decor.polygons;
    const j = e.index + dir;
    if (j < 0 || j >= polys.length) return;
    [polys[e.index], polys[j]] = [polys[j], polys[e.index]];
    this.rebuild(false);
    this.select(this.entries.findIndex((x) => x.poly === e.poly));
    this.app.requestRedraw();
  }

  // ---------------------------------------------------------------- files (in memory) and download

  /** All decors that belong to the skin: the skier's and the first detached ski's. */
  skinDecors() { return [SKIER, SKI_FIGS[0]].flatMap((n) => this.world.findArtfig(n)?.linkDecors ?? []); }

  async save() {
    if (this.isBuiltin()) { this.setStatus('Built-in skins are read-only. Type a name and use Save As.', true); return; }
    for (const d of this.skinDecors()) this.vfs.writeText(d.path, d.toText());
    await SkinLoader.apply(this.world, this.skin);   // reloads everything (the other ski too) from the files
    this.rebuild(false);
    this.app.requestRedraw();
    this.setStatus(`Saved skin ${this.skin} (in this tab; use Download to keep it)`);
  }

  /** The files of a skin directory: the built-in ones from the manifest plus anything made in this tab. */
  async skinFiles(dir) {
    const m = await this.vfs.manifest();
    const names = new Set(m.skins.find((s) => s.dir === dir)?.files ?? []);
    const prefix = `${SKINS_DIR}${dir}/`;
    for (const f of this.vfs.userFiles()) if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) names.add(f.slice(prefix.length));
    return [...names].sort();
  }

  async saveAs() {
    const label = this.nameIn.value.trim();
    const dir = label.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    if (!dir || dir === '_') { this.setStatus('Enter a name for the new skin (letters and digits).', true); return; }
    if (await this.vfs.exists(`${SKINS_DIR}${dir}/skin.txt`)) { this.setStatus(`A skin named '${dir}' already exists.`, true); return; }
    const from = this.skin;
    // copy the files (textures included), name the new manifest, then write the edited polygons there
    const decorFiles = new Map(this.skinDecors().map((d) => [d.path, d]));
    for (const f of await this.skinFiles(from)) {
      const src = `${SKINS_DIR}${from}/${f}`;
      const bytes = await this.vfs.readBytes(src);
      if (!bytes) continue;
      const dst = `${SKINS_DIR}${dir}/${f}`;
      if (f === 'skin.txt') {
        let text = new TextDecoder().decode(bytes);
        text = /^name .*$/m.test(text) ? text.replace(/^name .*$/m, `name ${label}`) : `name ${label}\r\n${text}`;
        this.vfs.writeText(dst, text);
      } else if (decorFiles.has(src)) {
        this.vfs.writeText(dst, decorFiles.get(src).toText());
      } else {
        this.vfs.writeBytes(dst, bytes);
      }
    }
    await SkinLoader.apply(this.world, dir);
    this.app.addSkin(label, dir);
    this.nameIn.value = '';
    this.rebuild(true);
    this.setStatus(`Saved new skin ${label} (in this tab; use Download to keep it)`);
  }

  async reload() {
    await SkinLoader.apply(this.world, this.skin);
    this.rebuild(false);
    this.app.requestRedraw();
  }

  async download() {
    const dir = this.skin;
    const decorFiles = new Map(this.skinDecors().map((d) => [d.path, d]));
    const files = [];
    for (const f of await this.skinFiles(dir)) {
      const src = `${SKINS_DIR}${dir}/${f}`;
      const bytes = decorFiles.has(src) ? decorFiles.get(src).toText() : await this.vfs.readBytes(src);
      if (bytes) files.push({ path: src, bytes });
    }
    downloadFile(`skin_${dir}.zip`, makeZip(files), 'application/zip');
    this.setStatus(`Downloaded skin ${dir} as a zip. Unzip it into the game's assets folder to use it.`);
  }
}
