import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, readFile, writeFile, symlink, link, readdir, stat, chmod, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify as verifySignature } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPlan, parseChoices, hostFrom, assertNodeFloor } from '../dist/plan.js';
import { Owned, regular, digest } from '../dist/files.js';
import { install, uninstall, update, autoUpdate, pair, storedPlan, reconfigure } from '../dist/install.js';
import { tarFiles, verify, cleanEnvironment, system, CommandFailure, installTools } from '../dist/system.js';
import { registryKeys, verifyRegistry, verifyProvenance, attestationURL } from '../dist/registry.js';
import { provenance, provenanceURL, predicateType } from './provenance.mjs';
import { trustRoot, verifyBundle } from '../dist/sigstore.js';
import { releaseCheck } from '../scripts/release-check.mjs';
import { configFiles, launcher, services } from '../dist/config.js';
import { web, artifacts as pinnedArtifacts } from '../dist/pins.js';
import { plugin } from '../dist/plugin.js';

const choices = { endpoint: 'https://chi.example/api', name: 'Chosen', mappings: [{ repo: 'github:owner/repo', audience: 'private' }], permissions: 'ask', autoUpdate: true, linger: true };
// Synthetic signing authority exists only in this test process, never in a plan,
// environment option, downloaded metadata or the production key manifest.
const signing = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const testKey = { keyid: 'test-only-key', key: signing.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
registryKeys.push(testKey);
const tarball = 'https://registry.npmjs.org/@henkaku-center/chi/-/chi-1.0.1.tgz';
function metadata(bytes, changes = {}) {
  const value = { name: '@henkaku-center/chi', version: '1.0.1', dist: { tarball, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), attestations: { url: provenanceURL, provenance: { predicateType } }, ...changes } };
  value.dist.signatures = [{ keyid: testKey.keyid, sig: sign('sha256', Buffer.from(`${value.name}@${value.version}:${value.dist.integrity}`), signing.privateKey).toString('base64') }];
  return value;
}
function archive(entries) {
  const chunks = [];
  for (const [name, value, type = '0', mode = '0000700'] of entries) {
    const content = Buffer.from(value), header = Buffer.alloc(512);
    header.write(name); header.write(mode + '\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header.write(type, 156); header.write('ustar\0', 257);
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
async function fixture(platform = process.platform, arch = 'arm64') {
  const home = await mkdtemp(join(tmpdir(), 'case-'));
  const host = hostFrom({ HOME: home }, platform, arch);
  const plan = createPlan(choices, host), calls = [], downloads = new Map();
  let fail, status = { home: join(plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'reachable', daemonVersion: 'fixture', serverId: 'owned', workerPid: 100 }, linger = 'no';
  const loadedServices = new Set();
  for (const [name, artifact] of Object.entries(plan.artifacts)) {
    const entries = [[artifact.member, `binary:${name}`]];
    if (name === 'node') entries.push([artifact.member.replace('bin/node', 'lib/node_modules/npm/bin/npm-cli.js'), 'npm']);
    const bytes = archive(entries); artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
    downloads.set(artifact.url, bytes);
  }
  const io = {
    sleep: async () => {},
    download: async url => {
      calls.push({ download: url });
      if (url === provenanceURL && !downloads.has(url)) return Buffer.from(JSON.stringify(await provenance(JSON.parse(downloads.get('https://registry.npmjs.org/@henkaku-center%2fchi/latest')))));
      if (!downloads.has(url)) throw new Error('unexpected download'); return downloads.get(url);
    },
    run: async input => {
      calls.push(input);
      if (fail?.(input)) throw new Error('injected failure');
      const { command, args, cwd } = input;
      if (command === 'git' && args[0] === 'clone') {
        await mkdir(args.at(-1), { recursive: true });
        if (args.at(-1).endsWith('/paseo')) {
          await mkdir(join(args.at(-1), 'packages/server'), { recursive: true });
          await writeFile(join(args.at(-1), 'packages/server/package.json'), '{"version":"fixture","type":"module"}');
          await mkdir(join(args.at(-1), 'vendor'), { recursive: true });
          await writeFile(join(args.at(-1), 'vendor/henkaku-center-chi-native-0.0.0.tgz'), 'fixture-native-helper', { mode: 0o600 });
        }
      }
      if (command === 'git' && args[0] === 'checkout') await writeFile(join(cwd, '.fixture-commit'), args.at(-1));
      if (command === 'git' && args[0] === 'rev-parse') return await readFile(join(cwd, '.fixture-commit'));
      if (command === 'unzip') return Buffer.from('binary:gh');
      if (args[0] === '--version' || args[0] === 'version') {
        return Buffer.from(command.endsWith('opencode') ? plan.pins.opencode.version : Object.entries(plan.artifacts).find(([name]) => command.endsWith('/' + name))[1].version);
      }
      if (command === 'bun' && args[0] === 'run') {
        const path = join(cwd, `packages/cli/dist/cli-${platform}-${arch}/bin/opencode`);
        await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, 'opencode'); await chmod(path, 0o700);
      }
      if (args.includes('pack')) return Buffer.from('[{"filename":"plugin.tgz"}]');
      if (args.includes('build:server:clean')) {
        const worker = join(cwd, 'packages/server/dist/server/server/daemon-worker.js');
        await mkdir(join(worker, '..'), { recursive: true }); await writeFile(worker, '// fixture worker');
      }
      if (command === 'launchctl' && args[0] === 'print' && !loadedServices.has(args[1])) throw new CommandFailure('launchctl', 113);
      if (command === 'launchctl' && args[0] === 'bootstrap') loadedServices.add(`${args[1]}/${args[2].split('/').at(-1).replace('.plist', '')}`);
      if (command === 'launchctl' && args[0] === 'bootout') loadedServices.delete(args[1]);
      if (command === 'loginctl' && args[0] === 'show-user') return Buffer.from(linger);
      if (command === 'loginctl' && args[0] === 'enable-linger') linger = 'yes';
      if (args.includes('restart')) status.workerPid++;
      if (args.includes('service') && args.includes('status')) return Buffer.from('http://127.0.0.1:1234');
      if (args.includes('/api/info')) return Buffer.from(JSON.stringify({ version: plan.pins.opencode.version, pid: 200 }));
      if (args.includes('status') && args.includes('--json')) return Buffer.from(JSON.stringify(status));
      return Buffer.from('');
    },
  };
  const options = { io, env: { HOME: home, PATH: '/usr/bin:/bin', PASEO_AGENT_ID: 'forbidden', OPENCODE_CONFIG_CONTENT: 'forbidden', GH_TOKEN: 'synthetic-secret' }, confirmed: true };
  return { home, plan, calls, downloads, io, options, fail: f => { fail = f; }, status: value => { status = value; } };
}

test('dry run and declined consent create no files, child processes or downloads', async () => {
  const f = await fixture();
  const before = await readdir(f.home);
  for (const action of [install, update, uninstall, autoUpdate, pair]) await action(f.plan, { ...f.options, dryRun: true });
  assert.deepEqual(await readdir(f.home), before);
  assert.deepEqual(f.calls, []);
  await assert.rejects(install(f.plan, { ...f.options, confirmed: false }), /Confirm/);
  assert.deepEqual(await readdir(f.home), before);
});

test('fresh build embeds its pinned plugin and fetches only public forks without inherited credentials', async () => {
  const f = await fixture();
  await install(f.plan, f.options);
  const clones = f.calls.filter(c => c.command === 'git' && c.args[0] === 'clone');
  assert.deepEqual(clones.map(c => c.args[2]), [`https://github.com/${f.plan.pins.paseo.repository}.git`, `https://github.com/${f.plan.pins.opencode.repository}.git`]);
  for (const { env } of clones) {
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK', 'GIT_ASKPASS', 'NODE_OPTIONS', 'NPM_TOKEN']) assert.equal(env[key], undefined);
    assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null'); assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(env.GIT_CONFIG_KEY_0, 'credential.helper'); assert.equal(env.GIT_CONFIG_VALUE_0, '');
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(env.npm_config_registry, 'https://registry.npmjs.org');
    assert.ok(env.npm_config_globalconfig.startsWith(f.plan.root));
  }
  assert.ok(f.calls.some(c => c.cwd?.endsWith('/plugin') && c.args?.includes('ci') && c.args.includes('--ignore-scripts')));
  for (const [name, text] of Object.entries(plugin.files)) assert.equal(await readFile(join(f.plan.root, 'runtime/plugin', name), 'utf8'), text);
  assert.ok(configFiles(f.plan)[join(f.plan.root, 'config/opencode/opencode.json')].includes(join(f.plan.root, 'runtime/plugin')));
});

test('unavailable recorded plugin sources refuse before cloning instead of accessing private Chi or relabeling bytes', async () => {
  const f = await fixture(); const changed = structuredClone(f.plan); changed.pins.chi.commit = 'a'.repeat(40);
  await assert.rejects(install(changed, f.options), /Bundled plugin does not match/);
  assert.equal(f.calls.filter(c => c.command === 'git' && c.args[0] === 'clone').length, 0);
  assert.equal(f.calls.filter(c => ['launchctl', 'systemctl'].includes(c.command) && c.args.includes('bootstrap')).length, 0);
});

test('bundled plugin payload corruption fails before any source checkout', async () => {
  const f = await fixture(); const original = plugin.files['index.js'];
  try {
    plugin.files['index.js'] += '\n// altered payload';
    await assert.rejects(install(f.plan, f.options), /payload integrity mismatch/);
    assert.equal(f.calls.filter(c => c.command === 'git' && c.args[0] === 'clone').length, 0);
  } finally { plugin.files['index.js'] = original; }
});

test('invalid destinations, missing audiences, duplicates and bot injection fail admission', () => {
  for (const endpoint of ['', 'http://outside.test', 'https://user:pass@chi.test', 'https://chi.test/?secret=1', 'https://chi.test/#x', 'file:///etc/passwd', 'https://chi.test/%2f..']) assert.throws(() => parseChoices({ ...choices, endpoint }));
  for (const mappings of [undefined, [{ repo: 'github:owner/repo' }], [choices.mappings[0], choices.mappings[0]], [{ repo: 'github:owner/..', audience: 'private' }]]) assert.throws(() => parseChoices({ ...choices, mappings }));
  assert.throws(() => parseChoices({ ...choices, permissions: 'allow' }));
  assert.throws(() => parseChoices({ ...choices, bots: { selected: 'build', identities: { build: { name: 'Bot\nINJECT=1', email: 'bot@example.test' } } } }));
  assert.deepEqual(parseChoices({ ...choices, mappings: [] }).mappings, []);
});

test('hosted relay origin becomes the pinned daemon host-port/TLS contract without changing origins', async () => {
  const f = await fixture();
  const config = plan => JSON.parse(configFiles(plan)[join(plan.root, 'state/paseo/config.json')]);
  assert.deepEqual(config(f.plan).daemon.relay, { enabled: true, endpoint: 'relay.paseo.sh:443', useTls: true });
  for (const [url, endpoint, useTls] of [['wss://relay.example:8443', 'relay.example:8443', true], ['ws://127.0.0.1:12345', '127.0.0.1:12345', false], ['wss://[::1]:8443', '[::1]:8443', true]]) {
    const plan = structuredClone(f.plan); plan.web.relayUrl = url;
    assert.deepEqual(config(plan).daemon.relay, { enabled: true, endpoint, useTls });
  }
  for (const url of ['https://relay.example', 'wss://user:secret@relay.example', 'wss://relay.example/path', 'wss://relay.example?token=x']) {
    const plan = structuredClone(f.plan); plan.web.relayUrl = url; assert.throws(() => config(plan), /relay origin/);
  }
});

test('Node floor refuses runtimes below the bundled verifier contract', () => {
  for (const version of ['22.22.2', '22.23.0', '24.15.0', '24.18.0', '26.0.0', '27.1.0']) assert.doesNotThrow(() => assertNodeFloor(version));
  for (const version of ['18.20.8', '20.19.5', '22.21.9', '22.22.1', '23.0.0', '24.14.9', '25.0.0', 'unparseable']) assert.throws(() => assertNodeFloor(version), /requires Node\.js/);
});

test('bot roles are generated only for explicit supported identities, with project-scoped review policy', async () => {
  const f = await fixture();
  assert.equal(Object.keys(configFiles(f.plan)).filter(p => p.includes('/agents/')).length, 0);
  const plain = configFiles(f.plan)[join(f.plan.root, 'config/opencode/AGENTS.md')];
  assert.match(plain, /root, named-role and native-child/);
  assert.match(plain, /missing binding rather than inventing/);
  assert.doesNotMatch(plain, /default agent commit identity/);
  const identities = {
    builder: { name: 'Builder Bot', email: 'builder@example.test' },
    reviewer: { name: 'Reviewer Bot', email: 'reviewer@example.test' },
    research: { name: 'Research Bot', email: 'research@example.test' },
  };
  for (const selected of ['builder', 'reviewer', 'research']) {
    const plan = createPlan({ ...choices, bots: { selected, identities } }, f.plan.host);
    const files = configFiles(plan);
    const workflow = files[join(plan.root, 'config/opencode/AGENTS.md')];
    assert.ok(workflow.includes(identities[selected].email));
    for (const boundary of ['Never run gh auth switch/login/logout', 'protected branch',
      'existing linked child tools', 'independent exit/stall', 'Lead with the request',
      'same turn', 'Run git status', 'workflow-v1', 'packages/installer/src/config.ts']) assert.ok(workflow.includes(boundary));
    assert.doesNotMatch(workflow, /two-person|critical\/high|\/Users\/|\/home\/|gszep|mochi-the-kitty|sava-the-owl/);
    assert.equal(Object.keys(files).filter(p => p.includes('/agents/')).length, 2);
    for (const role of ['builder', 'reviewer']) {
      const text = files[join(plan.root, `config/opencode/agents/${role}.md`)];
      assert.match(text, /^---\ndescription: [^\n]+\nmode: all\n---\n/);
      assert.ok(text.includes(identities[role].email));
      assert.ok(!text.includes(identities[role === 'builder' ? 'reviewer' : 'builder'].email));
      for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) assert.ok(text.includes(key));
      assert.match(text, /inherited environment may name a different role/);
      assert.match(text, /generated ambient runtime workflow/);
      assert.doesNotMatch(text, /Never run gh auth|linked child tools/, 'shared policy is not duplicated per role');
      assert.match(text, /actual provider\/model/);
      assert.match(text, /actual session ID/);
      assert.doesNotMatch(text, /two-person|critical\/high|push it to `main`|\/Users\/|\/home\/|gszep|mochi-the-kitty|sava-the-owl/);
    }
  }
});

for (const platform of ['darwin', 'linux']) test(`${platform}: roles use existing owned writes, reruns and conservative uninstall`, async () => {
  const f = await fixture(platform);
  f.plan.choices.bots = { selected: 'builder', identities: {
    builder: { name: 'Builder Bot', email: 'builder@example.test' },
    reviewer: { name: 'Reviewer Bot', email: 'reviewer@example.test' },
  } };
  const personal = join(f.home, '.config/opencode/agents/reviewer.md');
  await mkdir(join(personal, '..'), { recursive: true }); await writeFile(personal, 'personal role');
  await install(f.plan, f.options);
  const paths = ['builder', 'reviewer'].map(role => join(f.plan.root, `config/opencode/agents/${role}.md`));
  paths.push(join(f.plan.root, 'config/opencode/AGENTS.md'));
  for (const path of paths) assert.equal(await readFile(path, 'utf8'), configFiles(f.plan)[path]);
  assert.equal((await install(f.plan, f.options)).status, 'already-installed');
  await writeFile(paths[1], 'edited owned role');
  const result = await uninstall(f.plan, f.options);
  assert.ok(result.retained.includes(paths[1]));
  assert.equal(await regular(paths[0]), null);
  assert.equal(await readFile(paths[1], 'utf8'), 'edited owned role');
  assert.equal(await readFile(personal, 'utf8'), 'personal role');
});

test('CLI refuses to start below the Node floor before parsing arguments', async () => {
  const home = await mkdtemp(join(tmpdir(), 'node-floor-'));
  const loader = join(home, 'loader.mjs'), cli = new URL('../dist/cli.js', import.meta.url).href;
  for (const [version, refused] of [['18.20.8', true], ['22.22.1', true], ['25.0.0', true], ['22.22.2', false], ['24.15.0', false]]) {
    await writeFile(loader, `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)}, configurable: true });\nawait import(${JSON.stringify(cli)});\n`);
    const result = spawnSync(process.execPath, [loader, '--help'], { env: { HOME: home, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
    if (refused) { assert.equal(result.status, 1, `${version}: ${result.stdout}`); assert.match(result.stderr, /requires Node\.js/); }
    else { assert.equal(result.status, 0, `${version}: ${result.stderr}`); assert.match(result.stdout, /chi \[install/); }
  }
});

test('CLI entry point has no static imports so the Node floor runs before any newer builtin loads', async () => {
  const entry = await readFile(new URL('../dist/cli.js', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /^\s*import\s/m, 'a static import would load before the floor check on an unsupported runtime');
  assert.doesNotMatch(entry, /from\s+['"]node:readline\/promises['"]/, 'the entry point must not import newer builtins before the floor check');
  assert.match(entry, /assertNodeFloor\(\);/);
  assert.match(entry, /await import\(/);
});

test('the embedded Node runtime pin satisfies the CLI Node floor', () => {
  for (const platform of ['darwin', 'linux']) for (const arch of ['arm64', 'x64']) {
    assert.doesNotThrow(() => assertNodeFloor(pinnedArtifacts(platform, arch).node.version), `${platform}-${arch} pin must satisfy the floor`);
  }
});

for (const platform of ['darwin', 'linux']) test(`${platform}: owned install reruns once, scopes tools/config, pairs privately and uninstalls conservatively`, async () => {
  const f = await fixture(platform);
  const sentinel = join(f.home, '.config/opencode/opencode.json');
  await mkdir(join(sentinel, '..'), { recursive: true }); await writeFile(sentinel, 'personal');
  const result = await install(f.plan, f.options);
  assert.equal(result.status, 'installed-awaiting-pairing');
  const opencode = JSON.parse(await readFile(join(f.plan.root, 'config/opencode/opencode.json')));
  assert.equal(opencode.plugins.length, 1); assert.equal(opencode.plugins[0].options.endpoint, choices.endpoint);
  assert.deepEqual(opencode.permissions, [{ action: '*', resource: '*', effect: 'ask' }]);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'config/opencode/cli.json'))).plugins.length, 1);
  const paseo = JSON.parse(await readFile(join(f.plan.root, 'state/paseo/config.json')));
  assert.deepEqual(paseo.chi.mappings, [{ ...choices.mappings[0], destination: 'chosen' }]);
  assert.deepEqual(paseo.daemon.cors.allowedOrigins, ['https://chi.henkaku.center']);
  const count = f.calls.length;
  assert.equal((await install(f.plan, f.options)).status, 'already-installed');
  assert.ok(f.calls.slice(count).every(c => c.args.includes('status') || c.args.includes('/api/info') || c.args.includes('rev-parse') || c.args.includes('--version') || c.args.includes('version')));
  assert.equal(await readFile(sentinel, 'utf8'), 'personal');
  for (const call of f.calls.filter(c => c.command)) {
    assert.equal(call.env.PASEO_AGENT_ID, undefined); assert.equal(call.env.OPENCODE_CONFIG_CONTENT, undefined);
    if (call.command === 'git' && !call.cwd.includes('/runtime/')) { assert.equal(call.env.GH_TOKEN, undefined); assert.equal(call.env.HOME, join(f.plan.root, 'build-home')); }
    assert.ok(!call.args.includes('--force')); assert.ok(!call.args.includes('login'));
  }
  await pair(f.plan, f.options);
  assert.equal(f.calls.at(-1).inherit, true);
  const edited = join(f.plan.root, 'config/opencode/cli.json'); await writeFile(edited, 'user edited');
  const removed = await uninstall(f.plan, f.options);
  assert.equal(removed.status, 'uninstalled'); assert.ok(removed.retained.includes(edited));
  assert.equal(await readFile(edited, 'utf8'), 'user edited');
  assert.equal(await readFile(sentinel, 'utf8'), 'personal');
  assert.ok(await stat(join(f.plan.root, 'state/paseo/config.json')));
  assert.ok(!f.calls.some(c => c.command === 'loginctl' && c.args[0] === 'disable-linger'));
});

test('checksum failure never executes a downloaded binary or creates configuration', async () => {
  const f = await fixture(); f.plan.artifacts.node.sha256 = 'a'.repeat(64);
  await assert.rejects(install(f.plan, f.options), /checksum/);
  assert.equal(f.calls.filter(c => c.command).length, 0);
  assert.equal(await regular(join(f.plan.root, 'config/opencode/opencode.json')), null);
});

test('archive traversal, duplicates, header corruption and special files cannot escape', () => {
  for (const entries of [[['../escape', 'x']], [['/escape', 'x']], [['a/../escape', 'x']], [['a', 'x'], ['a', 'y']], [['device', '', '3']]]) assert.throws(() => tarFiles(archive(entries)));
  const bytes = archive([['link', '/outside', '2'], ['safe', 'ok']]);
  assert.deepEqual([...tarFiles(bytes).keys()], ['safe']);
  assert.throws(() => verify(bytes, '0'.repeat(64)), /checksum/);
  const corrupt = gunzipSync(archive([['safe', 'ok']])); corrupt[0] ^= 1;
  assert.throws(() => tarFiles(gzipSync(corrupt)), /header/);
});

test('foreign files, symlink directories/targets and hardlinks are never overwritten', async () => {
  const f = await fixture(), outside = join(f.home, 'outside'); await mkdir(outside);
  await mkdir(f.plan.root, { recursive: true, mode: 0o700 });
  await assert.rejects(Owned.load(f.plan, true), /adopt/);
  const g = await fixture(), owned = await Owned.load(g.plan, true);
  const target = join(g.plan.root, 'config/value');
  await symlink(outside, join(g.plan.root, 'config'));
  await assert.rejects(owned.write(target, 'bad'), /Unsafe directory/);
  assert.deepEqual(await readdir(outside), []);
  await writeFile(join(outside, 'personal'), 'keep');
  await symlink(join(outside, 'personal'), join(g.plan.root, 'link'));
  await assert.rejects(owned.write(join(g.plan.root, 'link'), 'bad'), /Unsafe owned file/);
  await link(join(outside, 'personal'), join(g.plan.root, 'hardlink'));
  await assert.rejects(owned.write(join(g.plan.root, 'hardlink'), 'bad'), /Unsafe owned file/);
  assert.equal(await readFile(join(outside, 'personal'), 'utf8'), 'keep');
});

test('forged journal paths and host cannot authorize writes/deletes elsewhere', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true);
  owned.journal.files['/etc/should-never-be-touched'] = 'a'.repeat(64);
  await assert.rejects(owned.verify(), /Unsafe ownership journal/);
  owned.journal.plan.host.home = '/another-home'; await owned.save();
  const fresh = createPlan(choices, hostFrom({ HOME: f.home }, f.plan.host.platform, 'arm64'));
  await assert.rejects(Owned.load(fresh, false), /host mismatch/);
});

test('exclusive lock refuses concurrent installation work', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true);
  await owned.lock(async () => assert.rejects(owned.lock(async () => {}), /Another install/));
});

test('missing gh login and failed builds never activate services', async () => {
  for (const point of ['auth', 'build:server:clean']) {
    const f = await fixture(); f.fail(call => call.args.includes(point));
    await assert.rejects(install(f.plan, f.options), /injected|login required/);
    assert.ok(!f.calls.some(c => c.command === 'launchctl' || c.command === 'systemctl'));
  }
});

test('update builds before activation, restarts with wait-idle and restores the old tree on failure', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const old = await readFile(join(f.plan.root, 'ownership.json'), 'utf8');
  const next = structuredClone(f.plan); next.pins.paseo.commit = '1'.repeat(40);
  let failed = false;
  f.fail(call => { if (call.args.includes('restart') && !failed) { failed = true; return true; } return false; });
  await assert.rejects(update(next, f.options), /injected/);
  const restored = JSON.parse(await readFile(join(f.plan.root, 'ownership.json')));
  assert.equal(restored.plan.pins.paseo.commit, JSON.parse(old).plan.pins.paseo.commit);
  assert.deepEqual(restored.built, JSON.parse(old).built);
  assert.equal(restored.pending, undefined); assert.equal(restored.previous, undefined);
  assert.ok(await stat(join(f.plan.root, 'runtime/opencode-bin')));
  assert.ok(f.calls.some(c => c.args?.includes('restart') && c.args.includes('--wait-idle') && !c.args.includes('--force')));
});

test('auto-update rejects a bad integrity before invoking new code and never chooses retired versions', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const registry = 'https://registry.npmjs.org/@henkaku-center%2fchi/latest';
  f.downloads.set(registry, Buffer.from(JSON.stringify({ name: '@henkaku-center/chi', version: '0.9.9' })));
  assert.equal((await autoUpdate(f.plan, f.options)).status, 'no-approved-release');
  f.downloads.set(registry, Buffer.from(JSON.stringify(metadata(Buffer.from('good')))));
  f.downloads.set(tarball, Buffer.from('malicious'));
  const count = f.calls.length;
  await assert.rejects(autoUpdate(f.plan, f.options), /integrity/);
  assert.equal(f.calls.slice(count).filter(c => c.command).length, 0);
});

