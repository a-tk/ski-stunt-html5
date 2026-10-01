// Text helpers matching Java's StringTokenizer / Float.valueOf behavior.

/** Splits on whitespace (space, tab, CR, LF, FF) like StringTokenizer's default delimiters. */
export function tokens(line) {
  const t = line.split(/[ \t\r\n\f]+/);
  return t.filter((s) => s.length > 0);
}

/** Float.valueOf: throws on text that isn't a number. */
export function num(s) {
  const t = String(s).trim().replace(/[fFdD]$/, '');
  const v = Number(t);
  if (t === '' || Number.isNaN(v)) {
    if (t === 'NaN') return NaN;
    throw new Error(`bad number: ${s}`);
  }
  return v;
}

/** Integer.valueOf. */
export function int(s) {
  const v = Number(String(s).trim());
  if (!Number.isInteger(v)) throw new Error(`bad integer: ${s}`);
  return v;
}

/** Splits file text into lines (handles CRLF). */
export function lines(text) {
  return text.split(/\r\n|\n|\r/);
}
