// Port of sim/Sim.java, as an object you advance rather than a thread. The UI calls advance() with
// elapsed real time (scaled by the speed setting); setup scripts and tests use runToEnd().
import { TempLog } from './templog.js';

export class Sim {
  constructor(world) {
    this.world = world;
    this.t = 0;
    this.nextDisp = 0;
    this.stopped = false;
    this.tEnd = world.t_end;
    this.dtSim = world.dt_sim;
    this.dtDisp = world.dt_disp;
    this.carry = 0;   // sim seconds owed from earlier frames
    this.pan = [0, 0];
    this.aborted = false;
  }

  /** Start of a run: new log, states and collision flags reset. */
  init() {
    const w = this.world;
    if (w.doLogging) w.log = new TempLog();
    w.sim_init_state();
    w.sim_init();
  }

  postStop() { this.stopped = true; }

  /** True once the run is over (stopped, aborted or t_end reached). */
  get finished() { return this.stopped || this.aborted || !(this.t < this.tEnd); }

  /**
   * One physics step plus, when due, the per-frame work (camera, log). Returns false if the sim aborted.
   * With stepCamera false the caller moves the camera itself (advance() does, once per rendered frame).
   */
  stepOnce(stepCamera = true) {
    const w = this.world;
    if (!w.sim_step(this.dtSim)) {
      console.log('Simulation aborted.');
      this.aborted = true;
      return false;
    }
    if (this.t > this.nextDisp) {
      if (stepCamera) {
        w.sim_get_pan(this.pan);
        w.winview.recenter(this.pan);
      }
      w.update();
      if (w.doLogging) w.sim_log_state(this.t);
      this.nextDisp += this.dtDisp;
    }
    this.t += this.dtSim;
    return true;
  }

  /**
   * Runs for about 'seconds' of simulated time. The camera follows once per call rather than once per
   * dtDisp, so it moves on every rendered frame and the skier doesn't jitter against the scenery.
   */
  advance(seconds) {
    this.carry += seconds;
    const t0 = this.t;
    while (this.carry >= this.dtSim && !this.finished) {
      if (!this.stepOnce(false)) break;
      this.carry -= this.dtSim;
    }
    if (this.t > t0) {
      this.world.sim_get_pan(this.pan);
      this.world.winview.follow(this.pan, this.t - t0, this.dtDisp);
    }
    if (this.finished) this.end();
  }

  /** Runs until t_end (or an abort/stop). */
  runToEnd() {
    while (!this.finished) if (!this.stepOnce()) break;
    this.end();
  }

  end() {
    const w = this.world;
    if (w.sim === this) w.sim = null;
  }
}