test('bot authorship is argv-safe and generated service syntax escapes paths', async () => {
  const f = await fixture('darwin');
  const plan = createPlan({ ...choices, bots: { selected: 'build', identities: { build: { name: 'A "quoted" bot', email: 'bot@example.test' } } } }, f.plan.host);
  const script = launcher(plan);
  assert.ok(script.includes('GIT_AUTHOR_NAME')); assert.ok(!script.includes('auth switch'));
  const path = join(f.home, 'launcher.mjs'); await writeFile(path, script);
  execFileSync(process.execPath, ['--check', path]);
  assert.ok(Object.values(services(plan)).every(text => text.includes('<plist')));
  const files = configFiles(plan);
  assert.deepEqual(JSON.parse(files[join(plan.root, 'config/bot-identities.json')]), plan.choices.bots);
  const env = cleanEnvironment(plan, { PATH: '/bin', PASEO_HOME: '/foreign', OPENCODE_CONFIG: '/personal', NODE_OPTIONS: '--require=bad' });
  assert.equal(env.PASEO_HOME, undefined); assert.equal(env.OPENCODE_CONFIG, undefined); assert.equal(env.NODE_OPTIONS, undefined);
});

test('health failure leaves installation incomplete and same-plan retry resumes without rebuilding', async () => {
  const f = await fixture();
  f.status({ home: join(f.plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'unreachable', daemonVersion: 'fixture', workerPid: 100 });
  await assert.rejects(install(f.plan, f.options), /health/);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).phase, 'building');
  assert.ok(!f.calls.some(c => c.args?.includes('pair')));
  const before = f.calls.length;
  f.status({ home: join(f.plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'reachable', daemonVersion: 'fixture', workerPid: 100 });
  assert.equal((await install(f.plan, f.options)).status, 'installed-awaiting-pairing');
  assert.ok(!f.calls.slice(before).some(c => c.command === 'bun' || c.args?.includes('clone')));
});

