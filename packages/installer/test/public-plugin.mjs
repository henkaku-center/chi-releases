// Explicit public-only dependency acquisition and real bundled-plugin tests.
// Not a full host installation, supervisor/pairing test or publication authority.
import { mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { plugin } from '../dist/plugin.js';
import { buildEnvironment } from '../dist/system.js';

const root = process.argv[2];
if (!root) throw new Error('Usage: node test/public-plugin.mjs NEW_PRIVATE_DIRECTORY');
const out = resolve(root);
await mkdir(out, { mode: 0o700 }); // Must not reuse an account, history or installation.
const env = buildEnvironment(out, `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`);
await mkdir(env.HOME, { recursive: true, mode: 0o700 });
const target = join(out, 'plugin');
await mkdir(target, { mode: 0o700 });
for (const [path, text] of Object.entries(plugin.files)) await writeFile(join(target, path), text, { flag: 'wx', mode: 0o600 });
const tests = fileURLToPath(new URL('../../opencode-chi-mentions/test/', import.meta.url));
await mkdir(join(target, 'test'), { mode: 0o700 });
for (const name of ['plugin.test.js', 'source.test.js']) await cp(join(tests, name), join(target, 'test', name));
const report = { platform: process.platform, arch: process.arch, node: process.version, source: plugin.source, credentialsInherited: false, results: [] };
for (const [command, args] of [['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']], [process.execPath, ['--test', '--test-concurrency=2', 'test/plugin.test.js', 'test/source.test.js']]]) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: target, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
  const log = `${result.stdout || ''}\n${result.stderr || ''}`;
  await writeFile(join(out, `${report.results.length}.log`), log, { mode: 0o600 });
  report.results.push({ command, args, status: result.status, elapsedMs: Math.round(performance.now() - started), logSHA256: createHash('sha256').update(log).digest('hex') });
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  assert.equal(result.error, undefined, 'public acquisition/test could not execute');
  assert.equal(result.status, 0, `Public plugin gate failed; private logs: ${out}`);
}
assert.equal(await readFile(join(target, 'package-lock.json'), 'utf8'), plugin.files['package-lock.json']);
console.log(JSON.stringify({ ...report, privateEvidence: out }));
