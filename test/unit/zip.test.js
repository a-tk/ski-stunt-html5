import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeZip, crc32 } from '../../src/storage/zip.js';

test('crc32 of "123456789" is cbf43926', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('makeZip writes a zip that unzip accepts, with paths and contents intact', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zip-'));
  try {
    const bin = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    const zip = makeZip([
      { path: 'art/skins/mine/skin.txt', bytes: 'name Mine\r\nposition é\r\n' },
      { path: 'art/skins/mine/stripes.png', bytes: bin },
      { path: 'terrain/empty.txt', bytes: '' },
    ]);
    const file = path.join(dir, 't.zip');
    await writeFile(file, zip);
    const test = execFileSync('unzip', ['-t', file]).toString();
    assert.match(test, /No errors detected/);
    const text = execFileSync('unzip', ['-p', file, 'art/skins/mine/skin.txt']).toString();
    assert.equal(text, 'name Mine\r\nposition é\r\n');
    const got = execFileSync('unzip', ['-p', file, 'art/skins/mine/stripes.png']);
    assert.deepEqual(new Uint8Array(got), bin);
    const list = execFileSync('unzip', ['-Z1', file]).toString().trim().split('\n');
    assert.deepEqual(list, ['art/skins/mine/skin.txt', 'art/skins/mine/stripes.png', 'terrain/empty.txt']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
