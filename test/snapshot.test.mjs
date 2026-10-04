import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { files, digest, releaseManifest, verifySnapshot, regularFiles } from '../scripts/snapshot.mjs';
import { importSnapshot } from '../scripts/import-snapshot.mjs';

const tag = 'chi-v1.0.0';
const pkg = { name: '@henkaku-center/chi', version: '1.0.0', private: false, repository: { url: 'git+https://github.com/henkaku-center/chi-releases.git', directory: 'packages/installer' } };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'chi-public-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'); mkdirSync(source);
  const hashes = {};
  for (const path of files) {
    const bytes = path === 'packages/installer/package.json' ? JSON.stringify(pkg) : `synthetic ${path}\n`;
    mkdirSync(dirname(join(source, path)), { recursive: true }); writeFileSync(join(source, path), bytes);
    hashes[path] = digest(bytes);
  }
  const marker = { tag, files: hashes };
  const save = () => writeFileSync(join(source, '.installer-snapshot.json'), JSON.stringify(marker)); save();
  return { root, source, marker, save };
}
test('only exact reviewed installer manifests and stable matching tags are admitted', () => {
  assert.doesNotThrow(() => releaseManifest(pkg, tag));
  for (const changes of [{ private: true }, { private: undefined }, { name: 'attacker' }, { version: '0.3.0' }, { version: '2.0.0' }, { version: '1.0.0-rc.1' }, { version: '1.00.0' }, { repository: { ...pkg.repository, url: 'git+https://github.com/henkaku-center/chi.git' } }, { repository: { ...pkg.repository, directory: '.' } }, { publishConfig: { provenance: false } }, { dependencies: { private: '*' } }]) assert.throws(() => releaseManifest({ ...pkg, ...changes }, `chi-v${changes.version ?? pkg.version}`));
  for (const wrong of ['chi-v1.0.1', 'chi-v1.0.0\n', 'main', undefined]) assert.throws(() => releaseManifest(pkg, wrong));
});
test('snapshot bytes, membership, tag and manifest metadata are exact', t => {
  const f = fixture(t);
  assert.deepEqual(verifySnapshot(f.source, tag, true), pkg);
  assert.throws(() => verifySnapshot(f.source, 'chi-v1.0.1', true));
  f.marker.tag = 'chi-v1.0.1'; f.save(); assert.throws(() => verifySnapshot(f.source, tag, true)); f.marker.tag = tag; f.save();
  f.marker.privateCommit = 'forbidden'; f.save(); assert.throws(() => verifySnapshot(f.source, tag, true)); delete f.marker.privateCommit; f.save();
  const path = join(f.source, 'LICENSE'), bytes = readFileSync(path);
  writeFileSync(path, 'changed'); assert.throws(() => verifySnapshot(f.source, tag, true)); writeFileSync(path, bytes);
  writeFileSync(join(f.source, 'private.txt'), 'private'); assert.throws(() => verifySnapshot(f.source, tag, true)); rmSync(join(f.source, 'private.txt'));
  writeFileSync(join(f.source, 'packages/installer/src/unreviewed.ts'), '// bypass'); assert.throws(() => verifySnapshot(f.source, tag)); rmSync(join(f.source, 'packages/installer/src/unreviewed.ts'));
  f.marker.files['../escape'] = digest('evil'); f.save(); assert.throws(() => verifySnapshot(f.source, tag, true)); delete f.marker.files['../escape']; f.save();
  rmSync(path); assert.throws(() => verifySnapshot(f.source, tag, true));
});
test('links, hardlinks, special/oversized files and linked parents are refused', t => {
  const f = fixture(t), path = join(f.source, 'LICENSE'), outside = join(f.root, 'outside');
  writeFileSync(outside, readFileSync(path)); rmSync(path); symlinkSync(outside, path);
  assert.throws(() => verifySnapshot(f.source, tag, true)); rmSync(path); linkSync(outside, path);
  assert.throws(() => regularFiles(f.source));
  assert.throws(() => verifySnapshot(f.source, tag, true)); rmSync(path); writeFileSync(path, Buffer.alloc(1024 * 1024 + 1));
  f.marker.files.LICENSE = digest(readFileSync(path)); f.save(); assert.throws(() => verifySnapshot(f.source, tag, true));
  const linked = join(f.root, 'linked'); symlinkSync(f.source, linked); assert.throws(() => verifySnapshot(linked, tag));
});
test('control characters in a path name are refused before allowlist comparison', t => {
  const f = fixture(t);
  const tabbed = join(f.source, 'packages/installer/README.md\tprivate-notes.txt');
  writeFileSync(tabbed, 'private');
  assert.throws(() => regularFiles(f.source), /Control character in snapshot path/);
  assert.throws(() => verifySnapshot(f.source, tag, true), /Control character/);
  rmSync(tabbed);
  const controlled = join(f.source, 'packages/installer/notes\u0001.txt');
  writeFileSync(controlled, 'private');
  assert.throws(() => regularFiles(f.source), /Control character in snapshot path/);
  rmSync(controlled);
  assert.doesNotThrow(() => verifySnapshot(f.source, tag, true));
});
test('import preserves public control files and ancestry and rejects a dirty checkout', t => {
  const f = fixture(t), destination = join(f.root, 'public'); mkdirSync(destination);
  const git = (...args) => execFileSync('git', args, { cwd: destination, env: { ...process.env, GIT_AUTHOR_NAME: 'mochi-the-kitty', GIT_AUTHOR_EMAIL: 'mochi-the-kitty@users.noreply.github.com', GIT_COMMITTER_NAME: 'mochi-the-kitty', GIT_COMMITTER_EMAIL: 'mochi-the-kitty@users.noreply.github.com' }, stdio: 'pipe' }).toString();
  git('init'); writeFileSync(join(destination, 'public-policy'), 'reviewed'); git('add', '.'); git('commit', '-m', 'public fixture');
  const before = git('rev-parse', 'HEAD');
  writeFileSync(join(f.source, 'private.txt'), 'must never be imported');
  assert.throws(() => importSnapshot(f.source, tag, destination));
  assert.equal(git('status', '--porcelain'), ''); rmSync(join(f.source, 'private.txt'));
  importSnapshot(f.source, tag, destination);
  assert.equal(git('rev-parse', 'HEAD'), before); assert.equal(readFileSync(join(destination, 'public-policy'), 'utf8'), 'reviewed');
  assert.deepEqual(verifySnapshot(destination, tag), pkg);
  assert.throws(() => importSnapshot(f.source, tag, destination), /clean/);
  git('add', '.'); git('commit', '-m', 'snapshot fixture');
  assert.equal(git('rev-parse', 'HEAD^'), before);
  assert.equal(git('rev-list', '--count', 'HEAD').trim(), '2');
});
test('release entry point rejects wrong repositories, dispatch, branches and malformed tags', t => {
  const f = fixture(t), script = resolve('scripts/release-check.mjs');
  const good = { GITHUB_REPOSITORY: 'henkaku-center/chi-releases', GITHUB_EVENT_NAME: 'push', GITHUB_REF: `refs/tags/${tag}` };
  const run = env => spawnSync(process.execPath, [script], { cwd: f.source, env: { PATH: process.env.PATH, ...good, ...env }, encoding: 'utf8' });
  assert.equal(run({}).status, 0);
  for (const env of [{ GITHUB_REPOSITORY: 'henkaku-center/chi' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REF: 'refs/tags/chi-v1.0.0-evil' }, { GITHUB_REF: 'refs/tags/chi-v1.0.1' }]) assert.notEqual(run(env).status, 0);
});
