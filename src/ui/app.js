// The game page: boots the world from the data files, then runs the animation loop, controls,
// keyboard and mouse (the browser counterpart of GlshApplet.java).
import { Vfs } from '../storage/vfs.js';
import { World } from '../sim/world.js';
import { CanvasRenderer } from '../gfx/renderer.js';
import { Audio } from '../monitor/audio.js';
import { listSkins, skinDisplayName } from '../art/skinloader.js';
import { openMapEditor } from './editors/mapeditor.js';
import { openObjectEditor } from './editors/objecteditor.js';
import { openSkinEditor } from './editors/skineditor.js';

/**
 * Labels and demos for the terrains that have them. The dropdown itself lists whatever assets/manifest.json
 * says is in assets/terrain/ (these just come first, in the original order, with these names).
 */
const TERRAIN_INFO = [
  ['kicker jump', 'terrain/gnd_kicker_jump.txt', 'animations/demo_kicker.ani'],
  ['crash & burn', 'terrain/gnd_crash_burn.txt', 'animations/demo_crash_burn.ani'],
  ['the wall', 'terrain/gnd_the_wall.txt', 'animations/demo_the_wall.ani'],
  ['practise', 'terrain/gnd_practise.txt', 'animations/demo_practise.ani'],
];

const MARGIN = 0.05;
const MAX_FRAME_SECONDS = 0.05;   // never try to catch up more than this much simulated time per frame

/** The inset game area inside the canvas (same rule as GlshApplet.initMargin). */
function layout(world, w, h) {
  world.clipW = Math.floor(w / (1 + 2 * MARGIN));
  world.clipH = Math.floor(h / (1 + 2 * MARGIN));
  world.clipX = Math.floor(world.clipW * MARGIN);
  world.clipY = Math.floor(world.clipH * MARGIN);
}

const $ = (id) => document.getElementById(id);
const typing = (t) => t instanceof HTMLElement && (t.closest('#editors') != null || (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'range'));

