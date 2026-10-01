// Runs a golden scenario in the JS engine the same way tools/java-golden/Golden.java does.
import { bootWorld } from './boot.js';

export async function runScenario(setup, skierVx, steps, every) {
  const world = await bootWorld();
  world.stop();
  for (const c of setup) await world.interp(c);
  await world.interp('< config/reset.cb');
  world.sim_init_state();
  world.sim_init();
  const skier = world.findArtfig('skier');
  if (skierVx) skier.sim_state[1] = skierVx;
  const samples = [];
  const crates = [];
  for (let i = 0; i <= steps; i++) {
    if (i % every === 0) {
      samples.push(Array.from(skier.sim_state));
      crates.push(world.obstacles.filter((o) => o.dynamic).map((o) => Array.from(o.fig.sim_state)));
    }
    if (i < steps && !world.sim_step(0.002)) { samples.push('ABORTED'); break; }
  }
  return { world, samples, crates };
}

/** Max |a-b| over two equally long number arrays. */
export function maxDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}
