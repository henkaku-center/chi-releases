import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('real transfer rehearsal refuses CI and implicit runtime discovery', () => {
  const script = fileURLToPath(new URL('../scripts/native-transfer-rehearsal.mjs', import.meta.url));
  const ci = spawnSync(process.execPath, [script], { env: { CI: '1' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(ci.status, 1); assert.match(ci.stderr, /Explicit local synthetic runtime gate/);
  const missing = spawnSync(process.execPath, [script], { env: {}, encoding: 'utf8', timeout: 10000 });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /Usage: node scripts\/native-transfer-rehearsal/);
});
