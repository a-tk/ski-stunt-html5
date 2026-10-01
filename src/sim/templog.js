/** The log of a run (port of sim/TempLog.java): lines of script that replay can run again. */
export class TempLog {
  constructor() { this.data = []; }

  /** Appends text; a trailing newline ends a line. */
  write(text) {
    for (const line of text.split('\n')) if (line.length > 0) this.data.push(line);
  }

  hasData() { return this.data.length > 0; }
  lines() { return this.data; }
}
