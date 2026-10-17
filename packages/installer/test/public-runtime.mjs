// Real source/tool/plugin build through the installer, stopping BEFORE any OS
// service action. Auth status is the sole synthetic admission boundary. This is
// not authenticated install, supervision, pairing or release acceptance.
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createPlan, hostFrom } from '../dist/plan.js';
import { install } from '../dist/install.js';
import { system } from '../dist/system.js';

assert(!process.env.CI, 'Real public source acquisition is an explicit local gate');
const out = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Usage: node test/public-runtime.mjs NEW_PRIVATE_DIRECTORY');
await mkdir(out, { mode: 0o700 });
const env = { HOME: join(out, 'home'), XDG_CONFIG_HOME: join(out, 'config'), XDG_DATA_HOME: join(out, 'data'), XDG_STATE_HOME: join(out, 'state'), XDG_CACHE_HOME: join(out, 'cache'), TMPDIR: join(out, 'tmp'), PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin` };
for (const [key, path] of Object.entries(env)) if (key !== 'PATH') await mkdir(path, { recursive: true, mode: 0o700 });
const plan = createPlan({ endpoint: 'https://example.invalid/api', name: 'Synthetic build boundary', mappings: [], permissions: 'ask', autoUpdate: false, linger: false }, hostFrom(env));
const report = { platform: process.platform, arch: process.arch, startedAt: new Date().toISOString(), authentication: 'synthetic status/local fixture tokens only; no user credentials', supervision: 'not attempted', pairing: 'not attempted', phases: [] };
const stopped = new Error('Public build complete; refusing OS service operation');
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
let sawBoundary = false;
const io = { ...system, async run(input) {
  if (basename(input.command) === 'gh' && input.args.join(' ') === 'auth status') return Buffer.from('');
  if (['launchctl', 'systemctl', 'loginctl'].includes(basename(input.command))) { sawBoundary = true; throw stopped; }
  const start = performance.now();
  if (input.command === 'git' && input.args[0] === 'clone') {
    assert([plan.pins.paseo, plan.pins.opencode].some(pin => input.args.includes(`https://github.com/${pin.repository}.git`)));
    assert.equal(input.env.GH_TOKEN, undefined); assert.equal(input.env.GH_CONFIG_DIR, undefined);
    assert.equal(input.env.GIT_CONFIG_GLOBAL, '/dev/null'); assert.equal(input.env.GIT_CONFIG_VALUE_0, '');
  }
  console.log(JSON.stringify({ phase: 'start', command: basename(input.command), args: input.args }));
  try { return await system.run(input); }
  finally { report.phases.push({ command: basename(input.command), args: input.args, elapsedMs: Math.round(performance.now() - start) }); await save(); }
} };
try {
  await install(plan, { confirmed: true, io, env });
  throw Error('Unexpected service activation');
} catch (error) {
  if (error !== stopped || !sawBoundary) { report.failure = error instanceof Error ? error.message : 'unknown'; await save(); throw error; }
}
const journal = JSON.parse(await readFile(join(plan.root, 'ownership.json'), 'utf8'));
assert.deepEqual(journal.built.pins, plan.pins);
report.builtPins = journal.built.pins;
report.opencodeSHA256 = createHash('sha256').update(await readFile(join(plan.root, 'runtime/opencode-bin'))).digest('hex');
const requirePaseo = createRequire(join(plan.root, 'runtime/paseo/packages/server/package.json'));
const { resolveConfigFromPersisted } = await import(requirePaseo.resolve('@getpaseo/server/configuration'));
const { buildRelayWebSocketUrl } = await import(requirePaseo.resolve('@getpaseo/protocol/daemon-endpoints'));
const configured = resolveConfigFromPersisted(join(plan.root, 'state/paseo'), JSON.parse(await readFile(join(plan.root, 'state/paseo/config.json'), 'utf8')), { env: {} });
const relay = new URL(buildRelayWebSocketUrl({ endpoint: configured.relayEndpoint, useTls: configured.relayUseTls, serverId: 'srv_fixture', role: 'server' }));
assert.equal(relay.origin, new URL(plan.web.relayUrl).origin);
report.relayOrigin = relay.origin;
// Run the unchanged real loader gate beside the public Paseo helper dependency.
// No shim or private helper checkout: the tested helper is the fork's public bundle.
const harness = join(plan.root, 'runtime/paseo/packages/server/chi-plugin-loader-check.mjs');
await copyFile(new URL('../../opencode-chi-mentions/test/runtime-loader.mjs', import.meta.url), harness);
try {
  const result = await system.run({ command: process.execPath, args: [harness, join(plan.root, 'runtime/opencode-bin'), join(plan.root, 'runtime/plugin'), join(out, 'native-loader')], cwd: out, env });
  await writeFile(join(out, 'native-loader.log'), result, { mode: 0o600 });
  report.nativeLoader = JSON.parse(await readFile(join(out, 'native-loader/report.json'), 'utf8'));
} finally { await rm(harness, { force: true }); }
report.completedAt = new Date().toISOString(); report.publicBuildPassed = true;
await save(); console.log(JSON.stringify(report));
