// The virtual file system: every file the game reads goes through here. User-made files (skins, maps,
// objects) live only in an in-memory overlay; everything else is fetched from the static assets folder.
// Nothing is ever written to disk -- the editors offer a download instead.

export class Vfs {
  /**
   * @param {object} opts
   * @param {string} [opts.base] URL (or directory) the assets are served from, e.g. 'assets/'
   * @param {(path: string) => Promise<Uint8Array|null>} [opts.loader] replaces fetch (used by tests)
   */
  constructor({ base = 'assets/', loader = null } = {}) {
    this.base = base.endsWith('/') ? base : `${base}/`;
    this.loader = loader;
    this.overlay = new Map();   // path -> Uint8Array (user-made or edited files)
    this.cache = new Map();     // path -> string | null (text read so far; null = not found)
    this.bytesCache = new Map();
    this.manifestData = null;
    this.listeners = new Set();
  }

  static normalize(path) { return path.replace(/^\.?\//, ''); }

  async fetchBytes(path) {
    if (this.loader) return this.loader(path);
    const res = await fetch(this.base + path);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }

  /** The bytes of a file, or null if it doesn't exist. */
  async readBytes(path) {
    path = Vfs.normalize(path);
    if (this.overlay.has(path)) return this.overlay.get(path);
    if (this.bytesCache.has(path)) return this.bytesCache.get(path);
    const b = await this.fetchBytes(path);
    this.bytesCache.set(path, b);
    return b;
  }

  /** The text of a file, or null if it doesn't exist. */
  async readText(path) {
    path = Vfs.normalize(path);
    if (this.overlay.has(path)) return new TextDecoder().decode(this.overlay.get(path));
    if (this.cache.has(path)) return this.cache.get(path);
    const b = await this.fetchBytes(path);
    const text = b == null ? null : new TextDecoder().decode(b);
    this.cache.set(path, text);
    return text;
  }

  /** Text that is already loaded (or user-made), without waiting; undefined if it hasn't been read yet. */
  peekText(path) {
    path = Vfs.normalize(path);
    if (this.overlay.has(path)) return new TextDecoder().decode(this.overlay.get(path));
    return this.cache.get(path);
  }

  async exists(path) { return (await this.readBytes(path)) != null; }

  /** Stores a file in memory only. */
  writeBytes(path, bytes) {
    path = Vfs.normalize(path);
    this.overlay.set(path, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    this.changed();
  }

  writeText(path, text) { this.writeBytes(path, new TextEncoder().encode(text)); }

  /** Removes a user-made file (built-in files can't be removed). */
  remove(path) { this.overlay.delete(Vfs.normalize(path)); this.changed(); }

  /** Whether the file is user-made / edited (it lives in the overlay). */
  isUserFile(path) { return this.overlay.has(Vfs.normalize(path)); }

  /** Paths of every user-made file, sorted. */
  userFiles() { return [...this.overlay.keys()].sort(); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) f(); }

  /** assets/manifest.json: the lists a static server can't give us. */
  async manifest() {
    if (!this.manifestData) {
      const text = await this.readText('manifest.json');
      this.manifestData = text ? JSON.parse(text) : { terrains: [], skins: [], objects: [], objectFiles: [], demos: [], sounds: [] };
    }
    return this.manifestData;
  }
}
