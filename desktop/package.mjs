import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { platform: { type: 'string', default: process.platform }, arch: { type: 'string', default: process.arch } } });

const root = path.resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await mkdir(path.join(root, '.desktop-stage'), { recursive: true });
const stage = await mkdtemp(path.join(root, '.desktop-stage', 'app-'));
try {
  await cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  await mkdir(path.join(stage, 'desktop'));
  for (const file of ['main.mjs', 'assets.mjs', 'districts.mjs', 'music.mjs', 'preload.cjs']) {
    await cp(path.join(root, 'desktop', file), path.join(stage, 'desktop', file));
  }
  await writeFile(path.join(stage, 'package.json'), JSON.stringify({
    name: metadata.name, productName: metadata.productName, version: metadata.version,
    description: metadata.description, type: 'module', main: metadata.main,
  }, null, 2));
  const electronVersion = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
  const outputs = await packager({
    dir: stage, name: 'Cerea Vice', executableName: 'cerea-vice',
    out: path.join(root, 'release'), overwrite: true,
    win32metadata: { CompanyName: metadata.productName, FileDescription: metadata.description },
    platform: values.platform, arch: values.arch,
    electronVersion,
    asar: true, prune: false,
  });
  console.log(`Desktop bundle: ${outputs.join('\n')}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
