// The game page: boots the world from the data files, then runs the animation loop, controls,
// keyboard and mouse (the browser counterpart of GlshApplet.java).
import { Vfs } from '../storage/vfs.js';
import { World } from '../sim/world.js';
import { CanvasRenderer } from '../gfx/renderer.js';
import { Audio } from '../monitor/audio.js';
import { listSkins, skinDisplayName } from '../art/skinloader.js';

/** The terrains with their labels, in the original dropdown order; the four with demos name them. */
const TERRAINS = [
  ['kicker jump', 'terrain/gnd_kicker_jump.txt', 'animations/demo_kicker.ani'],
  ['crash & burn', 'terrain/gnd_crash_burn.txt', 'animations/demo_crash_burn.ani'],
  ['the wall', 'terrain/gnd_the_wall.txt', 'animations/demo_the_wall.ani'],
  ['practise', 'terrain/gnd_practise.txt', 'animations/demo_practise.ani'],
  ...['camelCrates', 'camelSnowman', 'camelTrees', 'deathValley', 'exercise1', 'exercise2', 'exercise3', 'exercise4', 'gap',
    'gapCrumbleShell', 'hutRock', 'jump', 'jump3', 'lesson1', 'lesson2', 'lesson3', 'lesson4', 'lessonPrep', 'practice',
    'ravine', 'ravineJet', 'road', 'ted'].map((n) => [n, `terrain/gnd_${n}.txt`, null]),
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
const typing = (t) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'range';

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

  // ---------------------------------------------------------------- start the world from the setup script
  world.syncSim = true;
  await world.runFile('config/ski.setup');
  world.syncSim = false;
  if (world.bgImageName) {
    const bytes = await vfs.readBytes(world.bgImageName);
    if (bytes) renderer.bgImage = await createImageBitmap(new Blob([bytes]));
  }
  $('loading').hidden = true;

  const app = { vfs, world, audio, renderer, currentTerrain: TERRAINS[0][1], currentSkin: 'default', demoFile: TERRAINS[0][2] };
  window.skiStunt = app; // handy for debugging in the console

  // ---------------------------------------------------------------- controls
  const selTerrain = $('sel-terrain');
  const selSkin = $('sel-skin');
  const btnDemo = $('btn-demo');
  const rngSpeed = $('rng-speed');
  const rngZoom = $('rng-zoom');

  const manifest = await vfs.manifest();
  const known = new Set(TERRAINS.map((t) => t[1]));
  const terrains = [...TERRAINS];
  for (const t of manifest.terrains) {
    if (!known.has(t.file)) terrains.push([t.file.replace(/^terrain\/gnd_/, '').replace(/\.txt$/, ''), t.file, null]);
  }
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
  app.focusGame = () => canvas.focus();

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
  const syncFrameMs = () => { world.frameMs = world.dt_disp * 1000 * (1 + world.speedLevel); };
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
    if (world.hotzone && lastMouse) {
      // the mouse-control zone is centered on the pointer, so the run starts neutral
      world.hotzone.centerOn(lastMouse[0], lastMouse[1], world.gfx2d.width, world.gfx2d.height);
      world.mouseNorm[0] = world.mouseNorm[1] = 0.5;
    }
    world.interp('simulate');
  };

  let lastMouse = null;
  canvas.addEventListener('pointermove', (e) => {
    lastMouse = [e.offsetX, e.offsetY];
    if (world.sim != null && world.hotzone) world.hotzone.normalize(e.offsetX, e.offsetY, world.mouseNorm);
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
    if (world.hotzone) { world.hotzone.height = h; world.hotzone.width = w; }
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
