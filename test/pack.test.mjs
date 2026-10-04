import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { files, digest } from '../scripts/snapshot.mjs';

test('pack checks distribution membership, preserves tested bytes and hashes exact tarball without lifecycle execution', t => {
  const root = mkdtempSync(join(tmpdir(), 'chi-pack-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const installer = join(root, 'packages/installer'); mkdirSync(join(installer, 'dist'), { recursive: true });
  const manifest = { name: '@henkaku-center/chi', version: '1.0.0', private: false, repository: { url: 'git+https://github.com/henkaku-center/chi-releases.git', directory: 'packages/installer' }, files: ['dist', 'TRUST.md'], scripts: { prepack: 'touch lifecycle-ran' } };
  for (const path of files) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), 'synthetic input\n'); }
  writeFileSync(join(installer, 'package.json'), JSON.stringify(manifest));
  for (const path of ['dist/cli.js', 'dist/sigstore.js', 'LICENSE', 'TRUST.md']) writeFileSync(join(installer, path), 'tested bytes\n');
  writeFileSync(join(root, '.installer-snapshot.json'), JSON.stringify({ tag: 'chi-v1.0.0', files: Object.fromEntries(files.map(path => [path, digest(readFileSync(join(root, path)))])) }));
  const script = resolve('scripts/pack.mjs');
  const pack = () => spawnSync(process.execPath, [script], { cwd: root, env: { PATH: process.env.PATH, HOME: root, npm_config_cache: join(root, 'npm-cache'), GITHUB_REF_NAME: 'chi-v1.0.0' }, encoding: 'utf8' });
  const result = pack(); assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(join(installer, 'lifecycle-ran')), false);
  const name = 'henkaku-center-chi-1.0.0.tgz', bytes = readFileSync(join(root, 'artifacts', name));
  for (const hash of ['sha256', 'sha512']) assert.equal(readFileSync(join(root, 'artifacts', `${hash.toUpperCase()}SUMS`), 'utf8'), `${createHash(hash).update(bytes).digest('hex')}  ${name}\n`);
  rmSync(join(root, 'artifacts'), { recursive: true });
  writeFileSync(join(installer, 'dist/private.env'), 'private payload'); assert.notEqual(pack().status, 0);
  rmSync(join(root, 'artifacts'), { recursive: true }); rmSync(join(installer, 'dist/private.env')); rmSync(join(installer, 'dist/sigstore.js'));
  assert.notEqual(pack().status, 0);
  rmSync(join(root, 'artifacts'), { recursive: true }); writeFileSync(join(installer, 'dist/sigstore.js'), 'tested bytes\n');
  writeFileSync(join(installer, 'package.json'), JSON.stringify({ ...manifest, publishConfig: { provenance: false } }));
  assert.notEqual(pack().status, 0);
});
