import { test } from 'node:test';
import assert from 'node:assert/strict';
import { participantSource } from '../source.js';

function fixture() {
  const state = { actor: 'github:sender', repo: 'github:team/repo', denied: false, calls: [], people: [{ ownerId: 'github:sava-the-owl', handle: 'Sava-the-Owl' }, { ownerId: 'github:mochi', handle: 'mochi' }] };
  const complete = participantSource({ endpoint: 'https://chi.example/api', directory: '/repo',
    repository: async directory => { assert.equal(directory, '/repo'); return state.repo; },
    login: async () => ({ chiUserId: state.actor }),
    participants: async ({ repo, identity }) => { state.calls.push({ repo, actor: identity.chiUserId }); if (state.denied) throw new Error('denied'); return { ok: true, self: state.actor, participants: state.people }; },
  });
  const query = value => complete({ query: value, signal: new AbortController().signal });
  return { state, complete, query };
}
test('case-insensitive prefix and exact recipient/context metadata', async () => {
  const f = fixture();
  const [item] = await f.query('SA');
  assert.equal(item.value, 'Sava-the-Owl');
  assert.equal(item.id, 'github:sava-the-owl');
  assert.deepEqual(item.data, { ownerId: 'github:sava-the-owl', handle: 'Sava-the-Owl', actor: 'github:sender', repo: 'github:team/repo', endpoint: 'https://chi.example/api' });
  assert.deepEqual(await f.query('owl'), []);
});
test('authorization and context changes never reuse protected results', async () => {
  const f = fixture();
  await f.query('sa'); f.state.denied = true;
  await assert.rejects(f.query('sa'), /denied/);
  f.state.denied = false; f.state.repo = 'github:other/repo'; f.state.actor = 'github:other';
  const [item] = await f.query('sa');
  assert.equal(item.data.repo, 'github:other/repo'); assert.equal(item.data.actor, 'github:other');
  assert.equal(f.state.calls.length, 3);
});
test('invalid/conflicting participant data fails and cancellation prevents acquisition', async () => {
  const f = fixture();
  f.state.people.push({ ownerId: 'github:sava-the-owl', handle: 'different' });
  await assert.rejects(f.query(''), /Conflicting/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.complete({ query: 'sa', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.state.calls.length, 1);
});
