// Browser smoke test for the editors: node tools/smoke-editors.mjs [baseUrl]
// (needs `npm start` running and Chrome installed). Edits live only in the page's memory; downloads are
// captured instead of saved.
import { launch } from './cdp.mjs';

const base = process.argv[2] || 'http://localhost:8080/';
const page = await launch({ width: 1500, height: 950 });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); if (!ok) failed++; };
const ev = (e) => page.eval(e);

await page.goto(base, 2500);
await ev(`window.__downloads = [];
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push({ name: this.download, url: this.href }); };
  window.btn = (text, root = '#editors') => [...document.querySelectorAll(root + ' .editor-panel:not([hidden]) button')].find((b) => b.textContent.trim() === text);
  window.setIn = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  window.panelInputs = (ph) => document.querySelector('#editors .editor-panel:not([hidden]) input[placeholder="' + ph + '"]');
  window.zipInfo = async (d) => { const buf = new Uint8Array(await (await fetch(d.url)).arrayBuffer()); return { size: buf.length, pk: buf[0] === 0x50 && buf[1] === 0x4b, text: new TextDecoder('latin1').decode(buf) }; };`);

// ------------------------------------------------------------------ map editor
await ev('document.getElementById("btn-edit-map").click()');
await page.sleep(800);
check('map editor opens', await ev('!document.getElementById("editors").hidden'));
check('outline points listed (kicker jump has 67)', (await ev('document.querySelectorAll("#editors select")[0].options.length')) === 67);
await page.screenshot('/tmp/ski-editor-map.png');

await ev('setIn(panelInputs("map name"), "tmap"); btn("Save As").click()');
await page.sleep(400);
check('Save As stores the map in memory', (await ev('JSON.stringify(skiStunt.vfs.userFiles())')).includes('terrain/gnd_tmap.txt'));
check('new map is in the terrain dropdown', await ev('[...document.getElementById("sel-terrain").options].some((o) => o.textContent === "tmap")'));
check('banner shows unsaved work', !(await ev('document.getElementById("unsaved").hidden')));

// add a crate and check the live preview
await ev('(() => { const sel = [...document.querySelectorAll("#editors select")].find((s) => [...s.options].some((o) => o.value === "crate") && s.size <= 1); sel.value = "crate"; btn("Add").click; })()');
await ev('(() => { const adds = [...document.querySelectorAll("#editors .editor-panel:not([hidden]) button")].filter((b) => b.textContent.trim() === "Add"); adds[adds.length - 1].click(); })()');
await page.sleep(900);
check('object added and shown in the game', (await ev('skiStunt.world.obstacles.length')) === 1);
await ev('btn("Save").click()');
await page.sleep(200);
check('map file now lists the object', (await ev('skiStunt.vfs.peekText("terrain/gnd_tmap.map")')).includes('object crate'));

await ev('btn("Download…").click()');
await page.sleep(300);
const d1 = await ev('JSON.stringify(window.__downloads)');
check('map download captured', d1.includes('map_tmap.zip'));
const z1 = await ev('zipInfo(window.__downloads[0])');
check('map zip is a zip with both files', z1.pk && z1.text.includes('terrain/gnd_tmap.txt') && z1.text.includes('terrain/gnd_tmap.map'), `${z1.size} bytes`);

// built-in maps are read-only
await ev('(async () => { const s = document.getElementById("sel-terrain"); s.value = "terrain/gnd_practise.txt"; s.dispatchEvent(new Event("change")); })()');
await page.sleep(1000);
await ev('btn("Save").click()');
check('built-in map refuses Save', (await ev('document.querySelector("#editors .editor-panel:not([hidden]) .status").textContent')).includes('read-only'));
await page.screenshot('/tmp/ski-editor-map2.png');

// ------------------------------------------------------------------ object editor (pushed from the map editor)
await ev('btn("Edit Objects…").click()');
await page.sleep(800);
check('object editor opens on top', (await ev('document.querySelector("#editors .editor-panel:not([hidden]) .editor-head strong").textContent')) === 'Object Editor');
check('3 built-in objects listed', (await ev('document.querySelector("#editors .editor-panel:not([hidden]) select").options.length')) === 3);
await ev('btn("New").click()');
await page.sleep(300);
await ev('setIn(panelInputs("object name"), "tbox"); btn("Save As").click()');
await page.sleep(500);
check('Save As stores the object', (await ev('JSON.stringify(skiStunt.vfs.userFiles())')).includes('objects/tbox.obj'));
check('object file is valid text', (await ev('skiStunt.vfs.peekText("objects/tbox.obj")')).includes('name New object'));
await page.screenshot('/tmp/ski-editor-object.png');
await ev('btn("Close").click()');
await page.sleep(500);
check('closing the object editor brings the map editor back', (await ev('document.querySelector("#editors .editor-panel:not([hidden]) .editor-head strong").textContent')) === 'Map Editor');
check('the new object type shows in the map editor', await ev('[...document.querySelectorAll("#editors .editor-panel:not([hidden]) select")].some((s) => [...s.options].some((o) => o.value === "tbox"))'));
await ev('btn("Close").click()');

// ------------------------------------------------------------------ skin editor
await ev('document.getElementById("btn-edit-skin").click()');
await page.sleep(800);
check('skin editor lists polygons', (await ev('document.querySelector("#editors .editor-panel:not([hidden]) select[size]").options.length')) >= 10);
await page.screenshot('/tmp/ski-editor-skin.png');
await ev('btn("Save").click()');
check('built-in skin refuses Save', (await ev('document.querySelector("#editors .editor-panel:not([hidden]) .status").textContent')).includes('read-only'));
await ev('setIn(panelInputs("skin name"), "Test Skin"); btn("Save As").click()');
await page.sleep(1200);
const files = await ev('JSON.stringify(skiStunt.vfs.userFiles())');
check('Save As copies the skin files (and the texture)', files.includes('art/skins/test_skin/skin.txt') && files.includes('art/skins/test_skin/torso.poly'));
check('skin dropdown has the new skin', await ev('[...document.getElementById("sel-skin").options].some((o) => o.textContent === "Test Skin")'));
check('new skin is applied', (await ev('skiStunt.world.findArtfig("skier").linkDecors.length')) >= 6);
await ev('btn("Download…").click()');
await page.sleep(400);
const z2 = await ev('zipInfo(window.__downloads[window.__downloads.length - 1])');
check('skin zip is a zip with the skin', z2.pk && z2.text.includes('art/skins/test_skin/skin.txt'), `${z2.size} bytes`);
await ev('btn("Close").click()');

check('no console errors', page.errors.length === 0, page.errors.join('; '));
const bad = page.console.filter((l) => /^(error|warning)/.test(l));
check('no console warnings', bad.length === 0, bad.slice(0, 3).join('; '));
await page.close();
process.exit(failed ? 1 : 0);
