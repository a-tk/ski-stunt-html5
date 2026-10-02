import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapSettings, Placed } from '../../src/terrain/mapsettings.js';
import { MapData } from '../../src/terrain/mapdata.js';
import { diskVfs } from '../support/boot.js';

test('settings = gnd_setup.txt defaults overridden by the map file', async () => {
  const s = await MapSettings.load(diskVfs(), 'terrain/gnd_crates.txt');
  assert.equal(s.kp, 2000);              // from gnd_setup.txt
  assert.equal(s.xApplause, 120);        // from the .map (gnd_setup says 30)
  assert.equal(s.startX, 2);
  assert.equal(s.objects.length, 5);
  assert.equal(s.objects[0].type, 'crate');
  assert.equal(s.objects[0].rotation, -10);
});

test('pushable objects keep their flag and mass through text', async () => {
  const s = await MapSettings.load(diskVfs(), 'terrain/gnd_pushcrates.txt');
  const dyn = s.objects.filter((o) => o.dynamic);
  assert.equal(dyn.length, 4);
  assert.equal(dyn[0].mass, 8);
  const again = new MapSettings();
  again.applyAll(s.toText());
  assert.deepEqual(again.objects.map((o) => o.command()), s.objects.map((o) => o.command()));
  assert.equal(again.kp, s.kp);
  assert.equal(again.startX, s.startX);
});

test('a map without a .map file just gets the defaults', async () => {
  const s = await MapSettings.load(diskVfs(), 'terrain/gnd_practice.txt');
  assert.equal(s.xApplause, 30);
  assert.equal(s.objects.length, 0);
});

test('Placed.command round-trips', () => {
  const p = new Placed('crate', 1.5, -2, 30, 2);
  p.dynamic = true;
  p.mass = 12;
  assert.equal(p.command(), 'object crate 1.5 -2 30 2 dynamic 12');
});

test('MapData text round-trips every terrain', async () => {
  const vfs = diskVfs();
  const m = await vfs.manifest();
  for (const t of m.terrains) {
    const d = MapData.parse(await vfs.readText(t.file));
    const e = MapData.parse(d.toText());
    assert.equal(e.pts.length, d.pts.length, t.file);
    d.pts.forEach((p, i) => {
      assert.ok(Math.abs(p.x - e.pts[i].x) < 1e-5 && Math.abs(p.y - e.pts[i].y) < 1e-5, t.file);
      assert.equal(p.cf, e.pts[i].cf);
      assert.deepEqual(p.extra, e.pts[i].extra);
    });
  }
});
