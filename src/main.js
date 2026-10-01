import { startApp } from './ui/app.js';

startApp().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) { el.hidden = false; el.textContent = `Could not start: ${e.message}`; }
});
