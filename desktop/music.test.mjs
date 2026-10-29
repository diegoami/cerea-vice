import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isInside, parseRange, readChoice, resolveTrack, scanFolder, trackResponse, writeChoice } from './music.mjs';

const request = (url, headers = {}, method = 'GET') => ({ url, method, headers: new Headers(headers) });
async function withFolder(run) {
  const base = await mkdtemp(path.join(tmpdir(), 'cerea-music-unit-'));
  try { await run(base); } finally { await chmod(base, 0o700).catch(() => {}); await rm(base, { recursive: true, force: true }); }
}

test('a music folder lists supported audio only, by id, and reports missing or empty folders', async () => withFolder(async base => {
  const folder = path.join(base, 'Radio');
  assert.equal((await scanFolder(undefined)).library.status, 'none');
  assert.equal((await scanFolder(folder)).library.status, 'missing');
  await mkdir(path.join(folder, 'Side B'), { recursive: true });
  await writeFile(path.join(folder, 'notes.txt'), 'not music');
  assert.deepEqual((await scanFolder(folder)).library, { status: 'empty', folder: 'Radio', tracks: [], skipped: 1 });
  await writeFile(path.join(folder, '02 Night Drive.MP3'), 'x');
  await writeFile(path.join(folder, '10 Coast.ogg'), 'x');
  await writeFile(path.join(folder, 'Side B', '01 Neon.wav'), 'x');
  await writeFile(path.join(folder, 'cover.jpg'), 'x');
  const { library, table } = await scanFolder(folder);
  assert.equal(library.status, 'ok');
  assert.deepEqual(library.tracks.map(t => t.title), ['02 Night Drive', '10 Coast', 'Side B / 01 Neon']);
  assert.equal(library.skipped, 2);
  assert.ok(library.tracks.every(t => /^[0-9a-f-]{36}$/.test(t.id) && !t.title.includes(base)), 'The renderer receives no paths');
  assert.equal(table.size, 3);
  const again = await scanFolder(folder);
  assert.notEqual(again.library.tracks[0].id, library.tracks[0].id, 'Each listing issues fresh ids');
}));

test('track ids cannot escape the chosen folder by traversal, symlink, foreign table entry or unsupported type', async () => withFolder(async base => {
  const folder = path.join(base, 'Music'), outside = path.join(base, 'secret.mp3');
  await mkdir(folder); await writeFile(outside, 'private'); await writeFile(path.join(folder, 'song.mp3'), 'abcdef');
  await symlink(outside, path.join(folder, 'link.mp3')).catch(() => {});
  const { library, table, root } = await scanFolder(folder);
  assert.deepEqual(library.tracks.map(t => t.title), ['song'], 'Symbolic links are not listed');
  const id = library.tracks[0].id;
  assert.equal(await resolveTrack(table, root, id), path.join(root, 'song.mp3'));
  for (const bad of ['../secret.mp3', '..%2Fsecret.mp3', outside, '', 'song.mp3', id.toUpperCase(), undefined, 42])
    assert.equal(await resolveTrack(table, root, bad), null, `rejects ${bad}`);
  const forged = new Map(table); const fake = '00000000-0000-4000-8000-000000000000';
  forged.set(fake, outside); assert.equal(await resolveTrack(forged, root, fake), null, 'A path outside the folder is refused even if listed');
  forged.set(fake, path.join(folder, '..', 'secret.mp3')); assert.equal(await resolveTrack(forged, root, fake), null);
  forged.set(fake, path.join(folder, 'link.mp3')); assert.equal(await resolveTrack(forged, root, fake), null, 'A symlink is refused');
  await writeFile(path.join(folder, 'readme.txt'), 'x'); forged.set(fake, path.join(folder, 'readme.txt'));
  assert.equal(await resolveTrack(forged, root, fake), null, 'Only audio types are served');
  assert.equal(isInside(root, root), false); assert.equal(isInside(root, path.join(root, 'a')), true);
  assert.equal(isInside(root, path.join(root + 'x', 'a')), false, 'A sibling folder with the same prefix is outside');
}));

test('the music protocol serves only GET track ids, with byte ranges for seeking', async () => withFolder(async base => {
  const folder = path.join(base, 'Music'); await mkdir(folder); await writeFile(path.join(folder, 'song.mp3'), 'abcdef');
  const { library, table, root } = await scanFolder(folder);
  const url = `cerea-music://track/${library.tracks[0].id}`;
  const full = await trackResponse(request(url), table, root);
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/mpeg'); assert.equal(await full.text(), 'abcdef');
  const part = await trackResponse(request(url, { range: 'bytes=2-3' }), table, root);
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 2-3/6'); assert.equal(await part.text(), 'cd');
  assert.equal((await trackResponse(request(url, { range: 'bytes=9-' }), table, root)).status, 416);
  for (const bad of [url.replace('track', 'file'), `cerea-music://track/../secret.mp3`, `cerea-music://track/${library.tracks[0].id}?path=/etc/passwd`, `cerea://game/${library.tracks[0].id}`, 'not a url'])
    assert.equal((await trackResponse(request(bad), table, root)).status, 404, bad);
  assert.equal((await trackResponse(request(url, {}, 'POST'), table, root)).status, 404);
  assert.deepEqual(parseRange('bytes=-2', 6), { start: 4, end: 5 });
  assert.equal(parseRange('bytes=0-1,3-4', 6), null);
  assert.equal(parseRange('items=0-1', 6), null);
}));

test('an unreadable folder is reported and the chosen folder persists in the profile', async () => withFolder(async base => {
  const folder = path.join(base, 'Locked'); await mkdir(folder); await writeFile(path.join(folder, 'a.mp3'), 'x');
  if (process.getuid?.() !== 0) { await chmod(folder, 0o000); assert.equal((await scanFolder(folder)).library.status, 'unreadable'); await chmod(folder, 0o700); }
  const profile = path.join(base, 'profile');
  assert.equal(await readChoice(profile), undefined);
  await writeChoice(profile, folder); assert.equal(await readChoice(profile), folder);
  await writeFile(path.join(profile, 'music-folder.json'), '{"folder":"relative/path"}');
  assert.equal(await readChoice(profile), undefined, 'Only absolute folders are restored');
  await writeFile(path.join(profile, 'music-folder.json'), '{damaged');
  assert.equal(await readChoice(profile), undefined);
}));
