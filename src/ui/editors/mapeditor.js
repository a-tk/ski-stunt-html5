// Port of ui/editor/MapEditor.java: edits the map (terrain) that is loaded in the game -- outline points,
// start marker, finish line, per-map physics and placed objects. Every edit is previewed in the game
// right away. Changes live only in memory (the virtual file system); Download saves them as a zip.
import { el, field, parse, toHex, fromHex, setOptions } from '../dom.js';
import { openEditor } from './host.js';
import { PolygonView, DRAG_EXTRA } from './polygonview.js';
import { MapData } from '../../terrain/mapdata.js';
import { MapSettings, Placed, mapFile } from '../../terrain/mapsettings.js';
import { Ground } from '../../terrain/ground.js';
import { Obstacle } from '../../terrain/obstacle.js';
import { ObjectType, listObjects } from '../../terrain/objecttype.js';
import { makeZip } from '../../storage/zip.js';
import { downloadFile } from '../../storage/download.js';
import { openObjectEditor } from './objecteditor.js';

const DRAG_START = DRAG_EXTRA;
const DRAG_FINISH = DRAG_EXTRA + 1;
const DRAG_OBJECT = DRAG_EXTRA + 2;
const fmt = (v, d = 2) => Number(v).toFixed(d);

export function openMapEditor(app) {
  return openEditor(app, 'Map Editor', (body, a, close) => new MapEditor(body, a, close));
}

class MapEditor {
  constructor(body, app, close) {
    this.app = app;
    this.world = app.world;
    this.vfs = app.vfs;
    this.close = close;
    this.data = MapData.flat();
    this.settings = new MapSettings();
    this.gndFile = null;
    this.sel = -1;
    this.objSel = -1;
    this.updating = false;
    this.typeCache = new Map();
    this.timer = null;
    this.grab = [0, 0];
    this.build(body);
    app.onTerrainChanged = () => this.terrainChanged();
    this.load(app.currentTerrain);
  }

  destroy() {
    clearTimeout(this.timer);
    if (this.app.onTerrainChanged) this.app.onTerrainChanged = null;
  }

  /** The object editor on top of this one was closed: pick up any changed objects. */
  async resumed() {
    this.typeCache.clear();
    await this.refreshTypes();
    this.refreshObjects();
    this.applyNow();
  }

  // ---------------------------------------------------------------- UI

