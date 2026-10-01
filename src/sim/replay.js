// Ports of sim/Replay.java and Playback.java: running a log or a demo script back, frame by frame.
// The pacing comes from the 'showall' command (world.framePause), so these are just script runners.

/** Replays the log of the last run. */
export class Replay {
  constructor(world) {
    this.world = world;
    this.stopReplay = false;
  }

  postStop() { this.stopReplay = true; }

  async run() {
    const w = this.world;
    if (!w.log?.hasData()) { w.replay = null; return; }
    w.interp('message R');
    for (const line of w.log.lines().slice()) {
      if (this.stopReplay) break;
      const r = w.interp(line);
      if (r && typeof r.then === 'function') await r;
    }
    w.interp('message');
    w.replay = null;
  }
}

/** Plays a recorded demo (a script of 'showall' lines etc.). */
export class Playback {
  constructor(world, fname) {
    this.world = world;
    this.fname = fname;
    this.stopPlay = false;
  }

  postStop() { this.stopPlay = true; }

  async run() {
    try {
      const r = this.world.interp(`< ${this.fname}`);
      if (r && typeof r.then === 'function') await r;
    } catch (e) {
      console.log(`exception: ${e.message}`);
    }
    this.world.playback = null;
  }
}
