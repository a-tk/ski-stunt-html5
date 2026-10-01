// Converts Sun .au files (mu-law / 8-bit linear / 16-bit linear) to 16-bit PCM WAV.
// node tools/au2wav.mjs <srcDir> <dstDir>
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function ulaw(b) {
  b = ~b & 0xff;
  const sign = b & 0x80, exponent = (b >> 4) & 7, mantissa = b & 15;
  let s = ((mantissa << 3) + 0x84) << exponent;
  s -= 0x84;
  return sign ? -s : s;
}

export function auToWav(buf) {
  if (buf.toString('latin1', 0, 4) !== '.snd') throw new Error('not an .au file');
  const offset = buf.readUInt32BE(4);
  let size = buf.readUInt32BE(8);
  const enc = buf.readUInt32BE(12), rate = buf.readUInt32BE(16), ch = buf.readUInt32BE(20);
  if (size === 0xffffffff || offset + size > buf.length) size = buf.length - offset;
  let samples;
  if (enc === 1) { samples = new Int16Array(size); for (let i = 0; i < size; i++) samples[i] = ulaw(buf[offset + i]); }
  else if (enc === 2) { samples = new Int16Array(size); for (let i = 0; i < size; i++) samples[i] = (buf.readInt8(offset + i)) << 8; }
  else if (enc === 3) { samples = new Int16Array(size >> 1); for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16BE(offset + 2 * i); }
  else throw new Error('unsupported .au encoding ' + enc);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * ch * 2, 28); h.writeUInt16LE(ch * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [src, dst] = process.argv.slice(2);
  for (const f of await readdir(src)) {
    if (!f.endsWith('.au')) continue;
    const wav = auToWav(await readFile(path.join(src, f)));
    await writeFile(path.join(dst, f.replace(/\.au$/, '.wav')), wav);
    console.log(f, '->', f.replace(/\.au$/, '.wav'), wav.length, 'bytes');
  }
}