  build(body) {
    const canvas = el('canvas', { class: 'poly' });
    this.zoomLabel = el('span', { class: 'zoom' }, 'Zoom 100%');
    const btn = (label, fn) => el('button', { type: 'button', onclick: fn }, label);
    body.append(
      el('div', { class: 'tools' }, btn('Zoom +', () => this.view.zoomCentered(1.5)), btn('Zoom −', () => this.view.zoomCentered(1 / 1.5)),
        btn('Fit all', () => { this.view.fit(); this.view.render(); }),
        btn('Zoom to point', () => { if (!this.view.zoomToPoint(this.sel)) this.setStatus('Select a point first.', true); }), this.zoomLabel),
      canvas,
      el('div', { class: 'small hint' }, 'Drag points; click an edge to add one; shift-click a point to delete it; drag the purple start marker, the green finish line and objects; scroll to zoom.'),
    );
    this.view = new PolygonView(canvas, {
      selected: (i) => this.select(i),
      insertPoint: (at, x, y) => this.insertPoint(at, x, y),
      deletePoint: (i) => this.deletePoint(i),
      pointMoved: (i) => { this.refreshPointRow(i); this.validate(); },
      editFinished: () => this.applyNow(),
      zoomChanged: () => { this.zoomLabel.textContent = `Zoom ${this.view.zoomPercent()}%`; },
    });
    this.installHooks();

    // --- outline points
    this.pointList = el('select', { size: 7, onchange: () => this.select(this.pointList.selectedIndex) });
    this.ptX = field('x', { onChange: (t) => this.setPoint('x', t) });
    this.ptY = field('y', { onChange: (t) => this.setPoint('y', t) });
    this.ptCf = field('friction', { onChange: (t) => this.setPoint('cf', t) });
    this.ptSnow = field('snow spray', { onChange: (t) => this.setPoint('snow', t) });
    body.append(el('details', { open: true }, el('summary', {}, 'Outline points'), this.pointList,
      el('div', { class: 'row' }, btn('Add', () => this.addAfterSelected()), btn('Delete', () => this.deletePoint(this.sel))),
      el('div', { class: 'row' }, this.ptX.row, this.ptY.row, this.ptCf.row, this.ptSnow.row)));

    // --- start / finish / physics
    const s = (key, label) => field(label, { onChange: (t) => this.setSetting(key, t) });
    this.stX = s('startX', 'start x'); this.stY = s('startY', 'start y'); this.finX = s('xApplause', 'finish x');
    this.kpF = s('kp', 'stiffness kp'); this.kdF = s('kd', 'damping kd'); this.kpSkiF = s('kpSki', 'ski kp'); this.kdSkiF = s('kdSki', 'ski kd'); this.cfF = s('cf', 'base friction');
    this.colorIn = el('input', { type: 'color', oninput: () => { this.settings.color = fromHex(this.colorIn.value).map((v) => v / 255); this.edited(); } });
    body.append(el('details', {}, el('summary', {}, 'Start, finish and physics'),
      el('div', { class: 'row' }, this.stX.row, this.stY.row, this.finX.row),
      el('div', { class: 'row' }, this.kpF.row, this.kdF.row, this.kpSkiF.row, this.kdSkiF.row, this.cfF.row),
      el('div', { class: 'row' }, el('label', { class: 'field' }, el('span', {}, 'ground color'), this.colorIn))));

    // --- placed objects
    this.objectList = el('select', { size: 5, onchange: () => this.selectObject(this.objectList.selectedIndex) });
    this.typeSel = el('select', {});
    this.oX = field('x', { width: 60, onChange: (t) => this.setObject('x', t) });
    this.oY = field('y', { width: 60, onChange: (t) => this.setObject('y', t) });
    this.oRot = field('rot°', { width: 55, onChange: (t) => this.setObject('rotation', t) });
    this.oScale = field('scale', { width: 55, onChange: (t) => this.setObject('scale', t) });
    this.oDyn = el('input', { type: 'checkbox', onchange: () => this.setPushable() });
    this.oMass = field('mass kg', { width: 55, onChange: (t) => this.setObject('mass', t) });
    body.append(el('details', { open: true }, el('summary', {}, 'Placed objects'), this.objectList,
      el('div', { class: 'row' }, this.typeSel, btn('Add', () => this.addObject()), btn('Delete', () => this.deleteObject())),
      el('div', { class: 'row' }, this.oX.row, this.oY.row, this.oRot.row, this.oScale.row),
      el('div', { class: 'row' }, el('label', { class: 'field' }, this.oDyn, el('span', {}, 'pushable')), this.oMass.row,
        btn('Drop to ground', () => this.dropToGround()), btn('Edit Objects…', () => openObjectEditor(this.app, { push: true })))));

    // --- file
    this.nameIn = el('input', { type: 'text', size: 14, placeholder: 'map name' });
    this.status = el('div', { class: 'status' });
    body.append(el('details', { open: true }, el('summary', {}, 'Map file (kept in this tab only)'),
      el('div', { class: 'row' }, btn('New', () => this.newMap()), btn('Save', () => this.save()), this.nameIn, btn('Save As', () => this.saveAs()), btn('Reload', () => this.reload())),
      el('div', { class: 'row' }, btn('Download…', () => this.download()))), this.status);
  }

