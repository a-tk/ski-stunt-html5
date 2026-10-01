// Hosts the editors: a docked panel next to the game. Opening an editor from the toolbar replaces
// whatever is open; an editor can also push another one on top (the map editor's "Edit Objects…"), and
// closing that one brings the first back exactly as it was.
import { el } from '../dom.js';

const stack = [];

function layout() {
  const host = document.getElementById('editors');
  stack.forEach((e, i) => { e.panel.hidden = i !== stack.length - 1; });
  host.hidden = stack.length === 0;
  document.body.classList.toggle('editing', stack.length > 0);
}

/** Opens an editor. make(body, app, close) returns an object with an optional destroy(). */
export function openEditor(app, title, make, { push = false } = {}) {
  if (!push) closeAll(app, false);
  const host = document.getElementById('editors');
  const body = el('div', { class: 'editor-body' });
  const entry = { title, instance: null, panel: null };
  const close = () => closeTop(app, entry);
  entry.panel = el('div', { class: 'editor-panel' },
    el('div', { class: 'editor-head' }, el('strong', {}, title), el('button', { type: 'button', onclick: close }, 'Close')), body);
  host.append(entry.panel);
  stack.push(entry);
  layout();
  entry.instance = make(body, app, close);
  return entry.instance;
}

function closeTop(app, entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  // closing an editor also closes any editor pushed on top of it
  while (stack.length > i) {
    const e = stack.pop();
    e.instance?.destroy?.();
    e.panel.remove();
  }
  layout();
  const top = stack[stack.length - 1];
  top?.instance?.resumed?.();
  if (stack.length === 0) app?.focusGame?.();
}

export function closeAll(app, focus = true) {
  while (stack.length) {
    const e = stack.pop();
    e.instance?.destroy?.();
    e.panel.remove();
  }
  layout();
  if (focus) app?.focusGame?.();
}

export const currentEditor = () => stack[stack.length - 1]?.instance ?? null;
