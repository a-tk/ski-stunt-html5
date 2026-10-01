// Port of ui/editor/ObjectEditor.java: edits object types (crates, ramps ...) -- the outline, fill and
// outline colors, an optional tiled texture, friction/snow-spray per point and the mass. Objects live in
// memory (the virtual file system) until downloaded; the map editor places them.
import { el, field, parse, toHex, fromHex, setOptions } from '../dom.js';
import { openEditor } from './host.js';
import { PolygonView } from './polygonview.js';
import { ObjectType, listObjects, objectPath, OBJECTS_DIR } from '../../terrain/objecttype.js';
import { makeZip } from '../../storage/zip.js';
import { downloadFile } from '../../storage/download.js';

const fmt = (v, d = 2) => Number(v).toFixed(d);
const IMAGE = /\.(png|jpe?g|gif)$/i;

export function openObjectEditor(app, opts = {}) {
  return openEditor(app, 'Object Editor', (body, a, close) => new ObjectEditor(body, a, close), opts);
}

class ObjectEditor {
  constructor(body, app, close) {
    this.app = app;
    this.world = app.world;
    this.vfs = app.vfs;
    this.close = close;
    this.type = new ObjectType();
    this.key = null;
    this.sel = 0;
    this.updating = false;
    this.build(body);
    this.refreshObjects().then(() => {
      const first = this.objectList.options[0]?.value;
      if (first) this.open(first); else this.showType();
    });
  }

  destroy() { this.app.onObjectsChanged?.(); }

  build(body) {
    const btn = (label, fn) => el('button', { type: 'button', onclick: fn }, label);
    const canvas = el('canvas', { class: 'poly' });
    this.zoomLabel = el('span', { class: 'zoom' }, 'Zoom 100%');
    body.append(
      el('div', { class: 'tools' }, btn('Zoom +', () => this.view.zoomCentered(1.5)), btn('Zoom −', () => this.view.zoomCentered(1 / 1.5)),
        btn('Fit all', () => { this.view.fit(); this.view.render(); }), this.zoomLabel),
      canvas,
    );
    this.view = new PolygonView(canvas, {
      selected: (i) => this.select(i),
      insertPoint: (at, x, y) => this.insertPoint(at, x, y),
      deletePoint: (i) => this.deletePoint(i),
      pointMoved: (i) => this.refreshPointRow(i),
      editFinished: () => this.view.render(),
      zoomChanged: () => { this.zoomLabel.textContent = `Zoom ${this.view.zoomPercent()}%`; },
    });
    this.installHooks();

    this.objectList = el('select', { size: 5, onchange: () => this.open(this.objectList.value) });
    body.append(el('details', { open: true }, el('summary', {}, 'Objects'), this.objectList, el('div', { class: 'row' }, btn('New', () => this.newObject()))));

    this.nameF = field('name', { width: 130, onChange: (t) => { this.type.name = t.trim(); } });
    this.fillIn = el('input', { type: 'color', oninput: () => { this.type.fill = fromHex(this.fillIn.value); this.view.render(); } });
    this.outlineIn = el('input', { type: 'color', oninput: () => { this.type.outline = fromHex(this.outlineIn.value); this.view.render(); } });
    this.widthF = field('outline width', { width: 50, onChange: (t) => { const v = parse(t); if (v !== undefined) this.type.outlineWidth = Math.max(0, v); } });
    this.massF = field('mass kg (pushable)', { width: 55, onChange: (t) => { const v = parse(t); if (v !== undefined) this.type.mass = Math.max(0.1, v); } });
    this.textureSel = el('select', { onchange: () => this.chooseTexture() });
    this.tileF = field('tile width', { width: 50, onChange: (t) => { const v = parse(t); if (v !== undefined) this.type.textureScale = v; } });
    body.append(el('details', { open: true }, el('summary', {}, 'Look'),
      el('div', { class: 'row' }, this.nameF.row),
      el('div', { class: 'row' }, el('label', { class: 'field' }, el('span', {}, 'fill'), this.fillIn), el('label', { class: 'field' }, el('span', {}, 'outline'), this.outlineIn), this.widthF.row),
      el('div', { class: 'row' }, el('label', { class: 'field' }, el('span', {}, 'texture'), this.textureSel), this.tileF.row, this.massF.row)));

    this.pointList = el('select', { size: 6, onchange: () => this.select(this.pointList.selectedIndex) });
    this.ptX = field('x', { onChange: (t) => this.setPoint('x', t) });
    this.ptY = field('y', { onChange: (t) => this.setPoint('y', t) });
    this.ptCf = field('friction', { onChange: (t) => this.setPoint('cf', t) });
    this.ptSnow = field('snow spray', { onChange: (t) => this.setPoint('snow', t) });
    body.append(el('details', {}, el('summary', {}, 'Outline points'), this.pointList,
      el('div', { class: 'row' }, btn('Add point', () => this.addAfterSelected()), btn('Delete point', () => this.deletePoint(this.sel))),
      el('div', { class: 'row' }, this.ptX.row, this.ptY.row, this.ptCf.row, this.ptSnow.row)));

    this.nameIn = el('input', { type: 'text', size: 14, placeholder: 'object name' });
    this.status = el('div', { class: 'status' });
    body.append(el('details', { open: true }, el('summary', {}, 'Object file (kept in this tab only)'),
      el('div', { class: 'row' }, btn('Save', () => this.save()), this.nameIn, btn('Save As', () => this.saveAs()), btn('Reload', () => this.reload()), btn('Download…', () => this.download()))), this.status);
  }

