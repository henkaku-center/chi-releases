import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guide = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
function example(marker) {
  const section = guide.split(`<!-- ${marker} -->`);
  assert.equal(section.length, 2, `exactly one ${marker}`);
  return JSON.parse(section[1].match(/^\s*```json\n([\s\S]*?)\n```/)[1]);
}

// Narrow schema fixture for the documented 1.0.0 choices subset, derived from
// chi-v1.0.0/packages/installer/src/plan.ts at public commit 88db5133. No network,
// auth, install or mutable latest dependency is needed by documentation CI.
function validate(value) {
  assert.deepEqual(Object.keys(value).sort(), ['autoUpdate', 'endpoint', 'linger', 'mappings', 'name', 'permissions']);
  const url = new URL(value.endpoint);
  assert.equal(url.protocol, 'https:');
  assert(!url.username && !url.password && !url.search && !url.hash);
  assert.equal(typeof value.name, 'string'); assert(value.name.trim());
  assert.equal(value.permissions, 'ask');
  assert.equal(typeof value.autoUpdate, 'boolean');
  assert.equal(typeof value.linger, 'boolean');
  assert(Array.isArray(value.mappings));
  const seen = new Set();
  for (const mapping of value.mappings) {
    assert.deepEqual(Object.keys(mapping).sort(), ['audience', 'repo']);
    assert.match(mapping.repo, /^github:[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/);
    assert(!['.', '..'].includes(mapping.repo.split('/')[1]));
    assert(!seen.has(mapping.repo)); seen.add(mapping.repo);
    assert(['private', 'shared'].includes(mapping.audience));
  }
  return value;
}

test('complete Henkaku JSON supplies the deployment base and explicit no-upload choices', () => {
  const choices = validate(example('henkaku-choices-1.0.0'));
  assert.equal(choices.endpoint, 'https://chi-backend-vadmp23swa-an.a.run.app');
  assert.equal(choices.name, 'Henkaku');
  assert.deepEqual(choices.mappings, []);
  assert.equal(choices.autoUpdate, false); assert.equal(choices.linger, false);
  assert.match(guide, /--choices "\$HOME\/chi-choices\.json" --dry-run/);
});

test('selected-project JSON composes into valid complete choices, with no wildcard or implicit audience', () => {
  const choices = example('henkaku-choices-1.0.0');
  choices.mappings = example('selected-project-mappings-1.0.0');
  validate(choices);
  for (const change of [
    c => { delete c.endpoint; },
    c => { c.permissions = 'allow'; },
    c => { c.autoUpdate = 'false'; },
    c => { c.mappings[0].repo = 'github:owner/*'; },
    c => { delete c.mappings[0].audience; },
    c => { c.mappings.push({ ...c.mappings[0] }); },
  ]) {
    const invalid = structuredClone(choices); change(invalid);
    assert.throws(() => validate(invalid));
  }
});