  installHooks() {
    const v = this.view;
    v.extendBounds = (box) => {
      const s = this.settings;
      box[0] = Math.min(box[0], s.startX); box[1] = Math.max(box[1], s.startX);
      box[2] = Math.min(box[2], s.startY - 1); box[3] = Math.max(box[3], s.startY + 3);
      for (const o of s.objects) {
        box[0] = Math.min(box[0], o.x - 1); box[1] = Math.max(box[1], o.x + 1);
        box[2] = Math.min(box[2], o.y - 1); box[3] = Math.max(box[3], o.y + 2);
      }
    };
    v.fillColor = () => `rgb(${this.settings.color.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255)).join(',')})`;
    v.edgeColor = (i) => {
      const t = Math.max(0, Math.min(1, this.data.pts[i].cf / 0.9));
      return `rgb(${Math.round(40 + 190 * t)},70,${Math.round(220 - 190 * t)})`;
    };
    v.paintUnder = (ctx) => {
      for (const [i, o] of this.settings.objects.entries()) {
        const poly = this.outlineOf(o);
        if (!poly) { ctx.strokeStyle = '#e00'; ctx.beginPath(); ctx.moveTo(v.px(o.x) - 6, v.py(o.y) - 6); ctx.lineTo(v.px(o.x) + 6, v.py(o.y) + 6); ctx.moveTo(v.px(o.x) - 6, v.py(o.y) + 6); ctx.lineTo(v.px(o.x) + 6, v.py(o.y) - 6); ctx.stroke(); continue; }
        const t = this.typeCache.get(o.type);
        ctx.beginPath();
        for (const [k, p] of poly.pts.entries()) {
          if (k === 0) ctx.moveTo(v.px(p.x), v.py(p.y));
          else ctx.lineTo(v.px(p.x), v.py(p.y));
        }
        ctx.closePath();
        ctx.fillStyle = `rgb(${t.fill.join(',')})`;
        ctx.fill();
        const selected = i === this.objSel;
        ctx.strokeStyle = selected ? '#ff8c00' : `rgb(${t.outline.join(',')})`;
        ctx.lineWidth = selected ? 3 : 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    };
    v.paintOver = (ctx) => {
      const s = this.settings;
      if (s.xApplause < 9999) {
        ctx.strokeStyle = '#008200'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(v.px(s.xApplause) + 0.5, 0); ctx.lineTo(v.px(s.xApplause) + 0.5, v.height); ctx.stroke();
        ctx.setLineDash([]); ctx.lineWidth = 1;
        ctx.fillStyle = '#008200'; ctx.fillText('finish', v.px(s.xApplause) + 4, 14);
      }
      const sx = v.px(s.startX);
      const sy = v.py(s.startY);
      ctx.strokeStyle = '#a000a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, v.py(s.startY - 1)); ctx.lineTo(sx, v.py(s.startY + 1)); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.fillStyle = '#a000a0'; ctx.fillText('start', sx + 10, sy - 8);
    };
    v.pressExtra = (e) => {
      const s = this.settings;
      const mx = e.offsetX; const my = e.offsetY;
      if (Math.hypot(v.px(s.startX) - mx, v.py(s.startY) - my) <= 9) { v.drag = DRAG_START; return true; }
      if (s.xApplause < 9999 && Math.abs(v.px(s.xApplause) - mx) <= 4) { v.drag = DRAG_FINISH; return true; }
      for (let i = s.objects.length - 1; i >= 0; i--) {
        const o = s.objects[i];
        const poly = this.outlineOf(o);
        if (poly && inside(poly, v.wx(mx), v.wy(my))) {
          this.selectObject(i);
          this.grab = [v.wx(mx) - o.x, v.wy(my) - o.y];
          v.drag = DRAG_OBJECT;
          return true;
        }
      }
      return false;
    };
    v.draggedExtra = (e) => {
      const s = this.settings;
      if (v.drag === DRAG_START) { s.startX = v.wx(e.offsetX); s.startY = v.wy(e.offsetY); this.showSettings(); }
      else if (v.drag === DRAG_FINISH) { s.xApplause = v.wx(e.offsetX); this.showSettings(); }
      else if (v.drag === DRAG_OBJECT) {
        const o = this.selectedObject();
        if (o) { o.x = v.wx(e.offsetX) - this.grab[0]; o.y = v.wy(e.offsetY) - this.grab[1]; this.showObject(); this.refreshObjectRow(this.objSel); }
      }
    };
    v.released = () => this.applyNow();
  }

  // ---------------------------------------------------------------- model <-> UI

  setStatus(text, warn = false) { this.status.textContent = text; this.status.classList.toggle('warn', warn); }

  async load(path) {
    const text = await this.vfs.readText(path);
    if (text == null) { this.setStatus(`Unable to read ${path}`, true); return; }
    this.data = MapData.parse(text);
    this.settings = await MapSettings.load(this.vfs, path);
    this.gndFile = path;
    this.sel = this.data.pts.length ? 0 : -1;
    this.objSel = -1;
    this.view.data = this.data;
    this.view.sel = this.sel;
    await this.refreshTypes();
    this.refreshAll();
    this.view.fit();
    this.view.render();
  }

  terrainChanged() { this.load(this.app.currentTerrain); }
  reload() { if (this.gndFile == null) this.setStatus("Nothing to reload: this map hasn't been saved.", true); else { this.load(this.gndFile).then(() => this.applyNow()); } }

  isBuiltin() {
    const m = this.vfs.manifestData;
    return this.gndFile != null && !!m && m.terrains.some((t) => t.file === this.gndFile) && !this.vfs.isUserFile(this.gndFile);
  }

  async refreshTypes() {
    const names = await listObjects(this.vfs);
    setOptions(this.typeSel, names.map((n) => ({ value: n, label: n })));
    for (const n of names) this.ensureType(n);
  }

  ensureType(name) {
    if (this.typeCache.has(name)) return;
    this.typeCache.set(name, null);
    ObjectType.load(this.world, name).then((t) => { if (t) this.typeCache.set(name, t); else this.typeCache.delete(name); this.view.render(); });
  }

  /** The world-space outline of a placed object, or null if its type isn't loaded (yet). */
  outlineOf(o) {
    this.ensureType(o.type);
    const t = this.typeCache.get(o.type);
    return t ? Obstacle.place(t.shape, o.x, o.y, o.rotation, o.scale) : null;
  }

  refreshAll() {
    this.updating = true;
    this.pointList.replaceChildren(...this.data.pts.map((_, i) => el('option', {}, this.describe(i))));
    if (this.sel >= 0) this.pointList.selectedIndex = this.sel;
    this.updating = false;
    this.showSettings();
    this.refreshObjects();
    this.showPoint();
    this.validate();
  }

  describe(i) { const p = this.data.pts[i]; return `${i + 1}: ${fmt(p.x, 1)}, ${fmt(p.y, 1)}  cf ${fmt(p.cf)}`; }
  refreshPointRow(i) { const o = this.pointList.options[i]; if (o) o.textContent = this.describe(i); this.showPoint(true); }

  showSettings() {
    const s = this.settings;
    this.updating = true;
    const set = (f, v) => { if (document.activeElement !== f.input) f.input.value = String(Math.round(v * 1e4) / 1e4); };
    set(this.stX, s.startX); set(this.stY, s.startY); set(this.finX, s.xApplause);
    set(this.kpF, s.kp); set(this.kdF, s.kd); set(this.kpSkiF, s.kpSki); set(this.kdSkiF, s.kdSki); set(this.cfF, s.cf);
    this.colorIn.value = toHex(s.color.map((c) => c * 255));
    this.updating = false;
  }

  setSetting(key, text) {
    if (this.updating) return;
    const v = parse(text);
    if (v === undefined) return;
    this.settings[key] = v;
    this.edited();
  }

  showPoint(keepFocus = false) {
    const p = this.data.pts[this.sel];
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
    const p = this.data.pts[this.sel];
    const v = parse(text);
    if (this.updating || !p || v === undefined) return;
    if (what === 'x') p.x = v; else if (what === 'y') p.y = v; else if (what === 'cf') p.cf = v; else p.setExtra0(v);
    this.pointList.options[this.sel].textContent = this.describe(this.sel);
    this.edited();
  }

  insertPoint(at, x, y) {
    const p = this.data.pts[at - 1].copy();
    p.x = x; p.y = y;
    this.data.pts.splice(at, 0, p);
    this.sel = at;
    this.view.sel = at;
    this.refreshAll();
    this.edited();
  }

  addAfterSelected() {
    const n = this.data.pts.length;
    const i = this.sel < 0 ? n - 1 : this.sel;
    const a = this.data.pts[i];
    const b = this.data.pts[(i + 1) % n];
    this.insertPoint(i + 1, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  deletePoint(i) {
    if (i < 0) return;
    if (this.data.pts.length <= 3) { this.setStatus('A map needs at least 3 points.', true); return; }
    this.data.pts.splice(i, 1);
    this.sel = Math.min(i, this.data.pts.length - 1);
    this.view.sel = this.sel;
    this.refreshAll();
    this.edited();
  }

  validate() {
    if (this.data.pts.length < 3) this.setStatus('A map needs at least 3 points.', true);
    else if (!this.data.isClockwise()) this.setStatus('Warning: the outline runs counter-clockwise; the game expects clockwise.', true);
    else this.setStatus(this.gndFile == null ? 'New map' : `${this.gndFile}${this.isBuiltin() ? ' (built-in, read-only: use Save As)' : ''}`);
  }

  // ---------------------------------------------------------------- placed objects

  selectedObject() { return this.settings.objects[this.objSel]; }

  describeObject(o) { return `${o.type}  (${fmt(o.x, 1)}, ${fmt(o.y, 1)})  rot ${Math.round(o.rotation)}  x${fmt(o.scale)}${o.dynamic ? '  pushable' : ''}`; }

  refreshObjects() {
    this.updating = true;
    this.objectList.replaceChildren(...this.settings.objects.map((o) => el('option', {}, this.describeObject(o))));
    if (this.objSel >= this.settings.objects.length) this.objSel = this.settings.objects.length - 1;
    if (this.objSel >= 0) this.objectList.selectedIndex = this.objSel;
    this.updating = false;
    this.showObject();
  }

  refreshObjectRow(i) { const o = this.objectList.options[i]; if (o) o.textContent = this.describeObject(this.settings.objects[i]); }

  showObject() {
    const o = this.selectedObject();
    this.updating = true;
    for (const f of [this.oX, this.oY, this.oRot, this.oScale]) f.input.disabled = !o;
    this.oDyn.disabled = !o;
    this.oMass.input.disabled = !o || !o.dynamic;
    this.oDyn.checked = !!o?.dynamic;
    const set = (f, v) => { if (document.activeElement !== f.input) f.input.value = o ? String(Math.round(v * 1e3) / 1e3) : ''; };
    set(this.oX, o?.x); set(this.oY, o?.y); set(this.oRot, o?.rotation); set(this.oScale, o?.scale);
    if (document.activeElement !== this.oMass.input) this.oMass.input.value = o && o.mass > 0 ? String(o.mass) : '';
    this.updating = false;
    this.view.render();
  }

  selectObject(i) { this.objSel = i; this.updating = true; this.objectList.selectedIndex = i; this.updating = false; this.showObject(); }

  setObject(key, text) {
    const o = this.selectedObject();
    const v = parse(text);
    if (this.updating || !o || v === undefined) return;
    if (key === 'scale' && v === 0) return;
    o[key] = key === 'mass' ? Math.max(0, v) : v;
    this.refreshObjectRow(this.objSel);
    this.edited();
  }

  setPushable() {
    const o = this.selectedObject();
    if (this.updating || !o) return;
    o.dynamic = this.oDyn.checked;
    this.refreshObjectRow(this.objSel);
    this.showObject();
    this.edited();
  }

  addObject() {
    if (!this.typeSel.options.length) { this.setStatus('No objects yet: use Edit Objects… to make one.', true); return; }
    this.settings.objects.push(new Placed(this.typeSel.value, this.view.cx, this.view.cy));
    this.objSel = this.settings.objects.length - 1;
    this.refreshObjects();
    this.dropToGround();
  }

  deleteObject() {
    if (this.objSel < 0) return;
    this.settings.objects.splice(this.objSel, 1);
    this.refreshObjects();
    this.edited();
  }

  /** The height of the terrain's top surface at x, or null if there is none there. */
  surfaceY(x) {
    let best = null;
    const { pts } = this.data;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) {
        const y = a.y + (x - a.x) * (b.y - a.y) / (b.x - a.x);
        if (best == null || y > best) best = y;
      }
    }
    return best;
  }

  /** Moves the selected object up or down so its lowest point rests on the terrain under its x. */
  dropToGround() {
    const o = this.selectedObject();
    if (!o) return;
    const poly = this.outlineOf(o);
    const surface = this.surfaceY(o.x);
    if (!poly || surface == null) { this.setStatus('There is no ground under that object.', true); return; }
    o.y += surface - Math.min(...poly.pts.map((p) => p.y));
    this.refreshObjects();
    this.edited();
  }

  // ---------------------------------------------------------------- live preview

  edited() {
    this.validate();
    this.view.render();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.applyNow(), 250);
  }

