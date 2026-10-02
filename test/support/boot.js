// Test helper: a World that reads the real game files from assets/ on disk, no browser involved.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vfs } from '../../src/storage/vfs.js';
import { World } from '../../src/sim/world.js';

export const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

export function diskVfs() {
  return new Vfs({
    loader: async (p) => {
      try { return new Uint8Array(await readFile(path.join(assetsDir, p))); } catch { return null; }
    },
  });
}

/** A world with config/ski.setup already run (skier, two skis, terrain, monitor). */
export async function bootWorld(opts = {}) {
  const world = new World({ vfs: diskVfs(), ...opts });
  world.syncSim = true;
  await world.runFile('config/ski.setup');
  world.syncSim = false;
  return world;
}
