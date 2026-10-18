import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countAgentRecords } from '../scripts/existing-install-preflight.mjs';

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
