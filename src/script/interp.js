// The command interpreter (port of World.interp and the DefaultCmdInterp '<' command).
// A line is split on whitespace; the first token selects a handler. Unknown commands are ignored,
// exactly as in the Java version. Handlers may return a Promise (file reads); callers that don't
// care (the monitors) just ignore it, because '<' on an already-loaded file runs synchronously.
import { tokens, lines } from '../util/text.js';

export class Interpreter {
  constructor(world) {
    this.world = world;
    this.commands = new Map();
  }

  register(name, fn) { this.commands.set(name, fn); }

  /** Runs one line. Returns a Promise if the command is asynchronous, else undefined. */
  interp(line) {
    const t = tokens(line);
    if (t.length === 0) return;
    const fn = this.commands.get(t[0]);
    if (!fn) return;
    try {
      const r = fn(t, this.world);
      if (r && typeof r.then === 'function') return r.catch((e) => console.log(`exception: ${e.message}`));
      return r;
    } catch (e) {
      console.log(`exception: ${e.message}`);
      return;
    }
  }

  /** Runs lines in order, waiting for any that return a Promise. Runs synchronously when it can. */
  runLines(list, start = 0) {
    for (let i = start; i < list.length; i++) {
      if (this.world.playback?.stopPlay) return;
      const r = this.interp(list[i]);
      if (r && typeof r.then === 'function') return r.then(() => this.runLines(list, i + 1));
    }
    return;
  }

  /** '< file': runs a script file (synchronously if its text is already loaded). */
  runFile(path) {
    const { vfs } = this.world;
    const cached = vfs.peekText(path);
    if (cached !== undefined) {
      if (cached == null) { console.log(`exception: ${path} not found`); return; }
      return this.runLines(lines(cached));
    }
    return vfs.readText(path).then((text) => {
      if (text == null) { console.log(`exception: ${path} not found`); return; }
      return this.runLines(lines(text));
    });
  }
}
