// Runs a golden scenario in the JS engine the same way tools/java-golden/Golden.java does.
import { bootWorld } from './boot.js';

// When the skis come off (crate_push), Ski2Monitor turns the left ski by a random 5-20 degrees, either way
// (Util.frand). Turned one way it catches the crate and changes the run; the other way it doesn't. The Java
// reference was recorded with the second, so pin the random numbers to a value that gives it (frand(-20, 20)
// at 0.25 is +10 degrees); otherwise the test passes or fails by chance.
const PINNED_RANDOM = 0.25;

export async function runScenario(setup, skierVx, steps, every) {
  const realRandom = Math.random;
  Math.random = () => PINNED_RANDOM;
  try {
    return await run(setup, skierVx, steps, every);
  } finally {
    Math.random = realRandom;
  }
}

async function run(setup, skierVx, steps, every) {
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
