import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chooseDistrict, districtIds } from './districts.mjs';

test('launchers accept every registered district and name them when one is unknown', async () => {
  const ids = districtIds('public/maps/towns.json');
  for (const id of ['cerea', 'harbor', 'cerea-outskirts', 'lower-verona']) assert.ok(ids.includes(id), id);
  assert.equal(chooseDistrict('lower-verona', ids), 'lower-verona');
  assert.throws(() => chooseDistrict('verona', ids), /Unknown district "verona". Choose one of: cerea, harbor, cerea-outskirts, lower-verona\./);
  const directory = await mkdtemp(path.join(tmpdir(), 'cerea-districts-'));
  try {
    const broken = path.join(directory, 'towns.json'); await writeFile(broken, '{');
    assert.deepEqual(districtIds(broken), []);
    await writeFile(broken, JSON.stringify({ towns: [{ id: 'ok' }, { id: '../escape' }, { id: 3 }] }));
    assert.deepEqual(districtIds(broken), ['ok'], 'Only plain ids are offered');
    assert.throws(() => chooseDistrict('cerea', []), /No districts are listed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