  /** Loads the edited map into the game without saving anything, then restarts the skier. */
  async applyNow() {
    if (this.data.pts.length < 3) return;
    const w = this.world;
    try {
      w.stop();
      const g = new Ground();
      w.setGround(g);
      g.read(this.data.toText());
      await w.runFile('terrain/gnd_setup.txt');
      for (const c of this.settings.commands()) await w.interp(c);
      await w.runFile('config/reset.cb');
      this.app.requestRedraw();
    } catch (e) {
      this.setStatus(`Preview failed: ${e.message}`, true);
    }
  }

  // ---------------------------------------------------------------- files (in memory) and download

  newMap() {
    this.data = MapData.flat();
    this.settings = new MapSettings();
    this.gndFile = null;
    this.sel = 0;
    this.objSel = -1;
    this.view.data = this.data;
    this.view.sel = 0;
    this.refreshAll();
    this.view.fit();
    this.edited();
  }

  writeFiles(path) {
    this.vfs.writeText(path, this.data.toText());
    this.vfs.writeText(mapFile(path), this.settings.toText());
  }

  save() {
    if (this.gndFile == null) { this.setStatus("This map isn't saved yet. Type a name and use Save As.", true); return; }
    if (this.isBuiltin()) { this.setStatus(`Built-in map ${this.gndFile} is read-only. Type a name and use Save As.`, true); return; }
    if (this.data.pts.length < 3) { this.setStatus('A map needs at least 3 points.', true); return; }
    this.writeFiles(this.gndFile);
    this.setStatus(`Saved ${this.gndFile} (in this tab; use Download to keep it)`);
  }

