// The JavaScript engine against trajectories recorded from the Java version (see tools/java-golden).
// Same setup, same step size (0.002 s), same initial conditions; samples every 25 steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runScenario, maxDiff } from '../support/scenario.js';

const golden = JSON.parse(await readFile(new URL('../fixtures/golden.json', import.meta.url), 'utf8'));

// Float32 (Java) vs double (JS) differences stay around 1e-4 here; 1e-3 leaves headroom.
const TOL = 1e-3;

const scenarios = {
  'rest_flat': { setup: ['terrain terrain/gnd_practice.txt'], vx: 0, steps: 1500 },
  'slide_kicker': { setup: ['terrain terrain/gnd_kicker_jump.txt'], vx: 8, steps: 1500 },
  'crate_rest': { setup: ['terrain terrain/gnd_practice.txt', 'object crate 20 0 0 1 dynamic 10'], vx: 0, steps: 1000 },
  'crate_push': { setup: ['terrain terrain/gnd_practice.txt', 'object crate 6 0 0 1 dynamic 10'], vx: 8, steps: 1500 },
  'static_crate': { setup: ['terrain terrain/gnd_practice.txt', 'object crate 6 0 0 1'], vx: 6, steps: 1500 },
};

for (const [name, s] of Object.entries(scenarios)) {
  test(`golden: ${name}`, async () => {
    const ref = golden[name];
    const { samples, crates } = await runScenario(s.setup, s.vx, s.steps, ref.every);
    assert.equal(samples.length, ref.skier.length, 'same number of samples (no abort)');
    let worst = 0;
    for (const [i, sample] of samples.entries()) { worst = Math.max(worst, maxDiff(sample, ref.skier[i])); }
    assert.ok(worst < TOL, `skier differs from Java by up to ${worst}`);
    if (ref.crates && ref.crates[0] && ref.crates[0].length) {
      let cw = 0;
      for (const [i, c] of crates.entries()) { if (c.length) cw = Math.max(cw, maxDiff(c[0], ref.crates[i][0])); }
      assert.ok(cw < TOL, `crate differs from Java by up to ${cw}`);
    }
  });
}
