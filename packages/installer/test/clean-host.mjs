// Real supervision and encrypted pairing on an ephemeral hosted macOS runner.
// Never run against a daily host. GitHub auth-status is synthetic; no account,
// model, repository mapping or public relay/backend is used by this fixture.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { createPlan, hostFrom } from '../dist/plan.js';
import { install, uninstall } from '../dist/install.js';
import { system } from '../dist/system.js';

assert(process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && process.platform === 'darwin', 'Requires the actual hosted macOS CI job, not a local HOME simulation');
assert(process.env.RUNNER_TEMP, 'Missing job temporary directory');
const out = join(process.env.RUNNER_TEMP, 'chi-clean-host');
await mkdir(out, { mode: 0o700 });
const env = { HOME: join(out, 'home'), XDG_CONFIG_HOME: join(out, 'config'), XDG_DATA_HOME: join(out, 'data'), XDG_STATE_HOME: join(out, 'state'), XDG_CACHE_HOME: join(out, 'cache'), TMPDIR: join(out, 'tmp'), PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, WRANGLER_SEND_METRICS: 'false' };
for (const [key, value] of Object.entries(env)) if (key.endsWith('HOME') || key === 'TMPDIR') await mkdir(value, { recursive: true, mode: 0o700 });
const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
const plan = structuredClone(createPlan({ endpoint: 'https://example.invalid/api', name: 'Isolated acceptance', mappings: [], permissions: 'ask', autoUpdate: false, linger: false }, hostFrom(env)));
plan.web.relayUrl = `ws://127.0.0.1:${port}`;
const report = { platform: process.platform, arch: process.arch, node: process.version, authBoundary: 'synthetic status; no user credentials', modelTurnsRequested: 0, mappedRepositories: 0, stages: [] };
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
let relay, client, installing = false;
async function startRelay() {
  report.stages.push({ program: 'local-relay', operation: 'startup' }); await save();
  const paseo = join(plan.root, 'runtime/paseo');
  const require = createRequire(join(paseo, 'packages/relay/package.json'));
  const config = join(out, 'relay.json');
  // Reuse the real pinned relay implementation, with no remote cutover upstream,
  // routes, account binding or metrics. Its local workerd store is fixture-owned.
  await writeFile(config, JSON.stringify({ name: 'chi-installer-acceptance', main: join(paseo, 'packages/relay/src/cloudflare-adapter.ts'), compatibility_date: '2024-12-01', durable_objects: { bindings: [{ name: 'RELAY', class_name: 'RelayDurableObject' }] }, migrations: [{ tag: 'v1', new_sqlite_classes: ['RelayDurableObject'] }] }), { mode: 0o600 });
  relay = spawn(process.execPath, [require.resolve('wrangler/bin/wrangler.js'), 'dev', '--config', config, '--local', '--ip', '127.0.0.1', '--port', String(port), '--live-reload=false', '--show-interactive-dev-session=false'], { cwd: out, env, stdio: ['ignore', 'ignore', 'ignore'] });
  let spawnFailed = false; relay.once('error', () => { spawnFailed = true; });
  const deadline = Date.now() + 60_000;
  for (;;) {
    assert.equal(relay.exitCode, null, 'Local relay exited');
    assert.equal(spawnFailed, false, 'Local relay spawn failed');
    const ready = await new Promise(resolve => { const socket = connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => { socket.destroy(); resolve(false); }); });
    if (ready) return;
    assert(Date.now() < deadline, 'Local relay readiness deadline');
    await system.sleep(100);
  }
}
const io = { ...system, async run(input) {
  if (basename(input.command) === 'gh' && input.args.join(' ') === 'auth status') return Buffer.from('');
  if (installing && basename(input.command) === 'launchctl' && !relay) await startRelay();
  const started = performance.now();
  const operation = ['pair', 'build:server:clean', 'packages/cli/script/build.ts', 'ci', 'clone', 'checkout', '--version', 'version', 'bootstrap', 'bootout', 'print', 'status', '/api/info'].find(value => input.args.includes(value)) || basename(input.args[0] || 'command');
  try { return await system.run(input); }
  finally { report.stages.push({ program: basename(input.command), operation, elapsedMs: Math.round(performance.now() - started) }); await save(); }
} };
try {
  installing = true;
  const result = await install(plan, { confirmed: true, io, env });
  installing = false;
  assert.equal(result.status, 'installed-awaiting-pairing');
  report.supervision = 'actual launchd and owned health checks passed';
  const paseo = join(plan.root, 'runtime/paseo');
  const require = createRequire(join(paseo, 'packages/cli/package.json'));
  const { parseConnectionOfferFromUrl } = await import(require.resolve('@getpaseo/protocol/connection-offer'));
  const { buildRelayWebSocketUrl } = await import(require.resolve('@getpaseo/protocol/daemon-endpoints'));
  const { DaemonClient } = await import(require.resolve('@getpaseo/client/internal/daemon-client'));
  // Capture in memory only: no pair URL/QR/key in logs, reports or artifacts.
  const raw = await system.run({ command: join(plan.root, 'bin/node'), args: [join(plan.root, 'bin/chi-launch.mjs'), 'paseo', 'daemon', 'pair', '--json'], cwd: out, env });
  const offer = parseConnectionOfferFromUrl(JSON.parse(raw.toString()).url);
  assert(offer && offer.relay.endpoint === `127.0.0.1:${port}` && offer.relay.useTls === false);
  client = new DaemonClient({ url: buildRelayWebSocketUrl({ endpoint: offer.relay.endpoint, useTls: false, serverId: offer.serverId, role: 'client' }), clientId: 'clsk_installer_acceptance', e2ee: { enabled: true, daemonPublicKeyB64: offer.daemonPublicKeyB64 }, connectTimeoutMs: 10_000, logger: { debug() {}, info() {}, warn() {}, error() {} } });
  await client.connect();
  const deadline = Date.now() + 10_000;
  while (!client.getLastServerInfoMessage()) { assert(Date.now() < deadline, 'Pairing server-info deadline'); await system.sleep(50); }
  assert.equal(client.getLastServerInfoMessage().serverId, offer.serverId);
  report.pairing = 'real encrypted client/server handshake through the local pinned relay';
  report.builtPins = plan.pins;
} catch (error) {
  report.failed = true;
  report.failure = { type: error?.name || 'unknown', code: typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined, exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : undefined };
  process.exitCode = 1;
}
finally {
  installing = false;
  try { await client?.close(); } catch { report.clientCloseFailed = true; process.exitCode = 1; }
  try { await uninstall(plan, { confirmed: true, io, env }); report.cleanup = 'owned services stopped'; }
  catch { report.cleanup = 'failed; inspect owned job state'; process.exitCode = 1; }
  if (relay && relay.exitCode === null && relay.signalCode === null) { const exited = once(relay, 'exit'); relay.kill('SIGTERM'); const timer = setTimeout(() => relay.kill('SIGKILL'), 5000); await exited; clearTimeout(timer); }
  await save();
  console.log(JSON.stringify(report));
}
