// Download helpers (browser only): hand the user a file made in memory.
import { makeZip } from './zip.js';

/** Starts a download of bytes/text under the given file name. */
export function downloadFile(name, bytes, type = 'application/octet-stream') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Bundles files read from the VFS into a zip (paths kept, so unzipping into the game's assets folder
 * puts them where they belong) and downloads it. Missing files are skipped.
 */
export async function downloadZip(name, vfs, paths) {
  const files = [];
  for (const p of paths) {
    const bytes = await vfs.readBytes(p);
    if (bytes) files.push({ path: p, bytes });
  }
  downloadFile(name, makeZip(files), 'application/zip');
  return files.length;
}
