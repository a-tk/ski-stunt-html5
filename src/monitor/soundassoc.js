// Port of monitor/SoundAssoc.java: which sound to play for a contact on a given link and point tag.
import { tokens, int, lines } from '../util/text.js';

export class SoundAssoc {
  constructor() { this.assocList = []; }

  /** Parses config/ski.snd-style text: "file linkNum tag" per line. */
  parse(text) {
    for (const line of lines(text)) {
      const t = tokens(line);
      if (t.length === 0) continue;
      if (t.length < 3) throw new Error(`bad sound association line: ${line}`);
      this.assocList.push({ fname: t[0], linkNum: int(t[1]), tag: t[2] });
    }
  }

  async read(path, vfs) {
    try {
      const text = await vfs.readText(path);
      if (text == null) { console.log(`Bad URL:${path}`); return false; }
      this.parse(text);
      return true;
    } catch (e) {
      console.log(`exception: ${e.message}`);
      return false;
    }
  }
}
