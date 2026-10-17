// Explicit, isolated installed-runtime acceptance. Never discovers or starts a user's service.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { isAppendRuntime } from '@henkaku-center/chi-native/append-client';

const [binaryArg, pluginArg, rootArg, mode] = process.argv.slice(2);
assert(!process.env.CI, 'installed-runtime acceptance refuses CI');
assert(binaryArg && pluginArg && rootArg, 'usage: node test/runtime-loader.mjs BINARY PLUGIN OUTPUT [reproduce]');
const binary = resolve(binaryArg), plugin = resolve(pluginArg), root = resolve(rootArg);
await mkdir(root, { mode: 0o700 }); // Refuse to reuse an existing profile.
const report = { version: null, cases: [] };
const requests = [];
const authority = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push(req.url);
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/auth/token') {
    assert.deepEqual(JSON.parse(body), { githubToken: 'fixture-github' });
    res.end(JSON.stringify({ sessionToken: 'fixture-chi', chiUserId: 'github:sender' }));
    return;
  }
  assert.equal(req.url, '/api/participants');
  assert.equal(req.headers.authorization, 'Bearer fixture-chi');
  assert.equal(req.headers['x-chi-repo'], 'github:fixture/repo');
  res.end(JSON.stringify({ ok: true, self: 'github:sender', participants: [{ ownerId: 'github:person', handle: 'Person' }] }));
});
await new Promise(r => authority.listen(0, '127.0.0.1', r));
const localEndpoint = `http://127.0.0.1:${authority.address().port}/api`;
const cases = [
  ['production-options', { package: plugin, options: { endpoint: 'https://chi-backend-vadmp23swa-an.a.run.app' } }, 'ready'],
  ['object-no-options', { package: plugin }, 'inactive'],
  ['string-no-options', plugin, 'inactive'],
  ...(mode === 'reproduce' ? [] : [
    ['empty-options', { package: plugin, options: {} }, 'inactive'],
    ['partial-options', { package: plugin, options: { unrelated: true } }, 'inactive'],
    ['null-endpoint', { package: plugin, options: { endpoint: null } }, 'inactive'],
    ['empty-endpoint', { package: plugin, options: { endpoint: ' ' } }, 'inactive'],
    ['invalid-endpoint', { package: plugin, options: { endpoint: 'not a URL' } }, 'inactive'],
    ['credential-endpoint', { package: plugin, options: { endpoint: 'https://user:secret@example.invalid' } }, 'inactive'],
    ['synthetic-directory', { package: plugin, options: { endpoint: localEndpoint } }, 'ready'],
  ]),
];

try {
  for (const [name, entry, expected] of cases) {
    const home = `${root}/${name}`;
    for (const part of ['home', 'config/opencode', 'data', 'state', 'cache', 'repo', 'tmp', 'bin']) await mkdir(`${home}/${part}`, { recursive: true, mode: 0o700 });
    const env = { PATH: `${home}/bin:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: `${home}/home`, XDG_CONFIG_HOME: `${home}/config`, XDG_DATA_HOME: `${home}/data`, XDG_STATE_HOME: `${home}/state`, XDG_CACHE_HOME: `${home}/cache`, TMPDIR: `${home}/tmp`, SHELL: '/bin/sh' };
    execFileSync('git', ['init', '--quiet', `${home}/repo`], { env });
    execFileSync('git', ['-C', `${home}/repo`, 'remote', 'add', 'origin', 'https://github.com/fixture/repo.git'], { env });
    await writeFile(`${home}/bin/gh`, '#!/bin/sh\necho used > "$HOME/credential-read"\nprintf fixture-github\n', { mode: 0o700 });
    await writeFile(`${home}/config/opencode/opencode.jsonc`, JSON.stringify({ plugins: [entry] }), { mode: 0o600 });
    const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: `${home}/repo`, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', origin, authorization;
    child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    const api = async (path, body) => {
      const url = new URL(path, origin);
      url.searchParams.set('location[directory]', `${home}/repo`);
      const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { authorization, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      return { status: response.status, body: await response.json() };
    };
    try {
      for (let n = 0; n < 300; n++) {
        origin = output.match(/server listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
        const password = output.match(/server password (\S+)/)?.[1];
        if (origin && password) { authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`; break; }
        assert.equal(child.exitCode, null, 'isolated server exited'); await delay(100);
      }
      assert(origin && authorization, 'isolated server startup timeout');
      const info = await api('/api/info');
      report.version = info.body.version;
      assert.equal(isAppendRuntime(report.version), true, 'unverified native runtime');
      // A real session admission loads location plugins without invoking a model.
      const session = await api('/api/session', { location: { directory: `${home}/repo` }, title: 'Isolated plugin loader regression' });
      assert.equal(session.status, 200);
      let loaded;
      for (let n = 0; n < 200; n++) {
        const result = await api('/api/plugin');
        loaded = result.body.data?.find(p => p.id === 'chi.mentions');
        if (loaded && ['active', 'failed'].includes(loaded.state?.status)) break;
        await delay(100);
      }
      assert(loaded, `plugin did not settle: ${name}`);
      const row = { name, loader: loaded.state };
      if (mode === 'reproduce') {
        assert.equal(loaded.state.status, 'failed');
        if (expected === 'ready') assert.match(loaded.state.error, /Object.entries/);
      } else {
        assert.equal(loaded.state.status, 'active', JSON.stringify(loaded.state));
        const status = await api('/api/rpc/chi.participants/status', { input: {} });
        assert.equal(status.status, 200, JSON.stringify(status.body));
        row.feature = status.body.output;
        assert.equal(row.feature.state, expected);
        if (expected === 'inactive') {
          const completion = await api('/api/rpc/chi.participants/complete', { input: { query: 'Pe' } });
          assert.equal(completion.status, 400);
          assert.equal(completion.body.type, 'misconfigured');
          assert.match(completion.body.message, /options.endpoint/);
          assert.equal(requests.length, 0);
        }
        if (name === 'synthetic-directory') {
          const completion = await api('/api/rpc/chi.participants/complete', { input: { query: 'PE' } });
          assert.equal(completion.status, 200, JSON.stringify(completion.body));
          assert.equal(completion.body.output[0].data.ownerId, 'github:person');
          assert.deepEqual(requests, ['/api/auth/token', '/api/participants']);
          row.exactRecipient = completion.body.output[0].data.ownerId;
        }
      }
      if (name !== 'synthetic-directory') await assert.rejects(access(`${home}/home/credential-read`));
      report.cases.push(row);
      await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
      console.log(`PASS ${name}: ${loaded.state.status}${row.feature ? '/' + row.feature.state : ''}`);
    } finally {
      // Only this test-owned process group; never a discovered user service.
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise(r => child.once('exit', r));
        process.kill(-child.pid, 'SIGTERM');
        const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGKILL'); }, 5000);
        await exited; clearTimeout(timer);
      }
    }
  }
} finally {
  authority.closeAllConnections();
  await new Promise(r => authority.close(r));
}
