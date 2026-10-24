import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { assetPath } from './assets.mjs';
const root = path.resolve('dist');
test('desktop origin serves only bundled assets', () => {
  assert.equal(assetPath('cerea://game/', root), path.join(root, 'index.html'));
  assert.equal(assetPath('cerea://game/assets/game.js', root), path.join(root, 'assets/game.js'));
  for (const url of ['https://game/index.html', 'cerea://other/index.html', 'cerea://game/%2e%2e%2fpackage.json', 'cerea://game/%5c..%5cpackage.json', 'cerea://game/%00']) {
    assert.equal(assetPath(url, root), null, url);
  }
});
