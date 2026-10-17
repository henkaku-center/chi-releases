import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import serverPlugin from '../index.js';
import tuiPlugin from '../tui.js';
import { Participants, misconfiguredMessage } from '../rpc.js';

test('TUI forwards current location and cancellation to the authenticated server RPC', async () => {
  const signal = new AbortController().signal;
  const location = { directory: '/selected/repo' };
  const item = { id: 'github:person', value: 'Person', data: { ownerId: 'github:person' } };
  let provider;
  const remove = () => {};
  const cleanup = tuiPlugin.setup({
    client: { rpc(definition) { assert.equal(definition, Participants); return { async complete(input, options) {
      assert.deepEqual(input, { query: 'Pe' }); assert.equal(options.location, location); assert.equal(options.signal, signal); return [item];
    } }; } },
    prompt: { completions: { register(value) { provider = value; return remove; } } },
  });
  assert.equal(cleanup, remove);
  assert.deepEqual(await provider.complete({ query: 'Pe', location, signal }), [item]);
});

test('server entrypoint uses existing token exchange, repository authorization and bounded private errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chi-mentions-test-'));
  const previous = process.env.PATH;
  const calls = [];
  let denied = false;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    calls.push(request.url);
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/auth/token') {
      assert.deepEqual(JSON.parse(body), { githubToken: 'fixture-github' });
      response.end(JSON.stringify({ sessionToken: 'fixture-chi', chiUserId: 'github:sender' }));
      return;
    }
    assert.equal(request.url, '/api/participants');
    assert.equal(request.headers.authorization, 'Bearer fixture-chi');
    assert.equal(request.headers['x-chi-repo'], 'github:fixture/repo');
    if (denied) { response.writeHead(403); response.end('private diagnostic'); return; }
    response.end(JSON.stringify({ ok: true, self: 'github:sender', participants: [{ ownerId: 'github:person', handle: 'Person' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    execFileSync('git', ['init', '--quiet', directory]);
    execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', 'https://github.com/fixture/repo.git']);
    await writeFile(join(directory, 'gh'), '#!/bin/sh\nif [ "$1 $2" = "auth token" ]; then echo fixture-github; else exit 1; fi\n', { mode: 0o700 });
    process.env.PATH = directory + ':' + previous;
    let handler;
    await serverPlugin.setup({ options: { endpoint: `http://127.0.0.1:${server.address().port}/api` }, location: { directory }, rpc: { async register(definition, methods) { assert.equal(definition, Participants); handler = methods.complete; } } });
    const request = { signal: new AbortController().signal, error: (code, message, data) => ({ code, message, data }) };
    const [item] = await handler({ query: 'PE' }, request);
    assert.equal(item.data.ownerId, 'github:person');
    assert.equal(item.data.repo, 'github:fixture/repo');
    assert.equal(item.data.actor, 'github:sender');
    assert.deepEqual(calls, ['/api/auth/token', '/api/participants']);
    denied = true;
    assert.deepEqual(await handler({ query: 'pe' }, request), { code: 'unavailable', message: 'Chi participants unavailable', data: {} });
    assert.equal(calls.length, 4);
  } finally {
    process.env.PATH = previous;
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing, partial and malformed options register an inactive feature without acquiring authority', async () => {
  for (const options of [undefined, null, {}, { other: true }, { endpoint: null }, { endpoint: 1 }, { endpoint: '' }, { endpoint: ' ' }, { endpoint: 'not a url' }, { endpoint: 'https://user:secret@example.invalid' }, { endpoint: 'https://example.invalid?token=secret' }, { endpoint: 'file:///tmp/chi' }]) {
    let methods;
    await serverPlugin.setup({ options, rpc: { async register(definition, handlers) {
      // Include the required empty map, which the real loader enumerates.
      assert.deepEqual(Object.entries(definition.events), []);
      methods = handlers;
    } } }); // Deliberately no location/auth/HTTP capabilities in inactive setup.
    const status = await methods.status();
    assert.equal(status.state, 'inactive');
    assert.match(status.reason, /endpoint/);
    const result = await methods.complete({ query: 'sa' }, { error: (type, message, data) => ({ type, message, data }) });
    assert.deepEqual(result, { type: 'misconfigured', message: misconfiguredMessage, data: status });
    assert(!JSON.stringify(result).includes('secret'));
  }
});

test('TUI returns no candidates and shows one safe misconfiguration notice per location', async () => {
  let provider;
  const notices = [];
  tuiPlugin.setup({
    client: { rpc: () => ({ complete: async () => { throw { type: 'misconfigured', message: 'untrusted detail' }; } }) },
    prompt: { completions: { register(value) { provider = value; return () => {}; } } },
    ui: { toast: { show(value) { notices.push(value); } } },
  });
  const request = { query: 'pe', location: { directory: '/repo' }, signal: new AbortController().signal };
  assert.deepEqual(await provider.complete(request), []);
  assert.deepEqual(await provider.complete({ ...request, query: 'per' }), []);
  assert.deepEqual(notices, [{ message: misconfiguredMessage, variant: 'warning' }]);
  const controller = new AbortController(); controller.abort();
  await provider.complete({ ...request, signal: controller.signal, location: { directory: '/other' } });
  assert.equal(notices.length, 1);
});
