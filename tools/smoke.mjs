// Browser smoke test: node tools/smoke.mjs [baseUrl]  (needs `npm start` running and Chrome installed)
// Boots the page, runs the simulation, switches terrain and skin, plays a demo and a replay, and
// reports console errors. Screenshots go to /tmp/ski-smoke-*.png.
import { launch } from './cdp.mjs';

const base = process.argv[2] || 'http://localhost:8080/';
const page = await launch();
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); if (!ok) failed++; };
const ev = (e) => page.eval(e);

await page.goto(base, 2500);
check('page loaded', await ev('document.getElementById("loading").hidden'));
check('3 figures', (await ev('window.skiStunt.world.artfigList.length')) === 3);
check('30 terrains in the dropdown', (await ev('document.getElementById("sel-terrain").options.length')) === 30);
check('3 skins in the dropdown', (await ev('document.getElementById("sel-skin").options.length')) === 3);

// a run
await page.move(700, 450);
await page.key(' ', { code: 'Space', vk: 32 });
await page.sleep(1500);
const x1 = Number(await ev('window.skiStunt.world.findArtfig("skier").sim_state[0]'));
check('run advances', (await ev('!!window.skiStunt.world.sim')) && x1 > 1, `x=${x1.toFixed(2)}`);
await page.screenshot('/tmp/ski-smoke-run.png');
await page.key(' ', { code: 'Space', vk: 32 });
check('space stops the run', !(await ev('!!window.skiStunt.world.sim')));

// terrain and skin
await ev('(async () => { const s = document.getElementById("sel-terrain"); s.value = "terrain/gnd_practise.txt"; s.dispatchEvent(new Event("change")); })()');
await page.sleep(800);
check('terrain switched', (await ev('window.skiStunt.currentTerrain')) === 'terrain/gnd_practise.txt');
check('demo enabled for practise', !(await ev('document.getElementById("btn-demo").disabled')));
await ev('(async () => { const s = document.getElementById("sel-skin"); s.value = "neon"; s.dispatchEvent(new Event("change")); })()');
await page.sleep(800);
check('skin switched', (await ev('window.skiStunt.world.findArtfig("skier").linkDecors.length')) >= 6);
await page.screenshot('/tmp/ski-smoke-neon.png');

// demo
await ev('document.getElementById("btn-demo").click()');
await page.sleep(2500);
check('demo started', await ev('!!window.skiStunt.world.playback || window.skiStunt.world.findArtfig("skier").sim_state[0] !== 0'));
const moved = await ev('(() => { const s = window.skiStunt.world.findArtfig("skier").sim_state; return Math.abs(s[0]) > 0.05 || Math.abs(s[4]) > 0.1; })()');
check('demo moved the skier', moved);
await page.screenshot('/tmp/ski-smoke-demo.png');
await page.key(' ', { code: 'Space', vk: 32 });   // stops the demo and starts a run
await page.sleep(1200);
await page.key(' ', { code: 'Space', vk: 32 });
check('the run was logged', (await ev('window.skiStunt.world.log.data.length')) > 20);
await ev('document.getElementById("btn-replay").click()');
await page.sleep(500);
check('replay is running', await ev('!!window.skiStunt.world.replay'));
await page.sleep(2500);
check('replay finished', !(await ev('!!window.skiStunt.world.replay')));

// zoom keys
const z0 = Number(await ev('window.skiStunt.world.winview.zoomLevel'));
await page.key('ArrowDown', { code: 'ArrowDown', vk: 40 });
check('arrow down zooms in', Number(await ev('window.skiStunt.world.winview.zoomLevel')) === z0 + 1);

check('no console errors', page.errors.length === 0, page.errors.join('; '));
const bad = page.console.filter((l) => /^(error|warning)/.test(l) && !/Failed to load resource/.test(l));
check('no console warnings', bad.length === 0, bad.slice(0, 3).join('; '));
await page.close();
process.exit(failed ? 1 : 0);
