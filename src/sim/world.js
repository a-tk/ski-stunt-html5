// Port of sim/World.java: everything in the game world -- figures, terrain, objects, camera,
// effects, the command interpreter and the run log.
import { PList } from '../physics/plist.js';
import { Artfig } from '../physics/artfig.js';
import { applyBodyContacts } from '../physics/bodycontacts.js';
import { Winview } from '../gfx/winview.js';
import { Gfx2D } from '../gfx/gfx2d.js';
import { Interpreter } from '../script/interp.js';
import { registerCommands } from '../script/commands.js';

export class World {
  /**
   * @param {object} opts
   * @param {import('../storage/vfs.js').Vfs} opts.vfs where files come from
   * @param {{play(path: string): void}} [opts.audio]
   * @param {number} [opts.width] size of the game canvas in pixels
   * @param {number} [opts.height]
   */
  constructor({ vfs, audio = null, width = 1500, height = 1000 } = {}) {
    this.vfs = vfs;
    this.audio = audio;
    this.artfigList = [];
    this.artfig = null;
    this.plist = new PList();
    this.winview = new Winview(this);
    this.gfx2d = new Gfx2D(width, height);
    this.winview.setGfx2D(this.gfx2d);
    this.winview.init(width, height, 0, 0, width / 2.35);
    this.ground = null;
    this.hotzone = null;
    this.sim = null;
    this.syncSim = false;        // true while setup scripts run: 'simulate' then runs straight to t_end
    this.bgImageName = null;
    this.clipX = 0; this.clipY = 0; this.clipW = width; this.clipH = height;
    this.t_end = 1e20;
    this.dt_sim = 0.02;
    this.dt_disp = 0.002;
    this.mouseNorm = [0.5, 0.5];
    this.obstacles = [];
    this.bodyTouching = [];
    this.splash = null;
    this.doLogging = true;
    this.log = null;
    this.message = null;
    this.replay = null;
    this.playback = null;
    this.frameMs = 0;             // pause per replayed frame (the UI sets this)
    this.onRedraw = null;         // the UI's repaint
    this.speedLevel = 0;          // slow-motion level 0..7 (see ui)
    this.interpreter = new Interpreter(this);
    registerCommands(this.interpreter);
    this.newArtfig(null);
  }

  /** Loads an image from the virtual file system (null when images aren't available, e.g. in Node). */
  async loadImage(path) {
    if (typeof createImageBitmap !== 'function') return null;
    const bytes = await this.vfs.readBytes(path);
    if (!bytes) { console.log(`Warning: unable to load image ${path}`); return null; }
    try { return await createImageBitmap(new Blob([bytes])); } catch { return null; }
  }

  // ---------------------------------------------------------------- commands

  /** Runs one command line (see script/commands.js). May return a Promise. */
  interp(line) { return this.interpreter.interp(line); }

  /** '< file' */
  runFile(path) { return this.interpreter.runFile(path); }

  // ---------------------------------------------------------------- figures

  newArtfig(name) {
    const f = new Artfig(this);
    f.name = name != null ? name : `artfig${this.artfigList.length}`;
    this.artfigList.push(f);
    this.artfig = f;
    if (this.artfigList.length === 1) f.panTgt = true;
    return f;
  }

  delArtfig(f) {
    const i = this.artfigList.indexOf(f);
    if (i >= 0) this.artfigList.splice(i, 1);
  }

  findArtfig(name) {
    return this.artfigList.find((f) => f.name === name) ?? null;
  }

  // ---------------------------------------------------------------- terrain and objects

  /** Replaces the terrain; objects belong to the old terrain's map, so they go too. */
  setGround(g) {
    this.ground = g;
    this.clearObstacles();
  }

  clearObstacles() {
    for (const ob of this.obstacles) {
      if (ob.fig) {
        if (this.artfig === ob.fig) this.artfig = this.findArtfig('skier') ?? this.artfigList[0];
        this.delArtfig(ob.fig);
      }
    }
    this.obstacles = [];
    this.bodyTouching = [];
  }

  /** Puts every pushable object back where it started. */
  resetObjects() { for (const ob of this.obstacles) ob.resetPose(); }

  // ---------------------------------------------------------------- simulation

  sim_ready() {
    for (const f of this.artfigList) {
      if (f.dyn == null) { console.log('Error: dynamics not defined for artfig'); return false; }
    }
    return this.replay == null;
  }

  sim_init_state() {
    this.resetObjects();
    for (const f of this.artfigList) f.sim_init_state();
  }

  sim_init() {
    if (this.splash) this.splash.reset();
    for (const f of this.artfigList) f.sim_init();
  }

  /** One step of every active figure (after the figure-vs-object contact forces), then the particles. */
  sim_step(dt) {
    let ok = true;
    applyBodyContacts(this);
    for (const f of this.artfigList) {
      if (f.active && !f.sim_step(dt)) { ok = false; break; }
    }
    if (this.splash) this.splash.simStep(dt);
    return ok;
  }

  /** The camera target: the state position of the last pan-target figure. */
  sim_get_pan(out) {
    for (const f of this.artfigList) if (f.panTgt) f.get_state_xy(out);
  }

  /** Stops the run (and any replay or demo). */
  stop() {
    this.sim_stop();
    this.playback?.postStop();
    this.replay?.postStop();
  }

  sim_stop() {
    if (this.sim) {
      this.sim.postStop();
      this.sim = null;
    }
  }

  // ---------------------------------------------------------------- log

  /** Appends a line (or tokens) to the run log, while a run is going. */
  simLog(x) {
    if (this.sim != null && this.log != null) {
      const s = Array.isArray(x) ? x.join(' ') + ' ' : x;
      this.log.write(s + '\n');
    }
  }

  /** One frame of state for every active figure ('showall' lines), as in the Java log. */
  sim_log_state(t) {
    let active = 0;
    let lastActive = 0;
    this.artfigList.forEach((f, i) => { if (f.active) { ++active; lastActive = i; } });
    const several = active > 1;
    this.artfigList.forEach((f, i) => {
      if (several) {
        this.log.write(`world setaf ${f.name}\n`);
        if (f.active) f.sim_log_state(t, i === lastActive);
      } else if (f.active) {
        f.sim_log_state(t);
      }
    });
  }

  // ---------------------------------------------------------------- display

  /** Asks the UI to redraw now. */
  update() { this.onRedraw?.(); }
  repaint() { this.onRedraw?.(); }

  /** A promise that waits one replay frame (or nothing when frames aren't paced). */
  framePause() {
    if (!(this.frameMs > 0)) return undefined;
    return new Promise((resolve) => setTimeout(resolve, this.frameMs));
  }

  /** Draws the whole scene with a renderer (see gfx/renderer.js). */
  draw(r) {
    if (this.ground) this.ground.draw(r);
    for (const ob of this.obstacles) ob.draw(r);
    for (const f of this.artfigList) if (f.active) f.draw(r);
    this.hotzone?.draw(r);
    this.splash?.draw(r);
  }
}