test('healthy-looking wrong daemon version/home and stopped OpenCode cannot offer pairing', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  for (const changes of [{ daemonVersion: 'wrong' }, { home: '/foreign' }, { workerPid: null }, { note: 'RPC timeout' }]) {
    f.status({ home: join(f.plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'reachable', daemonVersion: 'fixture', workerPid: 100, ...changes });
    await assert.rejects(pair(f.plan, f.options), /health/);
  }
  f.status({ home: join(f.plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'reachable', daemonVersion: 'fixture', workerPid: 100 });
  const run = f.io.run;
  f.io.run = async input => input.args.includes('service') ? Buffer.from('stopped') : run(input);
  await assert.rejects(pair(f.plan, f.options), /not healthy/);
  assert.ok(!f.calls.some(c => c.args?.includes('pair')));
});

test('successful daemon update keeps native runtime bytes and confirms a new worker before committing', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const binary = await readFile(join(f.plan.root, 'runtime/opencode-bin'));
  const next = structuredClone(f.plan); next.pins.paseo.commit = '2'.repeat(40);
  const before = f.calls.length;
  assert.deepEqual(await update(next, f.options), { status: 'updated', commit: next.pins.paseo.commit });
  const journal = JSON.parse(await readFile(join(f.plan.root, 'ownership.json')));
  assert.equal(journal.release, next.pins.paseo.commit); assert.equal(journal.pending, undefined);
  assert.deepEqual(journal.built, { pins: next.pins, artifacts: next.artifacts });
  assert.deepEqual(await readFile(join(f.plan.root, 'runtime/opencode-bin')), binary);
  assert.ok(!f.calls.slice(before).some(c => c.command === 'bun' || c.command === 'launchctl' || c.command === 'systemctl'));
  const restart = f.calls.slice(before).find(c => c.args?.includes('restart'));
  assert.ok(restart.args.includes('--wait-idle'));
});

test('unchanged worker PID rejects activation even if CLI restart exits successfully', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.pins.paseo.commit = '3'.repeat(40);
  const run = f.io.run;
  f.io.run = async input => input.args.includes('restart') ? Buffer.from('') : run(input);
  await assert.rejects(update(next, f.options), /health/);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).release, f.plan.pins.paseo.commit);
});

test('bundled helper changes defer promotion and preserve configuration, history and receipts', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.pins.paseo.commit = '8'.repeat(40);
  const protectedPaths = ['state/paseo/config.json', 'state/paseo/chi/pending-receipt', 'state/opencode/native-history'];
  for (const path of protectedPaths) { await mkdir(join(f.plan.root, path, '..'), { recursive: true }); await writeFile(join(f.plan.root, path), 'synthetic-preserve-' + path); }
  const pointer = await readFile(join(f.plan.root, 'active-paseo.json'));
  const journal = await readFile(join(f.plan.root, 'ownership.json'));
  const releases = await readdir(join(f.plan.root, 'releases'));
  const run = f.io.run, before = f.calls.length;
  f.io.run = async input => {
    const result = await run(input);
    if (input.args.includes('build:server:clean')) await writeFile(join(input.cwd, 'vendor/henkaku-center-chi-native-0.0.0.tgz'), 'changed-helper', { mode: 0o600 });
    return result;
  };
  await assert.rejects(update(next, f.options), /Bundled native tooling.*deferred/);
  assert.deepEqual(await readFile(join(f.plan.root, 'active-paseo.json')), pointer);
  assert.deepEqual(await readFile(join(f.plan.root, 'ownership.json')), journal);
  assert.deepEqual(await readdir(join(f.plan.root, 'releases')), releases);
  for (const path of protectedPaths) assert.equal(await readFile(join(f.plan.root, path), 'utf8'), 'synthetic-preserve-' + path);
  assert.ok(!f.calls.slice(before).some(call => call.args?.includes('restart') || call.command === 'systemctl' || call.command === 'launchctl'));
});

test('failed staging does not change recorded pins and native/tool updates defer before activation', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.pins.paseo.commit = '4'.repeat(40);
  f.fail(call => call.args.includes('build:server:clean'));
  await assert.rejects(update(next, f.options), /injected/);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).plan.pins.paseo.commit, f.plan.pins.paseo.commit);
  for (const target of ['opencode', 'chi']) {
    const native = structuredClone(f.plan); native.pins[target].commit = '9'.repeat(40);
    const before = f.calls.length;
    await assert.rejects(update(native, f.options), /deferred/);
    assert.equal(f.calls.length, before);
  }
});

test('interrupted activation recovers the old pointer through graceful restart before another update', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const owned = await Owned.load(f.plan, false), stage = join(f.plan.root, 'releases/interrupted');
  await mkdir(stage);
  owned.journal.pending = join(stage, 'paseo'); owned.journal.previous = join(f.plan.root, 'runtime/paseo');
  await mkdir(owned.journal.pending);
  await owned.save(); await owned.write(join(f.plan.root, 'active-paseo.json'), JSON.stringify({ path: owned.journal.pending }) + '\n');
  assert.equal((await update(f.plan, f.options)).status, 'up-to-date');
  assert.ok(await stat(join(f.plan.root, 'runtime/paseo/packages/server/package.json')));
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).pending, undefined);
  assert.ok(f.calls.some(c => c.args?.includes('restart') && c.args.includes('--wait-idle')));
});

test('write-ahead intent recovers old/new publication boundaries and refuses unexpected edits', async () => {
  for (const boundary of ['old', 'new', 'linked', 'edited']) {
    const f = await fixture(), owned = await Owned.load(f.plan, true), path = join(f.plan.root, 'managed'), stage = join(f.plan.root, '.chi-1234');
    if (boundary !== 'linked') await owned.write(path, 'old');
    await writeFile(stage, 'new', { mode: 0o600 });
    owned.journal.write = { path, stage, before: owned.journal.files[path], after: digest('new') }; await owned.save();
    if (boundary === 'new') await rename(stage, path);
    if (boundary === 'linked') await link(stage, path);
    if (boundary === 'edited') await writeFile(path, 'unexpected');
    const loaded = await Owned.load(f.plan, false);
    if (boundary === 'edited') {
      await assert.rejects(loaded.lock(async () => {}), /conflicts/);
      assert.equal(await readFile(path, 'utf8'), 'unexpected');
    } else {
      await loaded.lock(() => loaded.verify());
      assert.equal(await readFile(path, 'utf8'), boundary === 'old' ? 'old' : 'new');
      assert.equal(loaded.journal.write, undefined);
    }
  }
});

test('uninstall is repeatable using retained consent, rejects edited services and preserves failed-stop files', async () => {
  const f = await fixture('linux'); await install(f.plan, f.options);
  const path = Object.keys(services(f.plan))[0], original = await readFile(path);
  await writeFile(path, 'foreign service');
  const before = f.calls.length;
  await assert.rejects(uninstall(f.plan, f.options), /Service was edited/);
  assert.equal(f.calls.length, before);
  await writeFile(path, original);
  f.fail(call => call.args.includes('disable'));
  await assert.rejects(uninstall(f.plan, f.options), /injected/);
  assert.ok(await regular(join(f.plan.root, 'bin/node')));
  f.fail(undefined); await uninstall(f.plan, f.options);
  assert.equal((await uninstall(await storedPlan(f.plan.host), f.options)).status, 'uninstalled');
  await assert.rejects(install(f.plan, f.options), /reconciliation/);
});

test('failed user supervision and unconfirmed linger never record an installed daemon', async () => {
  for (const point of ['enable-linger', 'daemon-reload']) {
    const f = await fixture('linux'); f.fail(call => call.args.includes(point));
    await assert.rejects(install(f.plan, f.options), /injected/);
    assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).phase, 'building');
  }
  const f = await fixture('linux'); f.plan.choices.linger = false;
  await assert.rejects(install(f.plan, f.options), /Confirm linger/);
  assert.ok(!f.calls.some(c => c.args?.includes('enable-linger')));
});