  installHooks() {
    const v = this.view;
    const silhouetteX = () => Math.min(0, ...this.type.shape.pts.map((p) => p.x)) - 1.5;
    v.extendBounds = (box) => { box[0] = Math.min(box[0], silhouetteX() - 0.6); box[2] = Math.min(box[2], 0); box[3] = Math.max(box[3], 2); };
    v.fillColor = () => `rgb(${this.type.fill.join(',')})`;
    v.edgeColor = () => `rgb(${this.type.outline.join(',')})`;
    v.paintUnder = (ctx) => { ctx.strokeStyle = '#78829a'; ctx.beginPath(); ctx.moveTo(0, v.py(0) + 0.5); ctx.lineTo(v.width, v.py(0) + 0.5); ctx.stroke(); };
    v.paintOver = (ctx) => {
      // a 1.8-unit-tall stick skier standing on the ground line, for scale
      const x = silhouetteX();
      ctx.strokeStyle = '#a000a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(v.px(x), v.py(0)); ctx.lineTo(v.px(x), v.py(1.5));
      ctx.moveTo(v.px(x - 0.3), v.py(1)); ctx.lineTo(v.px(x + 0.3), v.py(1)); ctx.stroke();
      ctx.beginPath(); ctx.arc(v.px(x), v.py(1.65), Math.max(2, 0.15 * v.scale), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.fillStyle = '#a000a0'; ctx.fillText('skier', v.px(x) + 6, v.py(0.2));
    };
  }

  setStatus(text, warn = false) { this.status.textContent = text; this.status.classList.toggle('warn', warn); }

  // ---------------------------------------------------------------- loading

  async refreshObjects() {
    const names = await listObjects(this.vfs);
    setOptions(this.objectList, names.map((n) => ({ value: n, label: n })), this.key ?? undefined);
  }

  async imageFiles() {
    const m = await this.vfs.manifest();
    const names = new Set(m.objectFiles.filter((f) => IMAGE.test(f)));
    for (const f of this.vfs.userFiles()) if (f.startsWith(OBJECTS_DIR) && IMAGE.test(f) && !f.slice(OBJECTS_DIR.length).includes('/')) names.add(f.slice(OBJECTS_DIR.length));
    return [...names].sort();
  }

  async open(name) {
    const t = await ObjectType.load(this.world, name);
    if (!t) { this.setStatus(`Unable to read object ${name}`, true); return; }
    this.type = t;
    this.key = name;
    this.sel = 0;
    this.view.data = t.shape;
    this.view.sel = 0;
    await this.showType();
    this.view.fit();
    this.view.render();
    this.setStatus(`Object ${name}`);
  }

  newObject() {
    this.type = new ObjectType();
    this.type.name = 'New object';
    this.key = null;
    this.sel = 0;
    this.view.data = this.type.shape;
    this.view.sel = 0;
    this.showType();
    this.view.fit();
    this.view.render();
    this.setStatus('New object. Type a name and use Save As.');
  }

  reload() { if (this.key == null) this.setStatus("Nothing to reload: this object hasn't been saved.", true); else this.open(this.key); }

  // ---------------------------------------------------------------- UI <-> model

  async showType() {
    const t = this.type;
    this.updating = true;
    this.nameF.input.value = t.name;
    this.fillIn.value = toHex(t.fill);
    this.outlineIn.value = toHex(t.outline);
    this.widthF.input.value = String(t.outlineWidth);
    this.massF.input.value = String(t.mass);
    this.tileF.input.value = String(t.textureScale);
    const files = await this.imageFiles();
    setOptions(this.textureSel, [{ value: '', label: '(none)' }, ...files.map((f) => ({ value: f, label: f }))], t.textureFile ?? '');
    this.pointList.replaceChildren(...t.shape.pts.map((_, i) => el('option', {}, this.describe(i))));
    if (this.sel >= 0) this.pointList.selectedIndex = this.sel;
    this.updating = false;
    this.showPoint();
    this.view.render();
  }

  describe(i) { const p = this.type.shape.pts[i]; return `${i + 1}: ${fmt(p.x)}, ${fmt(p.y)}  cf ${fmt(p.cf)}`; }
  refreshPointRow(i) { const o = this.pointList.options[i]; if (o) o.textContent = this.describe(i); this.showPoint(true); }

  showPoint(keepFocus = false) {
    const p = this.type.shape.pts[this.sel];
    this.updating = true;
    for (const f of [this.ptX, this.ptY, this.ptCf, this.ptSnow]) f.input.disabled = !p;
    const set = (f, v) => { if (!(keepFocus && document.activeElement === f.input)) f.input.value = p ? String(Math.round(v * 1e4) / 1e4) : ''; };
    if (p) { set(this.ptX, p.x); set(this.ptY, p.y); set(this.ptCf, p.cf); set(this.ptSnow, p.extra0()); } else for (const f of [this.ptX, this.ptY, this.ptCf, this.ptSnow]) f.input.value = '';
    this.updating = false;
  }

  select(i) {
    this.sel = i;
    this.view.sel = i;
    this.updating = true;
    if (i >= 0) this.pointList.selectedIndex = i;
    this.updating = false;
    this.showPoint();
    this.view.render();
  }

  setPoint(what, text) {
    const p = this.type.shape.pts[this.sel];
    const v = parse(text);
    if (this.updating || !p || v === undefined) return;
    if (what === 'x') p.x = v; else if (what === 'y') p.y = v; else if (what === 'cf') p.cf = v; else p.setExtra0(v);
    this.pointList.options[this.sel].textContent = this.describe(this.sel);
    this.view.render();
  }

  insertPoint(at, x, y) {
    const p = this.type.shape.pts[at - 1].copy();
    p.x = x; p.y = y;
    this.type.shape.pts.splice(at, 0, p);
    this.sel = at;
    this.view.sel = at;
    this.showType();
  }

  addAfterSelected() {
    const pts = this.type.shape.pts;
    const i = this.sel < 0 ? pts.length - 1 : this.sel;
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    this.insertPoint(i + 1, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  deletePoint(i) {
    if (i < 0) return;
    if (this.type.shape.pts.length <= 3) { this.setStatus('An object needs at least 3 points.', true); return; }
    this.type.shape.pts.splice(i, 1);
    this.sel = Math.min(i, this.type.shape.pts.length - 1);
    this.view.sel = this.sel;
    this.showType();
  }

  async chooseTexture() {
    if (this.updating) return;
    const f = this.textureSel.value;
    this.type.textureFile = f || null;
    this.type.texture = f ? await this.world.loadImage(OBJECTS_DIR + f) : null;
  }

  // ---------------------------------------------------------------- files (in memory) and download

  write(name) {
    if (this.type.shape.pts.length < 3) { this.setStatus('An object needs at least 3 points.', true); return false; }
    this.vfs.writeText(objectPath(name), this.type.toText());
    this.app.onObjectsChanged?.();
    return true;
  }

  save() {
    if (this.key == null) { this.setStatus("This object isn't saved yet. Type a name and use Save As.", true); return; }
    if (this.write(this.key)) this.setStatus(`Saved ${this.key} (in this tab; use Download to keep it)`);
  }

  async saveAs() {
    const name = this.nameIn.value.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    if (!name || name === '_') { this.setStatus('Enter a name for the object (letters and digits).', true); return; }
    if (await this.vfs.exists(objectPath(name))) { this.setStatus(`An object named '${name}' already exists.`, true); return; }
    if (this.write(name)) {
      this.key = name;
      this.nameIn.value = '';
      await this.refreshObjects();
      this.setStatus(`Saved new object ${name} (in this tab; use Download to keep it)`);
    }
  }

  async download() {
    let name = this.key;
    if (name == null) {
      name = this.nameIn.value.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
      if (!name || name === '_') { this.setStatus('Type a name for the downloaded object first.', true); return; }
    }
    const files = [{ path: objectPath(name), bytes: this.type.toText() }];
    if (this.type.textureFile) {
      const img = await this.vfs.readBytes(OBJECTS_DIR + this.type.textureFile);
      if (img) files.push({ path: OBJECTS_DIR + this.type.textureFile, bytes: img });
    }
    downloadFile(`object_${name}.zip`, makeZip(files), 'application/zip');
    this.setStatus(`Downloaded ${name}.obj${files.length > 1 ? ' and its texture' : ''} as a zip. Unzip it into the game's assets folder to use it.`);
  }
}
