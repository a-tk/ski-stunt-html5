// Tiny DOM helpers for building the editor panels.

/** el('div', {class: 'x', onclick: fn}, child, 'text', ...) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

/** A labelled number/text field. onChange gets the raw string; returns {row, input}. */
export function field(label, { value = '', width = 70, type = 'text', onChange = null } = {}) {
  const input = el('input', { type, value: String(value), style: `width:${width}px` });
  if (onChange) input.addEventListener('input', () => onChange(input.value));
  return { row: el('label', { class: 'field' }, el('span', {}, label), input), input };
}

/** Parses a number from a text box; undefined while the text isn't a number yet. */
export function parse(text) {
  const t = String(text).trim();
  if (t === '' || t === '-' || t === '.' || t === '-.') return;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

/** [r,g,b] (0..255) <-> '#rrggbb' */
export const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const fromHex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

/** Rebuilds a <select>'s options. items = [{value, label}] */
export function setOptions(select, items, selected) {
  select.replaceChildren(...items.map((it) => el('option', { value: it.value, textContent: it.label })));
  if (selected !== undefined) select.value = selected;
}