test('a preexisting loaded launchd label cannot be adopted even when its file is absent', async () => {
  const f = await fixture('darwin'), run = f.io.run;
  f.io.run = async input => input.command === 'launchctl' && input.args[0] === 'print' ? Buffer.from('foreign service') : run(input);
  await assert.rejects(install(f.plan, f.options), /loaded service/);
  for (const path of Object.keys(services(f.plan))) assert.equal(await regular(path), null);
});

test('auto-update verifies a newer package and invokes only its owned installer with original XDG roots', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const bytes = archive([['package/package.json', JSON.stringify({ name: '@henkaku-center/chi', version: '1.0.1', type: 'module' })], ['package/dist/cli.js', '// synthetic installer'], ['package/postinstall.js', 'must not run']]);
  const url = tarball;
  f.downloads.set(url, bytes);
  f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(metadata(bytes))));
  assert.equal((await autoUpdate(f.plan, f.options)).status, 'update-invoked');
  const invoked = f.calls.at(-1);
  assert.equal(invoked.args[0], join(f.plan.root, 'updates/1.0.1/dist/cli.js'));
  assert.equal(invoked.env.XDG_DATA_HOME, f.plan.host.data); assert.equal(invoked.env.XDG_CONFIG_HOME, f.plan.host.config);
  assert.equal(await regular(join(f.plan.root, 'updates/1.0.1/postinstall.js')), null);
});

test('version-only update refreshes the retained installer, and consent changes never silently apply', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.version = '1.0.1';
  assert.equal((await update(next, f.options)).status, 'up-to-date');
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).plan.version, '1.0.1');
  assert.deepEqual(await readFile(join(f.plan.root, 'installer/dist/cli.js')), await readFile(new URL('../dist/cli.js', import.meta.url)));
  next.choices.endpoint = 'https://another.example';
  const before = f.calls.length;
  await assert.rejects(update(next, f.options), /consent/);
  assert.equal(f.calls.length, before);
  await assert.rejects(update(f.plan, f.options), /downgrade/);
  assert.equal(f.calls.length, before);
});

test('wrong checked-out source cannot pass the installed-runtime health gate', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  await writeFile(join(f.plan.root, 'runtime/paseo/.fixture-commit'), '0'.repeat(40));
  await assert.rejects(pair(f.plan, f.options), /source pin/);
  assert.ok(!f.calls.some(c => c.args?.includes('pair')));
});

test('fixed supervisor entry dispatches a fresh release while the old implementation remains usable', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const old = join(f.plan.root, 'runtime/paseo/packages/server/dist/server/server/daemon-worker-impl.js');
  const dispatcher = old.replace('-impl.js', '.js');
  await writeFile(old, 'console.log("old implementation");');
  const env = { HOME: f.home, PATH: process.env.PATH };
  assert.equal(execFileSync(process.execPath, [dispatcher], { env, encoding: 'utf8' }).trim(), 'old implementation');
  const next = structuredClone(f.plan); next.pins.paseo.commit = '5'.repeat(40);
  await update(next, f.options);
  const { path } = JSON.parse(await readFile(join(f.plan.root, 'active-paseo.json')));
  await writeFile(join(path, 'packages/server/dist/server/server/daemon-worker-impl.js'), 'console.log("new implementation");');
  assert.equal(execFileSync(process.execPath, [dispatcher], { env, encoding: 'utf8' }).trim(), 'new implementation');
  assert.equal(execFileSync(process.execPath, [old], { env, encoding: 'utf8' }).trim(), 'old implementation');
});

test('a systemd unit from another fragment cannot be replaced by an owned override', async () => {
  const f = await fixture('linux'), run = f.io.run;
  f.io.run = async input => input.command === 'systemctl' && input.args.includes('show') ? Buffer.from('/etc/systemd/user/foreign.service') : run(input);
  await assert.rejects(install(f.plan, f.options), /foreign systemd/);
  for (const path of Object.keys(services(f.plan))) assert.equal(await regular(path), null);
});

test('old updater does not download a version already recorded as installed', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const owned = await Owned.load(f.plan, false);
  owned.journal.plan.version = '1.0.2'; await owned.save();
  f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify({ name: '@henkaku-center/chi', version: '1.0.1' })));
  assert.equal((await autoUpdate(f.plan, f.options)).status, 'up-to-date');
});

test('download refuses foreign redirects and cancels oversized response bodies', async () => {
  const original = globalThis.fetch; let calls = 0, cancelled = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://untrusted.example/archive' } }); };
    await assert.rejects(system.download('https://nodejs.org/archive'), /Untrusted/);
    assert.equal(calls, 1);
    const chunk = new Uint8Array(1024 * 1024);
    globalThis.fetch = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(chunk); }, cancel() { cancelled++; } }));
    await assert.rejects(system.download('https://nodejs.org/archive'), /download limit/);
    assert.equal(cancelled, 1);
    await assert.rejects(system.download('http://nodejs.org/archive'), /Untrusted/);
  } finally { globalThis.fetch = original; }
});

test('group-writable managed files and ancestor directories fail ownership checks', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true), path = join(f.plan.root, 'managed');
  await owned.write(path, 'ours'); await chmod(path, 0o666);
  await assert.rejects(owned.verify(), /Unsafe owned/);
  await chmod(path, 0o600);
  await mkdir(join(f.plan.root, 'writable')); await chmod(join(f.plan.root, 'writable'), 0o777);
  await assert.rejects(owned.write(join(f.plan.root, 'writable/file'), 'bad'), /permissions/);
});

test('launchd inspection failure is not treated as absence, and a partial uninstall can resume', async () => {
  const f = await fixture('darwin');
  f.fail(call => call.command === 'launchctl' && call.args[0] === 'print');
  await assert.rejects(install(f.plan, f.options), /injected/);
  assert.ok(!f.calls.some(c => c.args?.includes('bootstrap')));
  f.fail(undefined); await install(f.plan, f.options);
  f.fail(call => call.args[0] === 'bootout' && call.args[1].endsWith('.opencode'));
  await assert.rejects(uninstall(f.plan, f.options), /injected/);
  assert.ok(await regular(join(f.plan.root, 'bin/node')));
  const before = f.calls.length;
  f.fail(undefined); assert.equal((await uninstall(f.plan, f.options)).status, 'uninstalled');
  assert.ok(!f.calls.slice(before).some(c => c.args?.[0] === 'bootout' && c.args[1].endsWith('.paseo')));
});

test('a foreign unjournaled file at a managed path is never replaced', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true);
  const path = join(f.plan.root, 'config/opencode/cli.json');
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  await writeFile(path, 'foreign', { mode: 0o600 });
  await assert.rejects(owned.write(path, 'ours'), /Refusing to replace/);
  assert.equal(await readFile(path, 'utf8'), 'foreign');
  assert.equal(owned.journal.files[path], undefined);
});

test('install refuses to retarget existing consent', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const changed = createPlan({ ...choices, endpoint: 'https://another.example' }, f.plan.host);
  const before = f.calls.length;
  await assert.rejects(install(changed, f.options), /consent/);
  assert.equal(f.calls.length, before);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).plan.choices.endpoint, choices.endpoint);
});

test('auto-update services are scheduled only with confirmed consent', async () => {
  for (const platform of ['darwin', 'linux']) {
    const f = await fixture(platform);
    const off = structuredClone(f.plan); off.choices.autoUpdate = false;
    assert.ok(!Object.keys(services(off)).some(path => /update\.(?:plist|service|timer)$/.test(path)));
    await install(off, f.options);
    const journal = JSON.parse(await readFile(join(off.root, 'ownership.json')));
    assert.ok(!Object.keys(journal.files).some(path => /update\.(?:plist|service|timer)$/.test(path)));
    assert.ok(!f.calls.some(c => c.command === 'systemctl' && c.args?.some(arg => arg.includes('chi-owned-update'))));
  }
});

test('auto-update refuses unconfirmed or revoked runtime consent', async () => {
  const off = await fixture();
  const noUpdate = structuredClone(off.plan); noUpdate.choices.autoUpdate = false;
  await install(noUpdate, off.options);
  await assert.rejects(autoUpdate(noUpdate, off.options), /not confirmed/);

  const f = await fixture(); await install(f.plan, f.options);
  const bytes = archive([['package/package.json', JSON.stringify({ name: '@henkaku-center/chi', version: '1.0.1', type: 'module' })], ['package/dist/cli.js', '// synthetic installer']]);
  const url = tarball;
  f.downloads.set(url, bytes);
  f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(metadata(bytes))));
  const original = f.io.download;
  let revoked = false;
  f.io.download = async input => {
    const data = await original(input);
    if (input === url && !revoked) {
      revoked = true;
      const owned = await Owned.load(f.plan, false);
      owned.journal.plan.choices.autoUpdate = false; await owned.save();
    }
    return data;
  };
  await assert.rejects(autoUpdate(f.plan, f.options), /changed during update/);
  assert.equal(await regular(join(f.plan.root, 'updates/1.0.1/dist/cli.js')), null);
});

test('uninstall and update dry runs report the journaled files and services without mutating', async () => {
  const f = await fixture('linux'); await install(f.plan, f.options);
  const before = await readFile(join(f.plan.root, 'ownership.json'), 'utf8');
  const journal = JSON.parse(before), files = [...Object.keys(journal.files), ...Object.keys(journal.trees)];
  assert.ok(files.includes(join(f.plan.root, 'npm')));
  const servicePath = join(f.plan.host.config, 'systemd/user/chi-owned-paseo.service');
  assert.ok(files.includes(join(f.plan.root, 'bin/chi-launch.mjs')));
  assert.ok(files.includes(servicePath));
  const un = await uninstall(f.plan, { ...f.options, dryRun: true });
  assert.deepEqual([...un.files].sort(), [...files].sort());
  assert.ok(Object.hasOwn(un.services, servicePath));
  const up = await update(f.plan, { ...f.options, dryRun: true });
  assert.deepEqual([...up.files].sort(), [...files].sort());
  assert.ok(Object.hasOwn(up.services, servicePath));
  assert.equal(await readFile(join(f.plan.root, 'ownership.json'), 'utf8'), before);
});

test('pair refuses to write the private offer to a redirected stdout', async () => {
  const home = await mkdtemp(join(tmpdir(), 'case-cli-'));
  const data = join(home, 'data'), config = join(home, 'config');
  await mkdir(join(data, 'chi'), { recursive: true, mode: 0o700 });
  await mkdir(config, { recursive: true, mode: 0o700 });
  await writeFile(join(data, 'chi/choices.json'), JSON.stringify(choices), { mode: 0o600 });
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'pair', '--confirmed'], { env: { HOME: home, XDG_DATA_HOME: data, XDG_CONFIG_HOME: config, PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive terminal/);
});

for (const pin of ['chi', 'paseo', 'artifacts']) test(`resumed install records actually built inputs: ${pin}`, async () => {
  const f = await fixture();
  const unhealthy = { home: join(f.plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'unreachable', daemonVersion: 'fixture', workerPid: 100 };
  f.status(unhealthy);
  await assert.rejects(install(f.plan, f.options), /health/);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).phase, 'building');
  const next = structuredClone(f.plan); next.version = '1.0.1';
  if (pin === 'artifacts') next.artifacts.node.sha256 = '6'.repeat(64);
  else next.pins[pin].commit = '6'.repeat(40);
  f.status({ ...unhealthy, connectedDaemon: 'reachable' });
  assert.equal((await install(next, f.options)).status, 'installed-awaiting-pairing');
  const journal = JSON.parse(await readFile(join(f.plan.root, 'ownership.json')));
  assert.equal(journal.phase, 'installed');
  assert.deepEqual(journal.built, { pins: f.plan.pins, artifacts: f.plan.artifacts });
  assert.deepEqual(journal.plan.pins, f.plan.pins);
  assert.deepEqual(journal.plan.artifacts, f.plan.artifacts);
  assert.equal(journal.release, f.plan.pins.paseo.commit);
  assert.deepEqual(journal.built.pins.chi, plugin.source);
  assert.equal(await readFile(join(f.plan.root, 'runtime/plugin/index.js'), 'utf8'), plugin.files['index.js']);
  if (pin !== 'paseo') await assert.rejects(update(next, f.options), /deferred/);
  else assert.equal((await update(next, f.options)).status, 'updated');
});

