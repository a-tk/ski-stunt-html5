// The commands of the setup scripts (config/*.setup, terrain/*.map, demo .ani files), ported from the
// Java *CmdInterp classes. Handlers get the tokens (args[0] is the command) and the world.
// Unknown commands are ignored by the interpreter, as in Java.
import { num, int } from '../util/text.js';
import { MAX_LINKS } from '../physics/artfig.js';
import { DynSki2 } from '../physics/dynamics/dynski2.js';
import { DynSki2Ski } from '../physics/dynamics/dynski2ski.js';
import { Ground } from '../terrain/ground.js';
import { Ski2Monitor } from '../monitor/ski2monitor.js';
import { SnowEffects } from '../monitor/snoweffects.js';
import { SnowSplash, Particle } from '../gfx/splash.js';
import { Hotzone } from '../ui/hotzone.js';
import { Sim } from '../sim/simloop.js';
import { Replay, Playback } from '../sim/replay.js';

const bad = (cmd, what = 'incorrect # args') => console.log(`Error: ${cmd} - ${what}`);

export function registerCommands(interp) {
  const R = (name, fn) => interp.register(name, fn);

  // ------------------------------------------------------------ files and comments
  R('#', () => {});
  R('<', (a, w) => (a.length >= 2 ? w.runFile(a[1]) : undefined));

  // ------------------------------------------------------------ building a figure
  R('new_link', (a, w) => {
    if (a.length > 2) { console.log('USAGE: new_link [parent]'); return; }
    if (a.length === 2) w.artfig.set_current(w.artfig.find_link(int(a[1])));
    w.plist.reset();
  });
  R('new_pt', (a, w) => {
    const x = num(a[1]);
    const y = num(a[2]);
    const cfric = a.length > 3 ? num(a[3]) : 0;
    const tag = a.length > 4 ? a[4] : null;
    w.plist.newpt(x, y, cfric, tag);
  });
  R('link_close', (a, w) => { w.artfig.addLink(w.plist); w.repaint(); });
  R('jt_org', (a, w) => {
    if (a.length !== 4) { console.log('Warning: jt_org - incorrect num of arg'); return; }
    const n = int(a[1]);
    const i = w.artfig.find_link(n);
    if (i === -1) { console.log('fixpt: invalid link number'); return; }
    w.artfig.set_current(i);
    w.artfig.jt_org(n, num(a[2]), num(a[3]));
    w.repaint();
  });
  R('mass', (a, w) => {
    const f = w.artfig;
    if (a.length === 2) {
      if (f.curr() !== -1) f.mass(f.curr_num(), num(a[1]));
    } else if (a.length === 3) {
      f.mass(int(a[2]), num(a[1]));
    } else if (a.length === 5) {
      f.mass(int(a[2]), num(a[1]));
      console.log('Warning: mass() centre-of-mass spec ignored');
    }
  });
  R('jt_pd', (a, w) => {
    if (a.length < 8) { console.log('Error: jt_pd incorrect num of arg'); return; }
    const n = int(a[1]);
    w.artfig.jt_pd(n - 1, num(a[2]), num(a[3]), num(a[4]), num(a[5]), num(a[6]), num(a[7]));
    if (a.length >= 12) w.artfig.jt_pd_limit(n - 1, num(a[8]), num(a[9]), num(a[10]), num(a[11]));
  });
  R('mousemap', (a, w) => {
    if (a.length !== 5) { console.log('Error: mousemap - incorrect num of args'); return; }
    w.artfig.jt_mousemap(int(a[1]) - 1, a[2].charAt(0), num(a[3]), num(a[4]));
  });
  R('tog_link', (a, w) => { w.artfig.togglelink(); w.repaint(); });
  R('dgen', (a, w) => {
    if (a.length !== 2) { bad('dgen'); return; }
    if (a[1] === 'dyn_ski2') w.artfig.dyn = new DynSki2();
    else if (a[1] === 'dyn_ski2_ski') w.artfig.dyn = new DynSki2Ski();
    else console.log('Error: unknown dgen arg');
  });
  R('usemonitor', async (a, w) => {
    if (a.length < 2) { bad('usemonitor'); return; }
    if (a[1] === 'snowEffects') {
      const m = new SnowEffects();
      if (a.length > 2) await m.readSounds(a[2], w.vfs);
      w.artfig.monitor = m;
      w.splash = new SnowSplash(w);
      m.init(w);
    } else if (a[1] === 'ski2Monitor') {
      const m = new Ski2Monitor();
      if (a.length > 2) await m.readSounds(a[2], w.vfs);
      w.artfig.monitor = m;
      w.splash = new SnowSplash(w);
      m.init(w);
      if (a.length >= 5) {
        m.skierNormProc = a[3];
        m.skierRelaxProc = a[4];
        // the monitor runs these scripts mid-simulation, so have their text ready
        await w.vfs.readText(a[3]);
        await w.vfs.readText(a[4]);
      }
    } else {
      console.log('Error: monitor type not found');
    }
  });
  R('artfig', (a, w) => {
    if (a.length < 2) { bad('artfig'); return; }
    if (a[1] === 'setname') {
      if (a.length !== 3) bad('artfig'); else w.artfig.name = a[2];
    } else if (a[1] === 'active') {
      if (a.length !== 3) { bad('artfig'); return; }
      w.artfig.active = a[2] === 'true';
      w.simLog(a);
    } else if (a[1] === 'panTgt') {
      if (a.length !== 3) bad('artfig'); else w.artfig.panTgt = a[2] === 'true';
    }
  });
  R('restpose', (a, w) => {
    const v = new Array(MAX_LINKS + 2).fill(0);
    if (a.length === 2 && a[1] === 'start') {
      v[0] = w.ground ? w.ground.startX : 0;
      v[1] = w.ground ? w.ground.startY : 1;
    } else {
      for (let i = 1; i < a.length; i++) v[i - 1] = num(a[i]);
    }
    w.artfig.restpose(v);
    w.resetObjects();
    w.repaint();
  });

  // ------------------------------------------------------------ worlds and figures
  R('world', (a, w) => {
    if (a.length < 2) { bad('world'); return; }
    if (a[1] === 'setaf') {
      if (a.length !== 3) { bad('world'); return; }
      const f = w.findArtfig(a[2]);
      if (f) w.artfig = f;
      w.simLog(a);
    } else if (a[1] === 'newaf') {
      w.newArtfig(a.length === 3 ? a[2] : null);
    } else if (a[1] === 'delaf') {
      w.delArtfig(w.artfig);
    }
  });
  R('bgimage', (a, w) => { w.bgImageName = a[1]; w.repaint(); });

  // ------------------------------------------------------------ terrain
  const gndfile = async (path, w) => {
    const text = await w.vfs.readText(path);
    if (text == null) { console.log(`Bad URL:${path}`); return; }
    const g = new Ground();
    w.setGround(g);
    try { g.read(text); } catch (e) { console.log(`exception: ${e.message}`); }
  };
  R('gndfile', (a, w) => (a.length >= 2 ? gndfile(a[1], w) : undefined));
  R('terrain', async (a, w) => {
    if (a.length < 2) { console.log('Usage: terrain gnd_file'); return; }
    await gndfile(a[1], w);
    await w.runFile('terrain/gnd_setup.txt');
    const map = a[1].endsWith('.txt') ? `${a[1].slice(0, -4)}.map` : `${a[1]}.map`;
    if (await w.vfs.exists(map)) await w.runFile(map);
  });
  R('gnd', (a, w) => {
    const g = w.ground;
    if (!g) return;
    const k = a[1];
    if (k === 'kp') g.kp = num(a[2]);
    else if (k === 'kd') g.kd = num(a[2]);
    else if (k === 'kpSki') g.kpSki = num(a[2]);
    else if (k === 'kdSki') g.kdSki = num(a[2]);
    else if (k === 'cf') g.cfric = num(a[2]);
    else if (k === 'xApplause') g.xApplause = num(a[2]);
    else if (k === 'start') {
      if (a.length < 4) { console.log('Usage: gnd start x y'); return; }
      g.startX = num(a[2]);
      g.startY = num(a[3]);
    } else if (k === 'slices') {
      if (a.length < 3) console.log('Error: gnd slices - incorrect # args');
      else g.slice(int(a[2]), a.length > 3 ? num(a[3]) : 0);
    } else if (k === 'togslices') {
      g.showSlices = !g.showSlices;
      w.repaint();
    } else if (k === 'color') {
      if (a.length < 5) { console.log('Usage: gnd color r g b'); return; }
      g.setColor(num(a[2]), num(a[3]), num(a[4]));
    }
    // objects share the terrain's contact stiffness, damping and friction
    for (const ob of w.obstacles) ob.syncPhysics(g);
  });
  R('object', async (a, w) => {
    if (a.length < 4) { console.log('Usage: object name x y [rotation [scale [dynamic [mass]]]]'); return; }
    const { Obstacle } = await import('../terrain/obstacle.js');
    const x = num(a[2]);
    const y = num(a[3]);
    const rot = a.length > 4 ? num(a[4]) : 0;
    const scale = a.length > 5 ? num(a[5]) : 1;
    const dynamic = a.length > 6 && a[6] === 'dynamic';
    const mass = a.length > 7 ? num(a[7]) : 0;
    const ob = await Obstacle.create(w, a[1], x, y, rot, scale, dynamic, mass);
    if (ob) w.obstacles.push(ob);
  });

  // ------------------------------------------------------------ skins
  R('skin', async (a, w) => {
    if (a.length !== 2) { bad('skin'); return; }
    const { SkinLoader } = await import('../art/skinloader.js');
    await SkinLoader.apply(w, a[1]);
  });
  R('linkDecor', (a, w) => {
    if (a.length < 2) { bad('linkdecor'); return; }
    if (a[1] === 'show') {
      if (a.length !== 4) { bad('linkDecor'); return; }
      for (const d of w.artfig.linkDecors) {
        if (d.name != null && d.name === a[2]) { d.show = a[3] === 'true'; break; }
      }
      w.simLog(a);
    }
  });

  // ------------------------------------------------------------ simulation control
  R('t_end', (a, w) => { w.t_end = num(a[1]); });
  R('dt_sim', (a, w) => { w.dt_sim = num(a[1]); });
  R('dt_disp', (a, w) => { w.dt_disp = num(a[1]); });
  R('logging', (a, w) => { w.doLogging = a[1] === 'on'; });
  R('simulate', (a, w) => {
    if (a.length === 1) {
      if (!w.sim_ready()) return;
      if (w.sim == null) {
        const s = new Sim(w);
        w.sim = s;
        s.init();
        if (w.syncSim) s.runToEnd();
      }
    } else if (w.sim != null) {
      if (a[1] === 'slower') w.speedLevel = Math.min(7, w.speedLevel + 1);
      else if (a[1] === 'faster') w.speedLevel = Math.max(0, w.speedLevel - 1);
      else if (a[1] === 'stop') w.sim_stop();
    } else if (a[1] === 'stop') {
      // not running: nothing to stop
    }
  });

  // ------------------------------------------------------------ view
  R('autopan', (a, w) => w.winview.set_autopan(num(a[1]), num(a[2]), num(a[3]), num(a[4])));
  R('zoom', (a, w) => {
    if (a.length !== 2) { bad('zoom'); return; }
    w.winview.changeZoom(int(a[1]));
    w.repaint();
  });
  R('message', (a, w) => { w.message = a.length === 1 ? null : a[1]; w.repaint(); });
  R('hotzone', (a, w) => {
    if (w.hotzone == null) {
      w.hotzone = new Hotzone(w.gfx2d.width, w.gfx2d.height);
      if (a.length === 1) return;
    }
    if (a.length === 1) { w.hotzone.toggle(); w.repaint(); }
    else if (a.length === 5) {
      w.hotzone.set(int(a[1]) + w.clipX, int(a[2]) + w.clipX, int(a[3]) + w.clipY, int(a[4]) + w.clipY);
      // the script's fixed pixel box is only the Java default; here the zone scales with the screen instead
      w.hotzone.fitViewport(w.gfx2d.width, w.gfx2d.height);
    } else console.log('Error: hotzone - incorrect # args');
  });

  // ------------------------------------------------------------ demos, replay, sound, particles
  R('showall', (a, w) => {
    const display = a[1] !== 'ndisp';
    if (w.artfig.sim_showall_state(a)) {
      w.artfig.sim_disp_state();
      if (display) {
        const pan = [0, 0];
        w.sim_get_pan(pan);
        w.winview.recenter(pan);
        w.update();
        return w.framePause();
      }
    }
    return undefined;
  });
  R('sound', (a, w) => {
    if (a.length < 2) { console.log('Error: sound - incorrect # args'); return; }
    w.audio?.play(a[1]);
  });
  R('replay', (a, w) => {
    if (w.sim == null && w.log != null && w.replay == null) {
      w.replay = new Replay(w);
      w.replay.run();
    }
  });
  R('play', (a, w) => {
    if (w.sim == null && w.playback == null) {
      w.sim_init_state();
      w.playback = new Playback(w, a[1]);
      w.playback.run();
    }
  });
  R('splash', (a, w) => {
    if (!w.splash || a.length < 2) return;
    if (a[1] === 'particle') {
      const p = new Particle();
      p.read(a, 2);
      w.splash.addParticle(p);
    } else if (a[1] === 'step') {
      w.splash.simStep(num(a[2]));
    }
  });
}