  async saveAs() {
    const name = this.nameIn.value.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    if (!name || name === '_') { this.setStatus('Enter a name for the map (letters and digits).', true); return; }
    const path = `terrain/gnd_${name}.txt`;
    if (await this.vfs.exists(path)) { this.setStatus(`A map named '${name}' already exists.`, true); return; }
    if (this.data.pts.length < 3) { this.setStatus('A map needs at least 3 points.', true); return; }
    this.writeFiles(path);
    this.gndFile = path;
    this.app.addTerrain(name, path);
    this.nameIn.value = '';
    this.setStatus(`Saved new map ${name} (in this tab; use Download to keep it)`);
  }

  async download() {
    let path = this.gndFile;
    if (path == null || this.isBuiltin()) {
      const name = this.nameIn.value.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
      if (!name || name === '_') { this.setStatus('Type a name for the downloaded map first.', true); return; }
      path = `terrain/gnd_${name}.txt`;
    }
    const files = [{ path, bytes: this.data.toText() }, { path: mapFile(path), bytes: this.settings.toText() }];
    downloadFile(`${path.replace(/^terrain\/gnd_/, 'map_').replace(/\.txt$/, '')}.zip`, makeZip(files), 'application/zip');
    this.setStatus(`Downloaded ${path} and ${mapFile(path)} as a zip. Unzip it into the game's assets folder to use it.`);
  }
}

/** Point-in-polygon for an outline of MapData points. */
function inside(poly, x, y) {
  let inn = false;
  const { pts } = poly;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > y) !== (pts[j].y > y) && x < (pts[j].x - pts[i].x) * (y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) inn = !inn;
  }
  return inn;
}