test('daemon-owned configuration rewrites survive pair, rerun, update, auto-update and uninstall', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const owned = await Owned.load(f.plan, false), snapshots = new Map();
  const paths = ['state/paseo/config.json', 'config/opencode/opencode.json', 'config/opencode/cli.json'].map(p => join(f.plan.root, p));
  for (const path of paths) {
    assert.equal(owned.journal.files[path], undefined);
    const value = JSON.parse(await readFile(path));
    if (path.endsWith('/cli.json')) { value.animations = false; value.theme = { mode: 'light' }; }
    else if (path.endsWith('/opencode.json')) value.shell = '/bin/zsh';
    else { value.providers = { example: { enabled: false } }; value.relay = { enabled: false }; }
    // OpenCode Config.update and Paseo persist with a temporary file + rename.
    const bytes = JSON.stringify(value, null, 2) + '\n'; await writeFile(path + '.tmp', bytes, { mode: 0o600 }); await rename(path + '.tmp', path);
    snapshots.set(path, bytes);
  }
  const newer = structuredClone(f.plan); newer.pins.paseo.commit = '7'.repeat(40);
  await assert.doesNotReject(pair(newer, f.options)); // Pair uses installed pins, not the caller's pins.
  assert.equal((await install(newer, f.options)).status, 'already-installed');
  assert.equal((await update(newer, f.options)).status, 'updated');
  const updateBytes = archive([['package/package.json', '{"name":"@henkaku-center/chi","version":"1.0.1"}'], ['package/dist/cli.js', '// installer']]);
  f.downloads.set(tarball, updateBytes);
  f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(metadata(updateBytes))));
  assert.equal((await autoUpdate(newer, f.options)).status, 'update-invoked');
  const result = await uninstall(newer, f.options);
  for (const [path, bytes] of snapshots) { assert.equal(await readFile(path, 'utf8'), bytes); assert.ok(result.retained.includes(path)); }
});

test('write-once state rejects foreign initial files and preserves rewritten legacy journal entries', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true);
  for (const path of owned.statePaths()) {
    await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, 'foreign', { mode: 0o600 });
    await assert.rejects(owned.writeState(path, '{}'), /Refusing to replace/);
    await rm(path);
    await owned.write(path, 'initial');
    await writeFile(path, 'daemon rewrite');
    await assert.doesNotReject(owned.verify());
    await assert.doesNotReject(owned.writeState(path, 'regenerated'));
    assert.equal(await readFile(path, 'utf8'), 'daemon rewrite');
    assert.equal(owned.journal.files[path], undefined);
    await rm(path);
    await assert.rejects(owned.writeState(path, '{}'), /state was removed/);
  }
});

test('resuming after state initialization never resets daemon edits', async () => {
  const f = await fixture(); f.fail(c => c.args.includes('--json') && c.args.includes('status'));
  await assert.rejects(install(f.plan, f.options), /injected/);
  const owned = await Owned.load(f.plan, false);
  for (const path of owned.statePaths()) await writeFile(path, '{"daemon":"changed"}');
  f.fail(undefined);
  assert.equal((await install(f.plan, f.options)).status, 'installed-awaiting-pairing');
  for (const path of owned.statePaths()) assert.equal(await readFile(path, 'utf8'), '{"daemon":"changed"}');
});

test('registry signatures bind the name, version and integrity to a pinned authority', async () => {
  const good = metadata(Buffer.from('good'));
  assert.doesNotThrow(() => verifyRegistry(good));
  for (const mutate of [
    value => { delete value.dist.signatures; },
    value => { value.dist.signatures[0].keyid = 'untrusted-key'; value.dist.keys = [testKey]; },
    value => { value.dist.signatures[0].sig = Buffer.alloc(72).toString('base64'); },
    value => { value.dist.integrity = 'sha512-' + Buffer.alloc(64).toString('base64'); },
    value => { value.name = '@attacker/chi'; },
    value => { value.version = '1.0.2'; value.dist.tarball = tarball.replace('1.0.1', '1.0.2'); },
  ]) {
    const bad = structuredClone(good); mutate(bad);
    assert.throws(() => verifyRegistry(bad), /signature/);
  }
  for (const url of [tarball + '?x=1', tarball.replace('chi-1.0.1', 'chi-1.0.2'), tarball.replace('https:', 'http:'), 'https://github.com/attacker/release.tgz', 'https://registry.npmjs.org/other.tgz']) {
    assert.throws(() => verifyRegistry({ ...good, dist: { ...good.dist, tarball: url } }), /tarball URL/);
  }
  assert.throws(() => verifyRegistry({ ...good, dist: { ...good.dist, integrity: 'sha512-short' } }), /integrity/);
});

test('production registry key verifies an official npm signature vector', () => {
  // Public registry metadata for typescript@6.0.3, retrieved 2026-10-02.
  // No private key, network or synthetic test authority is involved in this vector.
  const key = registryKeys.find(key => key.keyid === 'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U');
  assert.ok(key);
  assert.equal(verifySignature('sha256', Buffer.from('typescript@6.0.3:sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw=='), createPublicKey({ key: Buffer.from(key.key, 'base64'), format: 'der', type: 'spki' }), Buffer.from('MEYCIQDv8tVB8x5z1EeS+UHLgSqOywErEEFERRmMNef6kTXsPQIhAMO+L+ktR6FwCDSc+z0KD68md8mvKukeVzgjuBhoie9i', 'base64')), true);
});

test('auto-update refuses unsigned code before downloading or executing it', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const bytes = archive([['package/package.json', '{"name":"@henkaku-center/chi","version":"1.0.1"}'], ['package/dist/cli.js', 'evil']]);
  const data = metadata(bytes); delete data.dist.signatures;
  f.downloads.set(tarball, bytes);
  f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(data)));
  const before = f.calls.length;
  await assert.rejects(autoUpdate(f.plan, f.options), /signature/);
  assert.ok(!f.calls.slice(before).some(c => c.command || c.download === tarball));
  assert.equal(await regular(join(f.plan.root, 'updates/1.0.1/dist/cli.js')), null);
});

test('exact npm downloads cannot redirect even to otherwise allowed hosts', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://registry.npmjs.org/other.tgz' } }); };
    await assert.rejects(system.download(tarball, true), /cannot redirect/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
  const f = await fixture(); await install(f.plan, f.options);
  const bytes = archive([['package/package.json', '{"name":"@henkaku-center/chi","version":"1.0.1"}'], ['package/dist/cli.js', '// installer']]);
  f.downloads.set(tarball, bytes);
  f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(metadata(bytes))));
  const download = f.io.download, exact = [];
  f.io.download = (url, flag) => { exact.push(flag); return download(url); };
  await autoUpdate(f.plan, f.options);
  assert.deepEqual(exact, [true, true, true]);
});

test('npm staging preserves executable bits without granting archive permissions and journals one tree', async () => {
  const f = await fixture(), a = f.plan.artifacts.node, prefix = a.member.replace('bin/node', 'lib/node_modules/npm/');
  const bytes = archive([[a.member, 'node'], [prefix + 'bin/npm-cli.js', 'npm', '0', '0000644'], [prefix + 'bin/node-gyp-bin/node-gyp', '#!/bin/sh\nexit 0\n', '0', '0007755']]);
  a.sha256 = digest(bytes); f.downloads.set(a.url, bytes);
  const owned = await Owned.load(f.plan, true); let saves = 0;
  const save = owned.save.bind(owned); owned.save = async (...args) => { saves++; return save(...args); };
  await installTools(owned, f.io, {});
  assert.equal((await stat(join(f.plan.root, 'npm/bin/npm-cli.js'))).mode & 0o7777, 0o600);
  const executable = join(f.plan.root, 'npm/bin/node-gyp-bin/node-gyp');
  assert.equal((await stat(executable)).mode & 0o7777, 0o700);
  assert.equal(spawnSync(executable, [], { env: { HOME: f.home, PATH: '/usr/bin:/bin' } }).status, 0);
  assert.deepEqual(Object.keys(owned.journal.trees ?? {}), [join(f.plan.root, 'npm')]);
  assert.ok(!Object.keys(owned.journal.files).some(path => path.startsWith(join(f.plan.root, 'npm') + '/')));
  assert.ok(saves <= 12, `constant journal saves, got ${saves}`);
  assert.equal(await owned.removeTree(join(f.plan.root, 'npm')), true);
  await assert.rejects(stat(join(f.plan.root, 'npm')), { code: 'ENOENT' });
  assert.throws(() => tarFiles(archive([['a', 'b', '0', 'invalid']])), /mode/);
});

test('a verified Node archive without npm is rejected before executing its binary', async () => {
  const f = await fixture(), a = f.plan.artifacts.node;
  const bytes = archive([[a.member, 'node-only']]); a.sha256 = digest(bytes); f.downloads.set(a.url, bytes);
  const owned = await Owned.load(f.plan, true);
  await assert.rejects(installTools(owned, f.io, {}), /Missing npm/);
  assert.ok(!f.calls.some(c => c.command));
});

test('tree ownership detects edits, added files, modes and links and preserves the whole tree', async () => {
  for (const change of ['edit', 'added', 'mode', 'symlink', 'hardlink']) {
    const f = await fixture(), owned = await Owned.load(f.plan, true), path = join(f.plan.root, 'npm');
    await owned.writeTree(path, new Map([['file', { bytes: Buffer.from('ours'), mode: 0o600 }]]));
    if (change === 'edit') await writeFile(join(path, 'file'), 'edited');
    if (change === 'added') await writeFile(join(path, 'foreign'), 'foreign');
    if (change === 'mode') await chmod(join(path, 'file'), 0o700);
    if (change === 'symlink') await symlink(f.home, join(path, 'link'));
    if (change === 'hardlink') await link(join(path, 'file'), join(f.home, 'link'));
    await assert.rejects(owned.verify(), /tree|Unsafe/);
    assert.equal(await owned.removeTree(path), false);
    assert.ok(await stat(join(path, 'file')));
  }
});

test('tree staging refuses foreign targets, traversal and forged recovery paths', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true), path = join(f.plan.root, 'npm');
  await mkdir(path); await writeFile(join(path, 'foreign'), 'keep');
  await assert.rejects(owned.writeTree(path, new Map()), /non-owned tree/);
  assert.equal(await readFile(join(path, 'foreign'), 'utf8'), 'keep');
  await assert.rejects(owned.removeTree(f.home), /Unsafe owned tree/);
  await rm(path, { recursive: true });
  for (const name of ['../escape', '/escape', 'a/../b', 'a\\b', 'a//b']) await assert.rejects(owned.writeTree(path, new Map([[name, { bytes: Buffer.from('x'), mode: 0o600 }]])), /Unsafe tree/);
  owned.journal.tree = { path: f.home, stage: join(f.plan.root, '.chi-tree-test'), hash: '0'.repeat(64) }; await owned.save();
  await assert.rejects(owned.lock(async () => {}), /Unsafe owned tree/);
});

test('tree publication resumes at both rename boundaries and rejects stage tampering', async () => {
  for (const boundary of ['staged', 'renamed', 'edited']) {
    const f = await fixture(), owned = await Owned.load(f.plan, true), path = join(f.plan.root, 'npm');
    await owned.writeTree(path, new Map([['file', { bytes: Buffer.from('ours'), mode: 0o600 }]]));
    const hash = owned.journal.trees[path], stage = join(f.plan.root, '.chi-tree-fixture');
    delete owned.journal.trees[path];
    if (boundary !== 'renamed') await rename(path, stage);
    if (boundary === 'edited') await writeFile(join(stage, 'file'), 'tampered');
    owned.journal.tree = { path, stage, hash }; await owned.save();
    if (boundary === 'edited') {
      await assert.rejects(owned.lock(async () => {}), /Staged tree was edited/);
      await assert.rejects(stat(path), { code: 'ENOENT' });
    }
    else {
      await owned.lock(() => owned.verify());
      assert.equal(await readFile(join(path, 'file'), 'utf8'), 'ours');
      assert.equal(owned.journal.trees[path], hash);
      assert.equal(owned.journal.tree, undefined);
    }
  }
});