export async function startApp() {
  const vfs = new Vfs({ base: 'assets/' });
  const audio = new Audio(vfs);
  const canvas = $('game');
  const stage = $('stage');

  const rect = stage.getBoundingClientRect();
  const world = new World({ vfs, audio, width: Math.round(rect.width), height: Math.round(rect.height) });
  layout(world, Math.round(rect.width), Math.round(rect.height));
  const renderer = new CanvasRenderer(canvas, world);
  let dirty = true;
  world.onRedraw = () => { dirty = true; };
  const requestRedraw = () => { dirty = true; };

  // ---------------------------------------------------------------- start the world from the setup script
  world.syncSim = true;
  await world.runFile('config/ski.setup');
  world.syncSim = false;
  if (world.bgImageName) {
    const bytes = await vfs.readBytes(world.bgImageName);
    if (bytes) renderer.bgImage = await createImageBitmap(new Blob([bytes]));
  }
  $('loading').hidden = true;

  const manifest = await vfs.manifest();
  const onDisk = new Set(manifest.terrains.map((t) => t.file));
  const terrains = TERRAIN_INFO.filter((t) => onDisk.has(t[1]));
  const known = new Set(terrains.map((t) => t[1]));
  for (const t of manifest.terrains) {
    if (!known.has(t.file)) terrains.push([t.file.replace(/^terrain\/gnd_/, '').replace(/\.txt$/, ''), t.file, null]);
  }
  const app = { vfs, world, audio, renderer, requestRedraw, currentTerrain: terrains[0]?.[1], currentSkin: 'default', demoFile: terrains[0]?.[2] ?? null };
  window.skiStunt = app; // handy for debugging in the console

  // ---------------------------------------------------------------- controls
  const selTerrain = $('sel-terrain');
  const selSkin = $('sel-skin');
  const btnDemo = $('btn-demo');
  const rngSpeed = $('rng-speed');
  const rngZoom = $('rng-zoom');

  const fillTerrains = () => {
    selTerrain.replaceChildren(...terrains.map(([label, file]) => Object.assign(document.createElement('option'), { textContent: label, value: file })));
    selTerrain.value = app.currentTerrain;
  };
  const fillSkins = async () => {
    const dirs = await listSkins(vfs);
    const opts = [];
    for (const d of dirs) opts.push(Object.assign(document.createElement('option'), { textContent: await skinDisplayName(vfs, d), value: d }));
    selSkin.replaceChildren(...opts);
    selSkin.value = app.currentSkin;
  };
  fillTerrains();
  await fillSkins();
  app.refreshLists = async () => { fillTerrains(); await fillSkins(); };
  /** Adds a terrain (e.g. one made in the map editor) to the dropdown and selects it without reloading. */
  app.addTerrain = (label, file) => {
    if (!terrains.some((t) => t[1] === file)) terrains.push([label, file, null]);
    app.currentTerrain = file;
    app.demoFile = null;
    fillTerrains();
    btnDemo.disabled = true;
  };
  /** Adds a skin made in the skin editor to the dropdown and selects it (it is already applied). */
  app.addSkin = async (label, dir) => { app.currentSkin = dir; await fillSkins(); };
  app.focusGame = () => canvas.focus();
  $('btn-edit-map').addEventListener('click', () => openMapEditor(app));
  $('btn-edit-objects').addEventListener('click', () => openObjectEditor(app));
  $('btn-edit-skin').addEventListener('click', () => openSkinEditor(app));

  // user-made skins, maps and objects live only in this tab: say so, and warn before leaving with any
  const banner = $('unsaved');
  vfs.onChange(() => { banner.hidden = vfs.userFiles().length === 0; });
  addEventListener('beforeunload', (e) => { if (vfs.userFiles().length) { e.preventDefault(); e.returnValue = ''; } });

  const loadTerrain = async (file) => {
    world.stop();
    app.currentTerrain = file;
    app.demoFile = (terrains.find((t) => t[1] === file) ?? [])[2] ?? null;
    btnDemo.disabled = app.demoFile == null;
    await world.interp(`terrain ${file}`);
    await world.runFile('config/reset.cb');
    dirty = true;
    app.onTerrainChanged?.();
  };
  app.loadTerrain = loadTerrain;
  btnDemo.disabled = app.demoFile == null;

  selTerrain.addEventListener('change', async () => { await loadTerrain(selTerrain.value); canvas.focus(); });
  selSkin.addEventListener('change', async () => {
    world.stop();
    app.currentSkin = selSkin.value;
    await world.interp(`skin ${selSkin.value}`);
    dirty = true;
    app.onSkinChanged?.();
    canvas.focus();
  });
  const syncFrameMs = () => { world.frameMs = world.dtDisp * 1000 * (1 + world.speedLevel); };
  rngSpeed.addEventListener('input', () => { world.speedLevel = Number(rngSpeed.value); syncFrameMs(); });
  rngZoom.addEventListener('input', () => { world.winview.setZoom(Number(rngZoom.value)); dirty = true; });
  $('btn-help').addEventListener('click', () => $('help').showModal());
  $('btn-replay').addEventListener('click', () => {
    world.stop();
    world.interp('world setaf skier');
    world.interp('simulate stop');
    world.interp('replay');
    canvas.focus();
  });
  btnDemo.addEventListener('click', () => {
    world.stop();
    if (app.demoFile) world.interp(`play ${app.demoFile}`);
    canvas.focus();
  });
  syncFrameMs();

  // ---------------------------------------------------------------- keyboard and mouse
  const syncControls = () => { rngSpeed.value = world.speedLevel; rngZoom.value = world.winview.zoomLevel; syncFrameMs(); };
  const toggleRun = () => {
    const wasStopped = world.sim == null;
    world.stop();
    if (!wasStopped) return;
    world.interp('logging on');
    world.interp('world setaf skier');
    world.interp('simulate stop');
    world.interp('restpose start');
    // the steering zone is fixed on screen, so the run starts with whatever the pointer is already doing
    if (world.hotzone && lastMouse) world.mouseNorm = world.hotzone.normalize(lastMouse[0], lastMouse[1]);
    world.interp('simulate');
  };

  let lastMouse = null;
  canvas.addEventListener('pointermove', (e) => {
    lastMouse = [e.offsetX, e.offsetY];
    if (world.sim != null && world.hotzone) world.mouseNorm = world.hotzone.normalize(e.offsetX, e.offsetY);
  });
  const unlockAudio = () => audio.unlock();
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);

  addEventListener('keydown', (e) => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    let handled = true;
    if (e.key === ' ') toggleRun();
    else if (e.key === '<' || e.key === ',') { world.interp('simulate slower'); if (world.sim == null) world.speedLevel = Math.min(7, world.speedLevel + 1); }
    else if (e.key === '>' || e.key === '.') { world.interp('simulate faster'); if (world.sim == null) world.speedLevel = Math.max(0, world.speedLevel - 1); }
    else if (e.key === 'ArrowUp') world.winview.changeZoom(-1);
    else if (e.key === 'ArrowDown') world.winview.changeZoom(1);
    else if (e.key === 'Escape') world.stop();
    else handled = false;
    if (handled) { e.preventDefault(); syncControls(); dirty = true; }
  });

  // ---------------------------------------------------------------- size and the animation loop
  const resize = () => {
    const { w, h } = renderer.fit();
    world.gfx2d.resize(w, h);
    world.winview.resize(w, h);
    layout(world, w, h);
    world.hotzone?.fitViewport(w, h);
    dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    if (world.sim) world.sim.advance(dt / (1 + world.speedLevel));
    if (dirty || world.sim) { renderer.render(); dirty = false; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  canvas.focus();

  // ?run starts a run by itself shortly after loading (handy for screenshots and demos)
  if (new URLSearchParams(location.search).has('run')) {
    setTimeout(() => { lastMouse = [canvas.clientWidth / 2, canvas.clientHeight * 0.55]; toggleRun(); }, 300);
  }
}
