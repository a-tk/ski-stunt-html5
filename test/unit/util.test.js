import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linEqSolv, ludcmp } from '../../src/util/linsolve.js';
import { ptInPoly } from '../../src/util/geom.js';
import { BBox } from '../../src/util/bbox.js';
import { tokens, num, lines } from '../../src/util/text.js';
import { Vector3 } from '../../src/util/vector3.js';

test('linEqSolv solves a 3x3 system', () => {
  const a = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
  const b = [8, -11, -3];
  const x = [0, 0, 0];
  assert.equal(linEqSolv(a, b, x, 3), 1);
  assert.deepEqual(x.map((v) => Math.round(v * 1e6) / 1e6), [2, 3, -1]);
});

test('ludcmp reports a singular matrix (zero row)', () => {
  assert.equal(ludcmp([[1, 2], [0, 0]], 2, [0, 0], [0]), 0);
});

test('ptInPoly: inside, outside, concave', () => {
  const sq = [new Vector3(0, 0), new Vector3(0, 2), new Vector3(2, 2), new Vector3(2, 0)];
  assert.equal(ptInPoly(sq, [1, 1]), 1);
  assert.equal(ptInPoly(sq, [3, 1]), 0);
  assert.equal(ptInPoly(sq, [1, -0.5]), 0);
  // an L shape: the notch is outside
  const L = [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]].map(([x, y]) => new Vector3(x, y));
  assert.equal(ptInPoly(L, [0.5, 1.5]), 1);
  assert.equal(ptInPoly(L, [1.5, 1.5]), 0);
});

test('BBox: build, inside, intersects', () => {
  const b = new BBox();
  b.buildInit(); b.addPoint(1, 1); b.addPoint(3, 4); b.buildEnd();
  assert.deepEqual(b.ul, [1, 4]);
  assert.equal(b.w, 2);
  assert.equal(b.h, 3);
  assert.ok(b.inside([2, 2]));
  assert.ok(!b.inside([0, 2]));
  const c = new BBox();
  c.buildInit(); c.addPoint(2, 3); c.addPoint(5, 6); c.buildEnd();
  assert.ok(b.intersects(c));
  const d = new BBox();
  d.buildInit(); d.addPoint(10, 10); d.addPoint(11, 11); d.buildEnd();
  assert.ok(!b.intersects(d));
});

test('text helpers match Java StringTokenizer / Float.valueOf', () => {
  assert.deepEqual(tokens('  a\tb \r\n c '), ['a', 'b', 'c']);
  assert.equal(num('5.3E-5'), 5.3e-5);
  assert.equal(num('1e20'), 1e20);
  assert.throws(() => num('abc'));
  assert.deepEqual(lines('a\r\nb\nc'), ['a', 'b', 'c']);
});