test('tree publication flushes file-less ancestors before saving publication intent', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true), path = join(f.plan.root, 'npm');
  const probe = await open(join(f.home, 'probe'), 'wx', 0o600), prototype = Object.getPrototypeOf(probe), original = prototype.sync;
  await probe.close();
  const synced = new Set(); let atIntent;
  const id = info => `${info.dev}:${info.ino}`;
  const save = owned.save.bind(owned);
  owned.save = async (...args) => { if (owned.journal.tree) atIntent = new Set(synced); return save(...args); };
  prototype.sync = async function() { const info = await this.stat(); if (info.isDirectory()) synced.add(id(info)); return original.call(this); };
  try { await owned.writeTree(path, new Map([['a/b/file', { bytes: Buffer.from('content'), mode: 0o600 }]])); }
  finally { prototype.sync = original; }
  for (const relative of ['', 'a', 'a/b']) assert.ok(atIntent.has(id(await stat(join(path, relative)))), `ancestor ${relative} durable before intent`);
});

test('reconfigure shows exact consent diff, requires fresh confirmation and preserves old state in a private archive', async () => {
  const f = await fixture('linux'); await install(f.plan, f.options);
  const secretPath = join(f.plan.root, 'state/paseo/private-fixture'); await writeFile(secretPath, 'synthetic-pair-state');
  const next = structuredClone(f.plan); next.choices.endpoint = 'https://new.example'; next.choices.autoUpdate = false;
  const before = await readFile(join(f.plan.root, 'ownership.json'), 'utf8'), calls = f.calls.length;
  const preview = await reconfigure(next, { ...f.options, dryRun: true });
  assert.deepEqual(preview.diff, { endpoint: { before: choices.endpoint, after: next.choices.endpoint }, autoUpdate: { before: true, after: false } });
  await assert.rejects(reconfigure(next, f.options), /requires confirmation/);
  await assert.rejects(reconfigure(next, { ...f.options, confirmChanges: async () => false }), /requires confirmation/);
  assert.equal(await readFile(join(f.plan.root, 'ownership.json'), 'utf8'), before); assert.equal(f.calls.length, calls);
  let shown;
  const result = await reconfigure(next, { ...f.options, confirmChanges: async diff => { shown = diff; return true; } });
  assert.deepEqual(shown, preview);
  assert.equal((await stat(result.retained)).mode & 0o777, 0o700);
  assert.equal(await readFile(join(result.retained, 'state/paseo/private-fixture'), 'utf8'), 'synthetic-pair-state');
  assert.equal(JSON.parse(await readFile(join(result.retained, 'state/paseo/config.json'))).chi.destinations.chosen.endpoint, choices.endpoint);
  await assert.rejects(stat(secretPath), { code: 'ENOENT' });
  assert.ok(f.calls.slice(calls).some(c => c.args?.includes('disable')));
  assert.ok(f.calls.slice(calls).some(c => c.args?.includes('daemon-reload')));
  assert.equal((await install(next, f.options)).status, 'installed-awaiting-pairing');
  assert.equal(JSON.parse(await readFile(join(next.root, 'state/paseo/config.json'))).chi.destinations.chosen.endpoint, next.choices.endpoint);
  assert.equal(await regular(secretPath), null);
});

test('reconfigure recovers failed login and uninstalled state without silently retaining old consent', async () => {
  const f = await fixture('linux'); f.fail(c => c.args.includes('auth'));
  await assert.rejects(install(f.plan, f.options), /login required/);
  const next = structuredClone(f.plan); next.choices.mappings = [];
  const options = { ...f.options, confirmChanges: async () => true };
  const count = f.calls.length;
  await reconfigure(next, options);
  assert.ok(!f.calls.slice(count).some(c => c.command === 'systemctl' || c.command === 'loginctl'));
  f.fail(undefined);
  await install(next, f.options); await uninstall(next, f.options);
  await reconfigure(next, options);
  assert.equal((await install(next, f.options)).status, 'installed-awaiting-pairing');
});

test('interrupted reconfigure blocks other actions and resumes only the approved plan', async () => {
  const f = await fixture('linux'); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.choices.mappings = [];
  const options = { ...f.options, confirmChanges: async () => true };
  f.fail(c => c.args.includes('disable'));
  await assert.rejects(reconfigure(next, options), /injected/);
  assert.ok(await regular(join(f.plan.root, 'bin/node')));
  for (const action of [install, pair, update, autoUpdate, uninstall]) await assert.rejects(action(f.plan, f.options), /reconfigure/);
  await assert.rejects(reconfigure(f.plan, options), /exact confirmed plan/);
  f.fail(undefined);
  assert.equal((await reconfigure(next, options)).status, 'reconfigured-awaiting-install');
});

test('reconfigure CLI cannot use --confirmed to bypass the displayed diff', async () => {
  const f = await fixture(process.platform, process.arch), owned = await Owned.load(f.plan, true);
  await owned.write(join(f.plan.root, 'choices.json'), JSON.stringify(choices));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'reconfigure', '--confirmed'], { env: { HOME: f.home, PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /interactive terminal/); assert.match(result.stdout, /"diff"/);
});

test('failed build stderr is private, retained and reported without leaking its contents; pair never logs', async () => {
  const f = await fixture(), run = f.io.run;
  f.io.run = async input => {
    if (input.args.includes('build:server:clean')) return system.run({ ...input, command: process.execPath, args: ['-e', 'process.stderr.write("synthetic-build-diagnostic");process.exit(1)'] });
    return run(input);
  };
  let failure;
  try { await install(f.plan, f.options); } catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /private build error log:/);
  assert.doesNotMatch(failure.message, /synthetic-build-diagnostic/);
  const log = failure.message.split('private build error log: ')[1];
  assert.equal(await readFile(log, 'utf8'), 'synthetic-build-diagnostic');
  assert.equal((await stat(log)).mode & 0o777, 0o600);
  assert.equal((await stat(join(log, '..'))).mode & 0o777, 0o700);
  f.io.run = run;
  await install(f.plan, f.options);
  const logs = await readdir(join(f.plan.root, 'logs'));
  assert.equal(logs.length, 1, 'successful build log is removed; the failed diagnostic remains');
  await pair(f.plan, f.options);
  assert.equal(f.calls.at(-1).buildLog, undefined); assert.equal(f.calls.at(-1).inherit, true);
  assert.deepEqual(await readdir(join(f.plan.root, 'logs')), logs);
  const fd = await open(join(f.home, 'pair-log'), 'wx', 0o600);
  try { await system.run({ command: process.execPath, args: ['-e', 'process.stderr.write("private-offer")', 'pair'], cwd: f.home, env: { HOME: f.home, PATH: '/usr/bin:/bin' }, buildLog: fd.fd }); }
  finally { await fd.close(); }
  assert.equal(await readFile(join(f.home, 'pair-log'), 'utf8'), '');
});

test('uid zero is refused before plan construction', () => {
  const original = process.getuid;
  try { process.getuid = () => 0; assert.throws(() => hostFrom({ HOME: '/synthetic' }), /uid 0/); }
  finally { process.getuid = original; }
});

test('unsafe service ancestors fail before downloads or long source builds', async () => {
  const f = await fixture('linux'), other = join(f.home, 'other'); await mkdir(other);
  await symlink(other, f.plan.host.config);
  await assert.rejects(install(f.plan, f.options), /Unsafe directory/);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await readdir(other), []);
});

test('Linux uninstall reloads after unit removal and reports retained builds and linger provenance', async () => {
  const f = await fixture('linux'); await install(f.plan, f.options);
  for (const path of ['cache', 'tools/node_modules']) await mkdir(join(f.plan.root, path), { recursive: true });
  const journal = JSON.parse(await readFile(join(f.plan.root, 'ownership.json')));
  assert.equal(journal.lingerWasEnabled, false);
  const run = f.io.run; let reloaded = false;
  f.io.run = async input => {
    if (input.args.includes('daemon-reload')) {
      for (const path of Object.keys(services(f.plan))) assert.equal(await regular(path), null);
      reloaded = true;
    }
    return run(input);
  };
  const result = await uninstall(f.plan, f.options);
  assert.equal(reloaded, true);
  for (const name of ['runtime', 'releases', 'cache', 'build-home', 'tools/node_modules']) assert.ok(result.retained.includes(join(f.plan.root, name)), name);
});

test('linger provenance distinguishes preexisting enablement and survives a failed supervision retry', async () => {
  const preexisting = await fixture('linux'), run = preexisting.io.run;
  preexisting.io.run = input => input.command === 'loginctl' && input.args[0] === 'show-user' ? Promise.resolve(Buffer.from('yes')) : run(input);
  await install(preexisting.plan, preexisting.options);
  assert.equal(JSON.parse(await readFile(join(preexisting.plan.root, 'ownership.json'))).lingerWasEnabled, true);
  assert.ok(!preexisting.calls.some(c => c.args?.includes('enable-linger')));
  const f = await fixture('linux'); f.fail(c => c.args.includes('daemon-reload'));
  await assert.rejects(install(f.plan, f.options), /injected/);
  f.fail(undefined); await install(f.plan, f.options);
  assert.equal(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).lingerWasEnabled, false);
});

test('legacy state uninstall retains global OpenCode config even when its original hash still matches', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const owned = await Owned.load(f.plan, false), path = join(f.plan.root, 'config/opencode/opencode.json');
  owned.journal.files[path] = digest(await readFile(path)); await owned.save();
  const original = await readFile(path, 'utf8');
  await uninstall(f.plan, f.options);
  assert.equal(await readFile(path, 'utf8').catch(() => null), original);
});

test('update cannot relabel native repository or version metadata or a missing built record', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  for (const pin of ['opencode', 'chi']) {
    const changed = structuredClone(f.plan); changed.pins[pin].repository = 'attacker/repo';
    await assert.rejects(update(changed, f.options), /deferred/);
  }
  const changed = structuredClone(f.plan); changed.pins.opencode.version = '999.0.0';
  await assert.rejects(update(changed, f.options), /deferred/);
  const owned = await Owned.load(f.plan, false); delete owned.journal.built; await owned.save();
  await assert.rejects(update(f.plan, f.options), /Built inputs/);
  await assert.rejects(install(f.plan, f.options), /Built pins were not recorded/);
});

test('changed Paseo repository metadata requires a real build before recording the new inputs', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.pins.paseo.repository = 'another/paseo';
  const count = f.calls.length;
  assert.equal((await update(next, f.options)).status, 'updated');
  assert.ok(f.calls.slice(count).some(c => c.args?.includes('https://github.com/another/paseo.git')));
  assert.deepEqual(JSON.parse(await readFile(join(f.plan.root, 'ownership.json'))).built, { pins: next.pins, artifacts: next.artifacts });
});

