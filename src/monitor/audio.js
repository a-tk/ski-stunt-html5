// Plays the game's sounds with Web Audio. Scripts refer to sounds/*.au (as in the Java version); the
// files here are the WAV conversions, so the extension is swapped. Browsers only allow sound after a
// user gesture, so unlock() is called from the first click/key.
export class Audio {
  /** @param {import('../storage/vfs.js').Vfs} vfs */
  constructor(vfs) {
    this.vfs = vfs;
    this.ctx = null;
    this.buffers = new Map();
    this.muted = false;
  }

  /** Creates/resumes the audio context; call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  async load(path) {
    if (this.buffers.has(path)) return this.buffers.get(path);
    const wav = path.replace(/\.au$/i, '.wav');
    const bytes = await this.vfs.readBytes(wav);
    let buf = null;
    if (bytes && this.ctx) {
      try { buf = await this.ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); } catch { buf = null; }
    }
    this.buffers.set(path, buf);
    return buf;
  }

  /** Plays a sound now (overlapping plays are fine). */
  play(path) {
    if (this.muted || !this.ctx) return;
    this.load(path).then((buf) => {
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start();
    });
  }

  /** Decodes the game's sounds ahead of time (once the context exists). */
  async preload(paths) { await Promise.all(paths.map((p) => this.load(p))); }
}
