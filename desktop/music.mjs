import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

/** Formats Electron's Chromium decodes offline. Other files in the folder are ignored. */
export const musicTypes = {
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm',
};
const MAX_DEPTH = 3, MAX_TRACKS = 2000;
const TRACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True only for a path strictly inside folder; both must already be real (resolved) paths. */
export function isInside(folder, file) {
  const relative = path.relative(folder, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * List supported audio files below a player-chosen folder. Symbolic links are
 * skipped, so a listing cannot reach outside the folder. Returns only display
 * titles and freshly issued ids to the renderer; paths stay in the table.
 */
export async function scanFolder(folder) {
  const table = new Map();
  if (!folder) return { library: { status: 'none', tracks: [], skipped: 0 }, table };
  const label = path.basename(folder) || folder;
  let root;
  try {
    root = await realpath(folder);
    if (!(await stat(root)).isDirectory()) return { library: { status: 'missing', folder: label, tracks: [], skipped: 0 }, table };
  } catch (error) {
    const status = error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 'missing' : 'unreadable';
    return { library: { status, folder: label, tracks: [], skipped: 0 }, table };
  }
  const found = [];
  let skipped = 0, readable = false;
  const walk = async (directory, depth) => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); readable = true; } catch { return; }
    for (const entry of entries) {
      if (found.length >= MAX_TRACKS) return;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { skipped++; continue; }
      if (entry.isDirectory()) { if (depth < MAX_DEPTH) await walk(file, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (musicTypes[path.extname(entry.name).toLowerCase()]) found.push(file); else skipped++;
    }
  };
  await walk(root, 0);
  if (!readable) return { library: { status: 'unreadable', folder: label, tracks: [], skipped: 0 }, table };
  found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const tracks = found.map(file => {
    const id = randomUUID();
    table.set(id, file);
    const relative = path.relative(root, file);
    return { id, title: relative.slice(0, -path.extname(relative).length).split(path.sep).join(' / ') };
  });
  return { library: { status: tracks.length ? 'ok' : 'empty', folder: label, tracks, skipped }, table, root };
}

/** Resolve a renderer-supplied id to a file, re-checking it is still a real file inside the folder. */
export async function resolveTrack(table, root, id) {
  if (typeof id !== 'string' || !TRACK_ID.test(id) || !root) return null;
  const file = table.get(id);
  if (!file || !musicTypes[path.extname(file).toLowerCase()]) return null;
  try {
    const real = await realpath(file);
    if (!isInside(root, real) || (await lstat(file)).isSymbolicLink() || !(await stat(real)).isFile()) return null;
    return real;
  } catch { return null; }
}

/** Parse a single "bytes=a-b" range. Returns null for no/invalid range, or false when unsatisfiable. */
export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (start >= size || start > end) return false;
  return { start, end };
}

/** Answer a cerea-music://track/<id> request; any other URL, method or id is a 404. */
export async function trackResponse(request, table, root) {
  let url;
  try { url = new URL(request.url); } catch { return new Response('Not found', { status: 404 }); }
  if (url.protocol !== 'cerea-music:' || url.host !== 'track' || request.method !== 'GET' || url.search)
    return new Response('Not found', { status: 404 });
  const file = await resolveTrack(table, root, url.pathname.slice(1));
  if (!file) return new Response('Not found', { status: 404 });
  const size = (await stat(file)).size;
  const headers = { 'Content-Type': musicTypes[path.extname(file).toLowerCase()], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = parseRange(request.headers.get('range'), size);
  if (range === false) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size === 0 ? null : Readable.toWeb(createReadStream(file, { start, end }));
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...headers, 'Content-Length': String(size === 0 ? 0 : end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) },
  });
}

/** The chosen folder lives beside the other durable player data (userData). */
export async function readChoice(profile) {
  try {
    const value = JSON.parse(await readFile(path.join(profile, 'music-folder.json'), 'utf8'));
    return typeof value?.folder === 'string' && path.isAbsolute(value.folder) ? value.folder : undefined;
  } catch { return undefined; }
}
export async function writeChoice(profile, folder) {
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, 'music-folder.json'), JSON.stringify({ folder }) + '\n');
}