for (const platform of ['darwin', 'linux']) test(`reconfigure archive movement (${platform}) resumes without copying state back or replacing collisions`, async () => {
  const f = await fixture(platform); await install(f.plan, f.options);
  const cliPath = join(f.plan.root, 'config/opencode/cli.json');
  const cliSettings = { ...JSON.parse(await readFile(cliPath)), animations: false, theme: { mode: 'light' } };
  await writeFile(cliPath + '.tmp', JSON.stringify(cliSettings), { mode: 0o600 }); await rename(cliPath + '.tmp', cliPath);
  await writeFile(join(f.plan.root, 'bin/chi-launch.mjs'), 'edited executable must never run');
  const next = structuredClone(f.plan); next.choices.mappings = [];
  const options = { ...f.options, confirmChanges: async () => true };
  f.fail(c => (c.command === 'launchctl' && c.args[0] === 'bootout') || (c.command === 'systemctl' && c.args.includes('disable')));
  await assert.rejects(reconfigure(next, options), /injected/);
  let owned = await Owned.load(f.plan, false), { archive, entries } = owned.journal.reconfigure;
  // Model SIGKILL after an entry rename, before completing the journal reset.
  await rename(join(f.plan.root, 'state'), join(archive, 'state'));
  await writeFile(join(archive, 'choices.json'), 'collision', { mode: 0o600 });
  f.fail(undefined);
  await assert.rejects(reconfigure(next, options), /collision/);
  assert.equal(await readFile(join(archive, 'choices.json'), 'utf8'), 'collision');
  await rm(join(archive, 'choices.json'));
  assert.equal((await reconfigure(next, options)).status, 'reconfigured-awaiting-install');
  assert.equal(JSON.parse(await readFile(join(archive, 'state/paseo/config.json'))).chi.destinations.chosen.endpoint, choices.endpoint);
  assert.deepEqual(JSON.parse(await readFile(join(archive, 'config/opencode/cli.json'))), cliSettings);
  assert.equal(await readFile(join(archive, 'bin/chi-launch.mjs'), 'utf8'), 'edited executable must never run');
  owned = await Owned.load(next, false);
  assert.equal(owned.journal.reconfigure, undefined);
  assert.equal(await regular(join(next.root, 'state/paseo/config.json')), null);
  assert.ok(entries.includes('state'));
});

test('forged reconfigure archive paths cannot move data outside the owned root', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true);
  const outside = join(f.home, 'reconfigure-fixture'); await mkdir(outside);
  owned.journal.reconfigure = { plan: f.plan, archive: outside, entries: ['state'], services: false }; await owned.save();
  await assert.rejects(reconfigure(f.plan, { ...f.options, confirmChanges: async () => true }), /Invalid reconfigure archive/);
  assert.deepEqual(await readdir(outside), []);
});

test('CLI completion prints a runnable owned pair command with shell-safe absolute paths', async () => {
  const f = await fixture(process.platform, process.arch);
  const home = join(f.home, "space's $HOME"); await mkdir(home);
  const plan = createPlan(choices, hostFrom({ HOME: home })), owned = await Owned.load(plan, true);
  owned.journal.phase = 'installed'; owned.journal.release = plan.pins.paseo.commit;
  owned.journal.built = { pins: plan.pins, artifacts: plan.artifacts }; await owned.save();
  await owned.write(join(plan.root, 'bin/gh'), `#!/bin/sh\necho '${plan.artifacts.gh.version}'\n`, 0o700);
  await owned.write(join(plan.root, 'bin/gitleaks'), `#!/bin/sh\necho '${plan.artifacts.gitleaks.version}'\n`, 0o700);
  await owned.write(join(plan.root, 'bin/node'), `#!/bin/sh
if [ "$1" = --version ]; then echo '${plan.artifacts.node.version}'
elif [ "$2" = pair ]; then echo 'pair-command-ok'
elif [ "$2" = paseo ]; then echo '${JSON.stringify({ home: join(plan.root, 'state/paseo'), localDaemon: 'running', connectedDaemon: 'reachable', daemonVersion: 'fixture', workerPid: 100 }).replaceAll("'", "'\\''")}'
elif [ "$3" = service ]; then echo 'http://127.0.0.1:1234'
else echo '${JSON.stringify({ version: plan.pins.opencode.version, pid: 200 })}'
fi\n`, 0o700);
  await owned.write(join(plan.root, 'active-paseo.json'), JSON.stringify({ path: join(plan.root, 'runtime/paseo') }));
  await owned.write(join(plan.root, 'runtime/paseo/packages/server/package.json'), '{"version":"fixture"}');
  await owned.write(join(plan.root, 'choices.json'), JSON.stringify(choices));
  await writeFile(join(f.home, 'git'), `#!/bin/sh\necho '${plan.pins.paseo.commit}'\n`, { mode: 0o700 });
  const env = { HOME: home, PATH: `${f.home}:/usr/bin:/bin` };
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'install', '--choices', join(plan.root, 'choices.json'), '--confirmed'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const command = result.stdout.match(/; run: (.+)/)?.[1];
  assert.ok(command, result.stdout);
  assert.equal(spawnSync('/bin/sh', ['-c', command], { env, encoding: 'utf8' }).stdout.trim(), 'pair-command-ok');
});

test('unbuilt resume reports the exact recorded pins before login or rebuilding, without consent or credentials', async () => {
  for (const point of ['auth', 'build:server:clean']) {
    const f = await fixture(); f.fail(c => c.args.includes(point));
    await assert.rejects(install(f.plan, f.options), /login required|injected/);
    const newer = structuredClone(f.plan); newer.version = '1.0.1'; newer.pins.paseo.commit = '6'.repeat(40); newer.pins.chi.commit = '7'.repeat(40);
    const messages = [], original = console.error;
    console.error = message => messages.push(message);
    try { await assert.rejects(install(newer, f.options), /login required|injected/); }
    finally { console.error = original; }
    assert.equal(messages.length, 1);
    assert.match(messages[0], /^Resuming recorded installer inputs/);
    assert.deepEqual(JSON.parse(messages[0].slice(messages[0].indexOf('{'))), { version: f.plan.version, pins: f.plan.pins, artifacts: f.plan.artifacts });
    assert.doesNotMatch(messages[0], /synthetic-secret|chi.example|owner\/repo/);
  }
});

for (const platform of ['darwin', 'linux']) test(`reconfigure service recheck (${platform}) refuses edits on an interrupted retry before stopping anything`, async () => {
  const f = await fixture(platform); await install(f.plan, f.options);
  const next = structuredClone(f.plan); next.choices.mappings = [];
  const options = { ...f.options, confirmChanges: async () => true };
  f.fail(c => c.args.includes('bootout') || c.args.includes('disable'));
  await assert.rejects(reconfigure(next, options), /injected/);
  const service = Object.keys(services(f.plan))[0];
  await writeFile(service, 'edited service'); f.fail(undefined);
  const before = f.calls.length;
  await assert.rejects(reconfigure(next, options), /Service was edited; reconcile it before reconfigure/);
  assert.equal(f.calls.length, before);
  assert.equal(await readFile(service, 'utf8'), 'edited service');
  assert.ok(await regular(join(f.plan.root, 'bin/node')));
});

test('reconfigure rejects traversal and reserved archive entry names before any move or stop', async () => {
  for (const name of ['..', '/', 'a/b', 'a\\b', '.', '', 'retained', 'ownership.json', '.install-lock']) {
    const f = await fixture(), owned = await Owned.load(f.plan, true);
    const archive = join(f.plan.root, 'retained/reconfigure-test'); await mkdir(archive, { recursive: true, mode: 0o700 });
    await owned.write(join(f.plan.root, 'sentinel'), 'keep');
    owned.journal.reconfigure = { plan: f.plan, archive, entries: [name, 'sentinel'], services: false }; await owned.save();
    await assert.rejects(reconfigure(f.plan, { ...f.options, confirmChanges: async () => true }), /Invalid reconfigure archive intent/);
    assert.deepEqual(f.calls, []); assert.deepEqual(await readdir(archive), []);
    assert.equal(await readFile(join(f.plan.root, 'sentinel'), 'utf8'), 'keep');
  }
});

test('reconfigure revalidates stored intent consent even when it equals the supplied plan', async () => {
  const f = await fixture(), owned = await Owned.load(f.plan, true);
  const next = structuredClone(f.plan); next.choices.permissions = 'allow';
  const archive = join(f.plan.root, 'retained/reconfigure-test'); await mkdir(archive, { recursive: true, mode: 0o700 });
  owned.journal.reconfigure = { plan: next, archive, entries: [], services: false }; await owned.save();
  await assert.rejects(reconfigure(next, { ...f.options, confirmChanges: async () => true }), /ask/);
  assert.deepEqual(f.calls, []);
  assert.equal((await Owned.load(f.plan, false)).journal.plan.choices.permissions, 'ask');
});

test('linger provenance survives reconfigure and subsequent installation for both prior states', async () => {
  for (const enabled of [true, false]) {
    const f = await fixture('linux'), run = f.io.run;
    if (enabled) f.io.run = input => input.command === 'loginctl' && input.args[0] === 'show-user' ? Promise.resolve(Buffer.from('yes')) : run(input);
    await install(f.plan, f.options);
    await reconfigure(f.plan, { ...f.options, confirmChanges: async () => true });
    assert.equal((await Owned.load(f.plan, false)).journal.lingerWasEnabled, enabled);
    await install(f.plan, f.options);
    assert.equal((await Owned.load(f.plan, false)).journal.lingerWasEnabled, enabled);
    assert.ok(!f.calls.some(c => c.args?.includes('disable-linger')));
  }
});

test('auto-update manifest name, version and entrypoint must match even with valid signatures and provenance', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  for (const [name, version, cli] of [['@attacker/chi', '1.0.1', true], ['@henkaku-center/chi', '1.0.2', true], ['@henkaku-center/chi', '1.0.1', false]]) {
    const entries = [['package/package.json', JSON.stringify({ name, version })]];
    if (cli) entries.push(['package/dist/cli.js', 'malicious']);
    const bytes = archive(entries);
    f.downloads.set(tarball, bytes); f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(metadata(bytes))));
    const before = f.calls.length;
    await assert.rejects(autoUpdate(f.plan, f.options), /Installer package mismatch/);
    assert.ok(!f.calls.slice(before).some(c => c.command));
    assert.equal(await regular(join(f.plan.root, 'updates/1.0.1/dist/cli.js')), null);
  }
});

test('provenance admission requires the exact npm attestation URL and SLSA type', () => {
  const good = metadata(Buffer.from('good'));
  assert.equal(attestationURL(good), provenanceURL);
  for (const att of [undefined, {}, { url: provenanceURL }, { url: provenanceURL, provenance: { predicateType: 'other' } }, ...[provenanceURL + '?x', provenanceURL + '#x', provenanceURL.replace('%2f', '/'), provenanceURL.replace('npmjs.org', 'npmjs.org.evil'), provenanceURL.replace('1.0.1', '1.0.2'), 'https://github.com/attacker'].map(url => ({ url, provenance: { predicateType } }))]) {
    assert.throws(() => attestationURL({ ...good, dist: { ...good.dist, attestations: att } }), /provenance URL\/type/);
  }
});

