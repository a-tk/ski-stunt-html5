import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assetsDir, bootWorld, diskVfs } from '../support/boot.js';
import { Ground } from '../../src/terrain/ground.js';
import { MapData } from '../../src/terrain/mapdata.js';
import { ObjectType } from '../../src/terrain/objecttype.js';
import { SkinLoader } from '../../src/art/skinloader.js';
import { PList } from '../../src/physics/plist.js';
import { LinkPoint } from '../../src/physics/linkpoint.js';

const manifest = JSON.parse(await readFile(path.join(assetsDir, 'manifest.json'), 'utf8'));

test('manifest lists the shipped content', () => {
  assert.equal(manifest.terrains.length, 30);
  assert.deepEqual(manifest.skins.map((s) => s.dir).sort(), ['default', 'girl_skier', 'neon']);
  assert.deepEqual(manifest.objects, ['barrier', 'crate', 'ramp']);
  assert.equal(manifest.demos.length, 4);
  assert.equal(manifest.sounds.length, 3);
});

test('every terrain file parses to a closed clockwise outline', async () => {
  for (const t of manifest.terrains) {
    const text = await readFile(path.join(assetsDir, t.file), 'utf8');
    const g = new Ground();
    g.read(text);
    assert.ok(g.nPoints >= 3, t.file);
    assert.ok(MapData.parse(text).isClockwise(), `${t.file} should be clockwise`);
    assert.equal(g.bbox.w > 0, true, t.file);
  }
});

test('Ground: inside, slicing and contact on a simple box', () => {
  const g = new Ground();
  g.read('-10 -5 0.1\n-10 0 0.1\n10 0 0.1\n10 -5 0.1\n');
  assert.equal(g.nPoints, 4);
  assert.ok(g.inside([0, -1]));
  assert.ok(!g.inside([0, 1]));
  g.slice(2, 1e-4);
  assert.ok(g.inside([5, -1]) && g.inside([-5, -1]) && !g.inside([5, 1]));
  // a point that fell from (0,1) to (0,-0.5) crossed the surface at y = 0
  const cp = [0, 0]; const n = [0, 0]; const cf = [0]; const seg = [0];
  assert.ok(g.contactPt([0, 1], [0, -0.5], cp, n, cf, seg));
  assert.ok(Math.abs(cp[1]) < 1e-9);
  assert.ok(n[1] > 0.99); // normal points up
  assert.ok(Math.abs(cf[0] - 0.1) < 1e-9);
});

test('ski.setup builds the skier and the two ski figures', async () => {
  const w = await bootWorld();
  const skier = w.findArtfig('skier');
  assert.equal(skier.nlinks, 4);
  assert.equal(skier.ndof, 6);
  assert.equal(skier.panTgt, true);
  assert.ok(skier.monitor);
  for (const n of ['drski', 'dlski']) {
    const ski = w.findArtfig(n);
    assert.equal(ski.nlinks, 1);
    assert.equal(ski.ndof, 3);
    assert.equal(ski.active, false);
    assert.equal(ski.links[0].plist.getPoints().length, 27);
  }
  // the skier's boot points start inactive, its ski points active
  const pts = skier.links[0].plist.getPoints();
  assert.ok(pts.some((p) => p.containsTag('skiD')));
  assert.ok(w.ground.nPoints > 0);
  assert.equal(w.ground.startX, 0);
});

test('LinkPoint tags match as prefixes of colon-separated segments', () => {
  const p = new LinkPoint();
  p.tag = 'bt:ia';
  assert.ok(p.containsTag('bt') && p.containsTag('ia') && !p.containsTag('skiD'));
  p.tag = 'skiD:skiX';
  assert.ok(p.containsTag('skiD') && p.containsTag('skiX'));
  p.tag = 'head';
  assert.ok(p.containsTag('head') && !p.containsTag('heads'));
});

test('PList.newpt records friction and tag', () => {
  const l = new PList();
  l.newpt(1, 2, 0.4, 'x');
  assert.equal(l.npts(), 1);
  assert.equal(l.getPoints()[0].bodyCFric, 0.4);
});

test('every skin loads onto the skier and the skis', async () => {
  const w = await bootWorld();
  for (const s of manifest.skins) {
    assert.ok(await SkinLoader.apply(w, s.dir), s.dir);
    const skier = w.findArtfig('skier');
    assert.ok(skier.linkDecors.length >= 6, s.dir);
    assert.ok(skier.linkDecors.every((d) => d.polygons.length > 0));
    assert.equal(w.findArtfig('drski').linkDecors.length, 1);
  }
});

test('object types parse (shape, colors, mass)', async () => {
  const vfs = diskVfs();
  for (const name of manifest.objects) {
    const t = await ObjectType.parse(await vfs.readText(`objects/${name}.obj`), 'objects/', null);
    assert.ok(t.shape.pts.length >= 3, name);
    assert.ok(t.shape.isClockwise(), name);
    assert.ok(t.mass > 0);
  }
  const crate = await ObjectType.parse(await vfs.readText('objects/crate.obj'), 'objects/', null);
  assert.equal(crate.textureFile, 'planks.png');
  assert.equal(crate.shape.pts.length, 4);
});
