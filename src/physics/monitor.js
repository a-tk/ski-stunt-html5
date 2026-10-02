/** Base class for things that watch a figure each step (port of physics/ArtfigMonitor.java). */
export class ArtfigMonitor {
  constructor() {
    this.artfig = null;
    this.world = null;
  }

  /** Called when a run starts. */
  reset() {}

  draw(_r) {}

  /** Called after every step of the figure with the step length. */
  update(_dt) {}

  init(world) {
    this.world = world;
    this.artfig = world.artfig;
  }
}