test('Sigstore provenance binds signed statement, certificate issuer and exact release identity', async () => {
  const data = metadata(Buffer.from('good')), encode = v => Buffer.from(JSON.stringify(v));
  const good = await provenance(data);
  assert.doesNotThrow(() => verifyProvenance(data, encode(good)));
  for (const changeStatement of [
    s => { s._type = 'untrusted'; }, s => { s.predicateType = 'other'; },
    s => { s.predicate.buildDefinition.buildType = 'untrusted'; },
    s => { s.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/attacker/chi'; },
    s => { s.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml'; },
    s => { s.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/main'; },
    s => { s.subject[0].name = 'pkg:npm/%40attacker/chi@1.0.1'; },
    s => { s.subject[0].name = 'pkg:npm/%40henkaku-center/chi@1.0.2'; },
    s => { s.subject[0].digest.sha512 = '0'.repeat(128); },
    s => { s.subject.push(s.subject[0]); }, s => { s.subject = []; },
  ]) {
    const bad = await provenance(data, { changeStatement });
    assert.throws(() => verifyProvenance(data, encode(bad)), /provenance/);
  }
  for (const options of [
    { identity: 'https://github.com/attacker/chi/.github/workflows/release.yml@refs/tags/chi-v1.0.1' },
    { identity: 'https://github.com/henkaku-center/chi/.github/workflows/release.yml@refs/tags/chi-v1.0.1' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/other.yml@refs/tags/chi-v1.0.1' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/heads/main' },
    // Only the certificate identity carries each of these: the signed statement
    // still names the exact repository/workflow/tag, so the certificate SAN must
    // be matched exactly, not as an unanchored substring.
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.10' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.1-evil' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1x0x1' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.2' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.1x' },
    // The anchors must reject a prefix before the exact identity and a trailing
    // newline; otherwise an unanchored or newline-tolerant pattern would accept
    // a certificate whose SAN merely contains the reviewed identity.
    { identity: 'xhttps://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.1' },
    { identity: 'https://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.1\n' },
    { identity: 'a\nhttps://github.com/henkaku-center/chi-releases/.github/workflows/release.yml@refs/tags/chi-v1.0.1' },
    { issuer: 'https://attacker.example' },
  ]) {
    const bad = await provenance(data, options);
    assert.throws(() => verifyProvenance(data, encode(bad)), /identity|issuer/i);
  }
});

test('certificate transparency rejects a provenance bundle whose certificate has no SCT', async () => {
  const data = metadata(Buffer.from('good'));
  const withSct = await provenance(data), noSct = await provenance(data, { noSct: true });
  assert.throws(() => verifyProvenance(data, Buffer.from(JSON.stringify(noSct))), /SCT/i);
  assert.doesNotThrow(() => verifyProvenance(data, Buffer.from(JSON.stringify(withSct))));
});

test('Sigstore rejects tampered payload, certificate, signature and transparency evidence', async () => {
  const data = metadata(Buffer.from('good')), good = await provenance(data);
  const wrongType = await provenance(data, { payloadType: 'text/plain' });
  assert.throws(() => verifyProvenance(data, Buffer.from(JSON.stringify(wrongType))), /payload type/);
  for (const mutate of [
    a => { a.attestations = []; }, a => { a.attestations.push(a.attestations[0]); },
    a => { a.attestations[0].bundle.dsseEnvelope.payloadType = 'text/plain'; },
    a => { const e = a.attestations[0].bundle.dsseEnvelope; const s = JSON.parse(Buffer.from(e.payload, 'base64')); s.tampered = true; e.payload = Buffer.from(JSON.stringify(s)).toString('base64'); },
    a => { a.attestations[0].bundle.dsseEnvelope.signatures[0].sig = Buffer.alloc(72).toString('base64'); },
    a => { a.attestations[0].bundle.verificationMaterial.x509CertificateChain.certificates[0].rawBytes = Buffer.alloc(72).toString('base64'); },
    a => { const v = a.attestations[0].bundle.verificationMaterial; delete v.x509CertificateChain; v.publicKey = { hint: testKey.keyid }; a.keys = [testKey]; },
    a => { a.attestations[0].bundle.verificationMaterial.tlogEntries = []; },
    a => { a.attestations[0].bundle.verificationMaterial.tlogEntries[0].inclusionPromise.signedEntryTimestamp = Buffer.alloc(72).toString('base64'); },
    a => { a.attestations[0].bundle.verificationMaterial.tlogEntries[0].integratedTime = '1'; },
  ]) {
    const bad = structuredClone(good); mutate(bad);
    assert.throws(() => verifyProvenance(data, Buffer.from(JSON.stringify(bad))));
  }
  const root = trustRoot.certificateAuthorities.pop();
  try { assert.throws(() => verifyProvenance(data, Buffer.from(JSON.stringify({ ...good, trustedRoot: { certificateAuthorities: [root] } }))), /certificate/i); }
  finally { trustRoot.certificateAuthorities.push(root); }
});

test('auto-update refuses valid npm signatures without valid release provenance before staging or execution', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const bytes = archive([['package/package.json', '{"name":"@henkaku-center/chi","version":"1.0.1"}'], ['package/dist/cli.js', '// must not run']]);
  const data = metadata(bytes);
  f.downloads.set(tarball, bytes); f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(data)));
  const bad = await provenance(data, { identity: 'https://github.com/attacker/chi/.github/workflows/release.yml@refs/tags/chi-v1.0.1' });
  f.downloads.set(provenanceURL, Buffer.from(JSON.stringify(bad)));
  const before = f.calls.length;
  await assert.rejects(autoUpdate(f.plan, f.options), /identity/i);
  assert.ok(!f.calls.slice(before).some(c => c.command));
  assert.equal(await regular(join(f.plan.root, 'updates/1.0.1/dist/cli.js')), null);
});

test('production Sigstore roots verify the public npm provenance vector without test trust', async () => {
  const { attestations } = JSON.parse(await readFile(new URL('./fixtures/sigstore-verify-4.1.2.json', import.meta.url)));
  const bundle = attestations.find(a => a.predicateType === predicateType).bundle;
  const root = trustRoot.certificateAuthorities.pop();
  try {
    assert.doesNotThrow(() => verifyBundle(bundle, 'https://github.com/sigstore/sigstore-js/.github/workflows/release.yml@refs/heads/main'));
    assert.throws(() => verifyBundle(bundle, 'https://github.com/henkaku-center/chi/.github/workflows/release.yml@refs/tags/chi-v1.0.1'), /identity/i);
  } finally { trustRoot.certificateAuthorities.push(root); }
});

test('retained verifier runs without node_modules and rejects an untrusted signer in a fresh process', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const vector = join(f.home, 'vector.json');
  await writeFile(vector, await readFile(new URL('./fixtures/sigstore-verify-4.1.2.json', import.meta.url)));
  const script = `import { readFileSync } from 'node:fs'; import { verifyBundle } from ${JSON.stringify(new URL('file://' + join(f.plan.root, 'installer/dist/sigstore.js')).href)};
const bundle = JSON.parse(readFileSync(${JSON.stringify(vector)})).attestations.find(a => a.predicateType === 'https://slsa.dev/provenance/v1').bundle;
verifyBundle(bundle, 'https://github.com/sigstore/sigstore-js/.github/workflows/release.yml@refs/heads/main');
try { verifyBundle(bundle, 'https://github.com/attacker/chi'); process.exit(2); } catch { console.log('verified-and-rejected'); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: f.home, env: { HOME: f.home, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), 'verified-and-rejected');
});

test('downloaded installer distribution loads its bundled verifier after the staging allowlist', async () => {
  const f = await fixture(); await install(f.plan, f.options);
  const entries = [['package/package.json', '{"name":"@henkaku-center/chi","version":"1.0.1","type":"module"}']];
  for (const name of await readdir(new URL('../dist/', import.meta.url))) if (name.endsWith('.js')) entries.push([`package/dist/${name}`, await readFile(new URL(`../dist/${name}`, import.meta.url))]);
  const bytes = archive(entries);
  f.downloads.set(tarball, bytes); f.downloads.set('https://registry.npmjs.org/@henkaku-center%2fchi/latest', Buffer.from(JSON.stringify(metadata(bytes))));
  const run = f.io.run; let executed = false;
  f.io.run = async input => {
    if (input.args[0] === join(f.plan.root, 'updates/1.0.1/dist/cli.js')) {
      assert.equal(input.args[1], 'update');
      // Execute only the downloaded CLI's help/load path: no real service calls.
      const result = spawnSync(process.execPath, [input.args[0], '--help'], { cwd: f.home, env: { HOME: f.home, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /chi \[install/); executed = true;
    }
    return run(input);
  };
  assert.equal((await autoUpdate(f.plan, f.options)).status, 'update-invoked'); assert.equal(executed, true);
});

test('installer release gate requires explicit publication review, correct package and stable matching 1.x tag', async () => {
  const publicManifest = { name: '@henkaku-center/chi', version: '1.0.1', private: false };
  assert.doesNotThrow(() => releaseCheck(publicManifest, 'refs/tags/chi-v1.0.1'));
  for (const manifest of [{ ...publicManifest, private: true }, { ...publicManifest, private: undefined }, { ...publicManifest, name: '@attacker/chi' }, { ...publicManifest, version: '0.3.0' }, { ...publicManifest, version: '2.0.0' }, { ...publicManifest, version: '1.0.1-rc.1' }]) {
    assert.throws(() => releaseCheck(manifest, `refs/tags/chi-v${manifest.version}`));
  }
  for (const ref of [undefined, 'refs/heads/main', 'refs/tags/chi-v1.0.2', 'refs/tags/jsonl-reduce-v1.0.1']) assert.throws(() => releaseCheck(publicManifest, ref));
  const candidate = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.deepEqual(candidate.repository, { type: 'git', url: 'git+https://github.com/henkaku-center/chi-releases.git', directory: 'packages/installer' });
  const verifier = JSON.parse(await readFile(new URL('../node_modules/@sigstore/verify/package.json', import.meta.url)));
  assert.equal(candidate.engines.node, verifier.engines.node, 'bootstrap Node contract must cover the bundled verifier');
  if (candidate.private !== false) assert.throws(() => releaseCheck(candidate, `refs/tags/chi-v${candidate.version}`), /private/);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/release-check.mjs', import.meta.url))], { env: { HOME: process.env.HOME, GITHUB_REF: `refs/tags/chi-v${candidate.version}` }, encoding: 'utf8' });
  assert.equal(result.status, candidate.private === false ? 0 : 1);
  if (candidate.private !== false) assert.match(result.stderr, /private/);
});

test('release-authority hardening is prepared with a tag ruleset, a protected environment and operator docs', async () => {
  const ruleset = JSON.parse(await readFile(new URL('../release-authority/tag-ruleset.json', import.meta.url)));
  assert.equal(ruleset.name, 'chi release tags');
  assert.equal(ruleset.target, 'tag');
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.conditions.ref_name, { include: ['refs/tags/chi-v*'], exclude: [] });
  assert.deepEqual(ruleset.rules.map(rule => rule.type).sort(), ['creation']);
  assert.ok(ruleset.bypass_actors.every(actor => actor.bypass_mode === 'always' && Number.isSafeInteger(actor.actor_id)));
  assert.deepEqual(ruleset.bypass_actors, [{ actor_id: 17977117, actor_type: 'User', bypass_mode: 'always' }]);
  const immutable = JSON.parse(await readFile(new URL('../release-authority/immutable-tag-ruleset.json', import.meta.url)));
  assert.deepEqual(immutable.bypass_actors, []);
  assert.deepEqual(immutable.rules, [{ type: 'update' }, { type: 'deletion' }]);
  assert.deepEqual(immutable.conditions, ruleset.conditions);
  const environment = JSON.parse(await readFile(new URL('../release-authority/npm-release-environment.json', import.meta.url)));
  assert.equal(environment.prevent_self_review, false);
  assert.equal(environment.can_admins_bypass, false);
  assert.ok(environment.reviewers.length > 0 && environment.reviewers.every(reviewer => ['User', 'Team'].includes(reviewer.type) && Number.isSafeInteger(reviewer.id)));
  assert.deepEqual(environment.deployment_branch_policy, { protected_branches: false, custom_branch_policies: true });
  const docs = await readFile(new URL('../release-authority/README.md', import.meta.url), 'utf8');
  assert.match(docs, /gh api --method POST repos\/\$REPO\/rulesets/);
  assert.match(docs, /environments\/npm-release/);
  assert.match(docs, /deployment-branch-policies/);
  assert.match(docs, /custom_branch_policies: true/);
  assert.match(docs, /environment: npm-release/);
  assert.match(docs, /requires a \*\*public\*\* source repository/);
  assert.match(docs, /not independent human/);
  assert.match(docs, /no bypass actors/);
  assert.match(docs, /CHI_RELEASES_CONTENTS_TOKEN/);
  assert.match(docs, /henkaku-center\/chi-releases/);
  assert.match(docs, /Allow administrators to bypass/);
  assert.doesNotMatch(docs, /legacy tag-protection/);
  assert.match(docs, /never proof that settings were applied/);
});
