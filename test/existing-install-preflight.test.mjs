import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countAgentRecords, nvmPackageCandidates } from '../scripts/existing-install-preflight.mjs';

test('bounded source-layout inventory reports counts only, without changing records', t => {
  const dir = mkdtempSync(join(tmpdir(), 'adoption-metadata-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'project'));
  const bytes = JSON.stringify({ id: 'private-id', provider: 'opencode', title: 'PRIVATE_TITLE', config: { providerOptions: { secret: 'PRIVATE_VALUE' } }, persistence: { provider: 'opencode', sessionId: 'PRIVATE_NATIVE_ID' } });
  writeFileSync(join(dir, 'project/agent.json'), bytes);
  assert.deepEqual(countAgentRecords(dir), { records: 1, opencodeRecords: 1, nativeMappings: 1, invalid: 0, complete: true });
  assert.equal(readFileSync(join(dir, 'project/agent.json'), 'utf8'), bytes);
  writeFileSync(join(dir, 'broken.json'), '{');
  assert.equal(countAgentRecords(dir).complete, false);
  symlinkSync(join(dir, 'project/agent.json'), join(dir, 'linked.json'));
  assert.throws(() => countAgentRecords(dir), /Linked/);
});

test('oversized records refuse rather than reporting complete counts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'adoption-bounds-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'agent.json'), 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => countAgentRecords(dir), /bound/);
});

test('different nvm versions reveal package candidates without executing them or exposing extra manifest fields', t => {
  const home = mkdtempSync(join(tmpdir(), 'adoption-nvm-')); t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.deepEqual(nvmPackageCandidates(home), []);
  for (const [node, name, version] of [['v24.20.0', '@opencode/cli', '2.0.22'], ['v22.21.1', '@getpaseo/cli', '0.6.1']]) {
    const dir = join(home, '.nvm/versions/node', node, 'lib/node_modules', name); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, scripts: { install: 'NEVER_EXECUTE' }, unrelated: 'PRIVATE_FIXTURE' }));
  }
  const found = nvmPackageCandidates(home);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map(x => x.version).sort(), ['0.6.1', '2.0.22']);
  assert(found.every(x => x.active.startsWith('unknown')));
  assert.doesNotMatch(JSON.stringify(found), /NEVER_EXECUTE|PRIVATE_FIXTURE/);
});
