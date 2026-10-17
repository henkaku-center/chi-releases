import { cp, mkdtemp, open, readFile, rename, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Owned, directories, regular, stat, digest, syncDirectory } from './files.js';
import { createPlan, compareVersions, parseChoices, type Choices, type Plan, type Host } from './plan.js';
import { system, CommandFailure, cleanEnvironment, buildEnvironment, installTools, tarFiles, type System } from './system.js';
import { configFiles, launcher, services, toolLauncher } from './config.js';
import { version } from './pins.js';
import { plugin } from './plugin.js';
import { verifyRegistry, attestationURL, verifyProvenance, type Metadata } from './registry.js';

export interface Options { confirmed: boolean; dryRun?: boolean; io?: System; env?: NodeJS.ProcessEnv; confirmChanges?: (diff: unknown) => Promise<boolean> }
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
function commands(plan: Plan, io: System, env: NodeJS.ProcessEnv) {
  return (command: string, args: string[], cwd = plan.root, inherit = false) => io.run({ command, args, cwd, env, inherit });
}
async function checkout(repo: string, commit: string, path: string, run: ReturnType<typeof commands>) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(repo)) throw new Error('Invalid source pin');
  await run('git', ['clone', '--no-checkout', `https://github.com/${repo}.git`, path]);
  await run('git', ['checkout', '--detach', commit], path);
  if ((await run('git', ['rev-parse', 'HEAD'], path)).toString().trim() !== commit) throw new Error('Source pin mismatch');
}
async function build(owned: Owned, plan: Plan, io: System, env: NodeJS.ProcessEnv, paseoOnly = false): Promise<string> {
  await directories(join(plan.root, 'logs'), true);
  const directory = await mkdtemp(join(plan.root, 'logs/build-')), path = join(directory, 'stderr.log');
  const log = await open(path, 'wx', 0o600);
  let succeeded = false;
  try {
    const release = await buildRelease(owned, plan, { ...io, run: input => io.run({ ...input, buildLog: log.fd }) }, env, paseoOnly);
    succeeded = true; return release;
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : 'Build failed'}; private build error log: ${path}`);
  } finally {
    await log.sync(); await log.close();
    if (succeeded) await rm(directory, { recursive: true });
  }
}
async function buildRelease(owned: Owned, plan: Plan, io: System, env: NodeJS.ProcessEnv, paseoOnly: boolean): Promise<string> {
  if (!paseoOnly && JSON.stringify(plan.pins.chi) !== JSON.stringify(plugin.source)) throw new Error('Bundled plugin does not match the recorded source pin');
  if (!paseoOnly && createHash('sha256').update(JSON.stringify(plugin.files)).digest('hex') !== plugin.source.payloadSha256) throw new Error('Bundled plugin payload integrity mismatch');
  const root = plan.root;
  await directories(join(root, 'releases'), true);
  const release = await mkdtemp(join(root, 'releases/stage-'));
  const buildEnv = buildEnvironment(root, env.PATH);
  await directories(buildEnv.HOME, true);
  const run = commands(plan, io, buildEnv);
  const node = join(root, 'bin/node'), npm = join(root, 'npm/bin/npm-cli.js');
  const tools = join(root, 'tools');
  for (const file of ['package.json', 'package-lock.json']) await owned.write(join(tools, file), await readFile(join(packageRoot, 'toolchain', file)));
  await run(node, [npm, 'ci', '--prefix', tools]);
  buildEnv.PATH = `${join(tools, 'node_modules/.bin')}:${buildEnv.PATH}`;
  const paseo = join(release, 'paseo'), opencode = join(release, 'opencode');
  await checkout(plan.pins.paseo.repository, plan.pins.paseo.commit, paseo, run);
  await run(node, [npm, 'ci'], paseo);
  // The pinned fork's clean build scripts preserve the dependency order without
  // nesting its three-process concurrently runner inside the installer's budget.
  await run(node, [npm, 'run', 'build:server:clean'], paseo);
  // The supervisor retains its absolute worker entry. Dispatch only at process
  // startup so an active worker keeps all imports on its immutable release.
  const worker = join(paseo, 'packages/server/dist/server/server/daemon-worker.js');
  await rename(worker, worker.replace(/\.js$/, '-impl.js'));
  await writeFile(worker, `import { readFileSync } from 'node:fs';\nimport { pathToFileURL } from 'node:url';\nimport { join } from 'node:path';\nconst { path } = JSON.parse(readFileSync(${JSON.stringify(join(root, 'active-paseo.json'))}, 'utf8'));\nawait import(pathToFileURL(join(path, 'packages/server/dist/server/server/daemon-worker-impl.js')).href);\n`, { mode: 0o600 });
  if (paseoOnly) return release;
  await checkout(plan.pins.opencode.repository, plan.pins.opencode.commit, opencode, run);
  await run('bun', ['install', '--frozen-lockfile', '--os=*', '--cpu=*'], opencode);
  await io.run({ command: 'bun', args: ['run', 'packages/cli/script/build.ts', '--skip-install', `--target=opencode-${plan.host.platform}-${plan.host.arch}`], cwd: opencode, env: { ...buildEnv, OPENCODE_VERSION: plan.pins.opencode.version, OPENCODE_CHANNEL: 'latest' } });
  const binary = join(opencode, `packages/cli/dist/cli-${plan.host.platform}-${plan.host.arch}/bin/opencode`);
  if (!(await run(binary, ['--version'])).toString().split(/\s+/).some(word => word === plan.pins.opencode.version || word === `v${plan.pins.opencode.version}`)) throw new Error('OpenCode build version mismatch');
  await cp(binary, join(release, 'opencode-bin'), { errorOnExist: true, force: false });
  const target = join(release, 'plugin');
  await directories(target, true);
  for (const [name, text] of Object.entries(plugin.files)) {
    if (!/^(?:package(?:-lock)?\.json|[A-Za-z0-9-]+\.js)$/.test(name)) throw new Error('Invalid bundled plugin path');
    await writeFile(join(target, name), text, { flag: 'wx', mode: 0o600 });
  }
  await run(node, [npm, 'ci', '--ignore-scripts'], target);
  return release;
}
async function retainInstaller(owned: Owned) {
  for (const directory of ['dist', 'toolchain']) {
    for (const name of await readdir(join(packageRoot, directory))) {
      if (!/^[a-zA-Z0-9.-]+\.(?:js|json)$/.test(name)) continue;
      await owned.write(join(owned.root, 'installer', directory, name), await readFile(join(packageRoot, directory, name)));
    }
  }
  // Retained .js files are ESM even on bootstrap Node versions without detection.
  await owned.write(join(owned.root, 'installer/package.json'), await readFile(join(packageRoot, 'package.json')));
}
async function health(plan: Plan, io: System, env: NodeJS.ProcessEnv, previousPid?: number): Promise<number> {
  const run = commands(plan, io, env), entry = join(plan.root, 'bin/chi-launch.mjs'), node = join(plan.root, 'bin/node');
  const paseo = await activePaseo(plan);
  if ((await run('git', ['rev-parse', 'HEAD'], paseo)).toString().trim() !== plan.pins.paseo.commit) throw new Error('Runtime source pin mismatch');
  const status = JSON.parse((await run(node, [entry, 'paseo', 'daemon', 'status', '--json'])).toString());
  const expected = JSON.parse(await readFile(join(paseo, 'packages/server/package.json'), 'utf8')).version;
  if (status.localDaemon !== 'running' || status.connectedDaemon !== 'reachable' || status.home !== join(plan.root, 'state/paseo') || status.daemonVersion !== expected || !Number.isSafeInteger(status.workerPid) || status.workerPid <= 0 || status.workerPid === previousPid || status.note) throw new Error('Owned Paseo health/version check failed');
  const url = (await run(node, [entry, 'opencode', 'service', 'status'])).toString().trim();
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/.test(url)) throw new Error('Owned OpenCode service is not healthy');
  const info = JSON.parse((await run(node, [entry, 'opencode', 'api', 'get', '/api/info'])).toString());
  if (info.version !== plan.pins.opencode.version || !Number.isSafeInteger(info.pid) || info.pid <= 0) throw new Error('Owned OpenCode version check failed');
  return status.workerPid;
}
function releasePath(plan: Plan, path: unknown): string {
  if (typeof path !== 'string' || !(path === join(plan.root, 'runtime/paseo') || (dirname(dirname(path)) === join(plan.root, 'releases') && path.endsWith('/paseo')))) throw new Error('Invalid owned release pointer');
  return path;
}
async function activePaseo(plan: Plan): Promise<string> {
  const bytes = await regular(join(plan.root, 'active-paseo.json'));
  if (!bytes) throw new Error('Missing owned release pointer');
  const path = releasePath(plan, JSON.parse(bytes.toString()).path);
  await directories(path, false);
  return path;
}
// Dry runs must report the same journaled paths a real action would touch, but
// must never create, lock or mutate anything. A fresh host has no journal.
async function installed(plan: Plan): Promise<Owned | null> {
  if (!await stat(plan.root)) return null;
  return await Owned.load(plan, false);
}
function manifestPaths(owned: Owned | null): string[] {
  return owned ? [...Object.keys(owned.journal.files), ...Object.keys(owned.journal.trees ?? {})] : [];
}
async function activate(owned: Owned, path: string) {
  releasePath(owned.journal.plan, path);
  await owned.write(join(owned.root, 'active-paseo.json'), JSON.stringify({ path }) + '\n');
}
async function waitForHealth(plan: Plan, io: System, env: NodeJS.ProcessEnv, previousPid?: number) {
  for (let attempt = 0;; attempt++) {
    try { return await health(plan, io, env, previousPid); }
    catch (error) { if (attempt >= 29) throw error; await io.sleep(1000); }
  }
}
async function supervise(owned: Owned, io: System, env: NodeJS.ProcessEnv, remove = false) {
  const plan = owned.journal.plan, run = commands(plan, io, env);
  const files = services(plan);
  if (plan.host.platform === 'darwin') {
    for (const path of Object.keys(files)) {
      const label = path.split('/').at(-1)!.replace('.plist', '');
      if (remove && !owned.journal.files[path]) continue;
      let loaded = false;
      try { await run('launchctl', ['print', `gui/${plan.host.uid}/${label}`]); loaded = true; }
      catch (error) {
        // launchctl's service-not-found status is 113. Permission/domain/tool
        // failures are not evidence of absence and must stop the lifecycle action.
        if (!(error instanceof CommandFailure) || error.exitCode !== 113) throw error;
      }
      if (loaded && !owned.journal.files[path]) throw new Error('Refusing to adopt a loaded service');
      if (remove) {
        if (loaded) await run('launchctl', ['bootout', `gui/${plan.host.uid}/${label}`]);
      }
      else {
        await owned.write(path, files[path]!);
        if (!loaded) await run('launchctl', ['bootstrap', `gui/${plan.host.uid}`, path]);
      }
    }
  } else {
    for (const path of Object.keys(files)) {
      if (remove && !owned.journal.files[path]) continue;
      const unit = path.split('/').at(-1)!;
      const fragment = (await run('systemctl', ['--user', 'show', unit, '--property=FragmentPath', '--value'])).toString().trim();
      if (fragment && (fragment !== path || !owned.journal.files[path])) throw new Error('Refusing to adopt a foreign systemd service');
    }
    if (!remove) {
      for (const [path, bytes] of Object.entries(files)) await owned.write(path, bytes);
      const linger = (await run('loginctl', ['show-user', String(plan.host.uid), '--property=Linger', '--value'])).toString().trim();
      if (owned.journal.lingerWasEnabled === undefined) { owned.journal.lingerWasEnabled = linger === 'yes'; await owned.save(); }
      if (linger !== 'yes') {
        if (!plan.choices.linger) throw new Error('Confirm linger to supervise this installation at boot');
        await run('loginctl', ['enable-linger', String(plan.host.uid)]);
        if ((await run('loginctl', ['show-user', String(plan.host.uid), '--property=Linger', '--value'])).toString().trim() !== 'yes') throw new Error('User linger was not enabled');
      }
      await run('systemctl', ['--user', 'daemon-reload']);
    }
    const units = Object.keys(files).filter(p => !p.endsWith('update.service') && (!remove || owned.journal.files[p])).map(p => p.split('/').at(-1)!);
    if (units.length) await run('systemctl', ['--user', remove ? 'disable' : 'enable', '--now', ...units]);
  }
}
export async function install(plan: Plan, options: Options): Promise<unknown> {
  if (options.dryRun) return { action: 'install', plan, files: Object.keys(configFiles(plan)), services: services(plan), steps: ['verify pinned Node24/gh/gitleaks', 'gh auth status', 'build exact source pins', 'write owned configuration', 'activate supervision', 'health checks', 'pair in terminal'] };
  if (!options.confirmed) throw new Error('Confirm destinations, audiences, ask permissions, supervision and auto-update before installation');
  const io = options.io ?? system, env = cleanEnvironment(plan, options.env ?? process.env);
  const owned = await Owned.load(plan, true);
  return owned.lock(async () => {
    await owned.verify();
    if (owned.journal.phase === 'uninstalled') throw new Error('Installation was uninstalled; retained state needs explicit reconciliation before reinstall');
    if (JSON.stringify(owned.journal.plan.choices) !== JSON.stringify(plan.choices)) throw new Error('Existing consent differs; configuration is not silently changed');
    // Resume the recorded build, never relabel old binaries with the caller's pins.
    if ((owned.journal.initial || owned.journal.release) && !owned.journal.built) throw new Error('Built pins were not recorded; inspect and reconcile this legacy installation');
    const requested = plan;
    plan = { ...owned.journal.plan, ...(owned.journal.built ?? {}) };
    if (JSON.stringify(plan) !== JSON.stringify(requested)) console.error('Resuming recorded installer inputs (use reconfigure to select fresh inputs): ' + JSON.stringify({ version: plan.version, pins: plan.pins, artifacts: plan.artifacts }));
    for (const path of owned.servicePaths()) await directories(dirname(path), false);
    const run = commands(plan, io, env);
    await installTools(owned, io, env);
    try { await run(join(plan.root, 'bin/gh'), ['auth', 'status']); }
    catch { throw new Error(`GitHub login required: use ${join(plan.root, 'bin/gh')} auth login with your own account, then retry`); }
    if (owned.journal.phase === 'installed') {
      if (owned.journal.pending) throw new Error('Recover interrupted activation with update');
      await health(owned.journal.plan, io, env); return { status: 'already-installed', root: plan.root };
    }
    const runtime = join(plan.root, 'runtime');
    if (!owned.journal.release) {
      if (!owned.journal.initial) {
        if (await stat(runtime)) throw new Error('Runtime already exists; inspect interrupted installation');
        owned.journal.initial = await build(owned, plan, io, env);
        owned.journal.built = { pins: plan.pins, artifacts: plan.artifacts }; await owned.save();
      }
      const staged = owned.journal.initial;
      if (dirname(staged) !== join(plan.root, 'releases')) throw new Error('Invalid initial release path');
      if (await stat(staged)) {
        if (await stat(runtime)) throw new Error('Ambiguous initial activation');
        await rename(staged, runtime); await syncDirectory(plan.root);
      }
      await directories(runtime, false);
      if (!(await stat(runtime))) throw new Error('Missing staged runtime');
      owned.journal.release = owned.journal.built!.pins.paseo.commit; delete owned.journal.initial; await owned.save();
    }
    await activate(owned, join(runtime, 'paseo'));
    for (const [path, bytes] of Object.entries(configFiles(plan))) {
      if (owned.statePaths().includes(path)) await owned.writeState(path, bytes);
      else await owned.write(path, bytes);
    }
    await owned.write(join(plan.root, 'bin/chi-launch.mjs'), launcher(plan), 0o700);
    for (const tool of ['opencode', 'paseo'] as const) await owned.write(join(plan.root, 'bin', tool), toolLauncher(plan, tool), 0o700);
    await retainInstaller(owned);
    await supervise(owned, io, env);
    await waitForHealth(plan, io, env);
    owned.journal.plan = plan;
    owned.journal.phase = 'installed'; await owned.save();
    return { status: 'installed-awaiting-pairing', root: plan.root, app: plan.web.appBaseUrl };
  });
}
export async function pair(plan: Plan, options: Options) {
  if (options.dryRun) return { action: 'pair', app: plan.web.appBaseUrl };
  if (!options.confirmed) throw new Error('Confirm pairing');
  if (!options.io && !process.stdout.isTTY) throw new Error('Pairing requires an interactive terminal; stdout is redirected');
  const owned = await Owned.load(plan, false);
  const io = options.io ?? system;
  await owned.lock(async () => {
    await owned.verify();
    if (owned.journal.phase !== 'installed' || owned.journal.pending) throw new Error('Complete installation/update before pairing');
    plan = owned.journal.plan;
    const env = cleanEnvironment(plan, options.env ?? process.env);
    await health(plan, io, env);
    await commands(plan, io, env)(join(plan.root, 'bin/node'), [join(plan.root, 'bin/chi-launch.mjs'), 'paseo', 'daemon', 'pair'], plan.root, true);
  });
  return { status: 'offer-shown', app: plan.web.appBaseUrl };
}
export async function uninstall(plan: Plan, options: Options) {
  if (options.dryRun) {
    const owned = await installed(plan);
    return { action: 'uninstall', root: plan.root, files: manifestPaths(owned), services: services(owned?.journal.plan ?? plan), retain: ['runtime state', 'builds', 'edited files', 'linger'] };
  }
  if (!options.confirmed) throw new Error('Confirm uninstall');
  const owned = await Owned.load(plan, false), io = options.io ?? system;
  return owned.lock(async () => {
    if (owned.journal.reconfigure) throw new Error('Complete interrupted reconfigure before uninstall');
    if (owned.journal.pending) throw new Error('Recover interrupted update before uninstall');
    // Service bytes must still be ours before sending service-manager commands.
    for (const path of owned.servicePaths()) {
      const bytes = await regular(path);
      if (bytes && digest(bytes) !== owned.journal.files[path]) throw new Error('Service was edited; stop and reconcile it manually');
    }
    if (owned.journal.phase !== 'uninstalled') await supervise(owned, io, cleanEnvironment(plan, options.env ?? process.env), true);
    const retained: string[] = [];
    for (const path of Object.keys(owned.journal.files)) {
      if (owned.statePaths().includes(path) || path.startsWith(join(plan.root, 'state') + '/') || path.startsWith(join(plan.root, 'data') + '/') || path === join(plan.root, 'choices.json')) { retained.push(path); continue; }
      if (!await owned.remove(path)) retained.push(path);
    }
    for (const path of Object.keys(owned.journal.trees ?? {})) if (!await owned.removeTree(path)) retained.push(path);
    if (plan.host.platform === 'linux') await commands(plan, io, cleanEnvironment(plan, options.env ?? process.env))('systemctl', ['--user', 'daemon-reload']);
    owned.journal.phase = 'uninstalled'; await owned.save();
    // Report actual remaining paths (including interrupted stages and edited trees).
    for (const name of await readdir(plan.root)) if (name !== '.install-lock') retained.push(join(plan.root, name));
    for (const path of [...owned.statePaths(), join(plan.root, 'tools/node_modules')]) if (await stat(path)) retained.push(path);
    return { status: 'uninstalled', retained: [...new Set([...retained, plan.root, 'user linger'])] };
  });
}
function consentDiff(before: Choices, after: Choices) {
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key as keyof Choices]) !== JSON.stringify(after[key as keyof Choices])).map(key => [key, { before: before[key as keyof Choices] ?? null, after: after[key as keyof Choices] ?? null }]));
}
export async function reconfigure(plan: Plan, options: Options) {
  const owned = await Owned.load(plan, false);
  const preview = () => ({ action: 'reconfigure', diff: consentDiff(owned.journal.plan.choices, plan.choices), effects: ['Stop owned services (finish active work first)', 'Archive the entire old installation privately under retained/', 'Start fresh: pairing and provider login must be repeated; no state or credentials are copied'] });
  if (options.dryRun) return preview();
  return owned.lock(async () => {
    if (owned.journal.pending) throw new Error('Recover interrupted update before reconfigure');
    // Reconfigure archives edits rather than executing or deleting owned runtime
    // files. Only service definitions need byte ownership before stopping them.
    if (!options.confirmChanges || !await options.confirmChanges(preview())) throw new Error('Reconfigure requires confirmation of the consent diff and fresh-state effects');
    const io = options.io ?? system, env = cleanEnvironment(owned.journal.plan, options.env ?? process.env);
    if (!owned.journal.reconfigure) {
      await directories(join(plan.root, 'retained'), true);
      const archive = await mkdtemp(join(plan.root, 'retained/reconfigure-'));
      const entries = (await readdir(plan.root)).filter(name => !['retained', 'ownership.json', '.install-lock'].includes(name));
      const backup = await open(join(archive, 'ownership.json'), 'wx', 0o600);
      try { await backup.writeFile(JSON.stringify(owned.journal, null, 2) + '\n'); await backup.sync(); } finally { await backup.close(); }
      await syncDirectory(archive); await syncDirectory(dirname(archive));
      owned.journal.reconfigure = { plan, archive, entries, services: owned.servicePaths().some(path => !!owned.journal.files[path]) }; await owned.save();
    }
    const intent = owned.journal.reconfigure;
    if (JSON.stringify(intent.plan) !== JSON.stringify(plan)) throw new Error('Resume reconfigure with the exact confirmed plan');
    parseChoices(intent.plan.choices);
    if (dirname(intent.archive) !== join(plan.root, 'retained') || !/^reconfigure-[a-zA-Z0-9]+$/.test(intent.archive.split('/').at(-1)!) || intent.entries.some(name => !name || name.includes('/') || name.includes('\\') || ['.', '..', 'retained', 'ownership.json', '.install-lock'].includes(name))) throw new Error('Invalid reconfigure archive intent');
    await directories(intent.archive, false);
    // Check service ownership again on interrupted attempts before any stop action.
    for (const path of owned.servicePaths()) {
      const bytes = await regular(path);
      if (bytes && digest(bytes) !== owned.journal.files[path]) throw new Error('Service was edited; reconcile it before reconfigure');
    }
    if (intent.services) await supervise(owned, io, env, true);
    for (const path of owned.servicePaths()) if (owned.journal.files[path] && !await owned.remove(path)) throw new Error('Service changed during reconfigure');
    if (intent.services && plan.host.platform === 'linux') await commands(plan, io, env)('systemctl', ['--user', 'daemon-reload']);
    for (const name of intent.entries) {
      const from = join(plan.root, name), to = join(intent.archive, name);
      if (await stat(from)) {
        if (await stat(to)) throw new Error('Reconfigure archive collision');
        await rename(from, to);
        await syncDirectory(intent.archive); await syncDirectory(plan.root);
      } else if (!await stat(to)) throw new Error('Missing reconfigure archive entry');
    }
    owned.journal = { schema: 1, owner: 'chi-installer', root: plan.root, plan, files: {}, phase: 'building', lingerWasEnabled: owned.journal.lingerWasEnabled };
    await owned.save();
    return { status: 'reconfigured-awaiting-install', retained: intent.archive, next: 'Run install with the same choices; pair and log in to providers again' };
  });
}
export async function update(plan: Plan, options: Options) {
  if (options.dryRun) {
    const owned = await installed(plan);
    return { action: 'update', plan, files: manifestPaths(owned), services: services(owned?.journal.plan ?? plan), restart: ['paseo', 'daemon', 'restart', '--wait-idle'] };
  }
  if (!options.confirmed) throw new Error('Confirm update');
  const owned = await Owned.load(plan, false), io = options.io ?? system;
  return owned.lock(async () => {
    await owned.verify();
    const old = owned.journal.plan;
    if (compareVersions(plan.version, old.version) < 0) throw new Error('Refusing installer downgrade');
    if (owned.journal.phase !== 'installed') throw new Error('Complete installation before update');
    if (JSON.stringify(old.choices) !== JSON.stringify(plan.choices)) throw new Error('Update cannot change consent');
    const env = cleanEnvironment(plan, options.env ?? process.env), run = commands(plan, io, env);
    if (owned.journal.pending) await rollback(owned, io, env);
    if (!owned.journal.built || JSON.stringify(owned.journal.built) !== JSON.stringify({ pins: old.pins, artifacts: old.artifacts })) throw new Error('Built inputs are missing or disagree with the recorded plan; reconcile before update');
    if (JSON.stringify(old.pins.opencode) !== JSON.stringify(plan.pins.opencode) || JSON.stringify(old.pins.chi) !== JSON.stringify(plan.pins.chi) || JSON.stringify(old.artifacts) !== JSON.stringify(plan.artifacts)) throw new Error('OpenCode/plugin/tool update requires verified idle native sessions; activation deferred');
    if (JSON.stringify(old.web) !== JSON.stringify(plan.web)) throw new Error('Hosted app/relay change requires separately confirmed configuration');
    if (JSON.stringify(old.pins.paseo) === JSON.stringify(plan.pins.paseo)) {
      await health(old, io, env);
      await retainInstaller(owned);
      owned.journal.plan = plan; await owned.save();
      return { status: 'up-to-date' };
    }
    const release = await build(owned, plan, io, env, true);
    const previous = await activePaseo(old);
    // A Paseo-only source update can still replace the bundled capture tooling.
    // Without a verified native drain it must not cross the activation pointer.
    const helper = 'vendor/henkaku-center-chi-native-0.0.0.tgz';
    const previousHelper = await regular(join(previous, helper));
    const nextHelper = await regular(join(release, 'paseo', helper));
    if (!previousHelper || !nextHelper || digest(previousHelper) !== digest(nextHelper)) {
      await rm(release, { recursive: true, force: true });
      throw new Error('Bundled native tooling update requires verified idle native sessions; activation deferred');
    }
    const oldPid = await health(old, io, env);
    owned.journal.pending = join(release, 'paseo'); owned.journal.previous = previous; await owned.save();
    try {
      await activate(owned, owned.journal.pending);
      await run(join(plan.root, 'bin/node'), [join(plan.root, 'bin/chi-launch.mjs'), 'paseo', 'daemon', 'restart', '--wait-idle']);
      await waitForHealth(plan, io, env, oldPid);
    } catch (error) {
      await rollback(owned, io, env);
      throw error;
    }
    await retainInstaller(owned);
    owned.journal.plan = plan; owned.journal.release = plan.pins.paseo.commit;
    owned.journal.built = { pins: plan.pins, artifacts: plan.artifacts };
    delete owned.journal.pending; delete owned.journal.previous; await owned.save();
    return { status: 'updated', commit: plan.pins.paseo.commit };
  });
}
async function rollback(owned: Owned, io: System, env: NodeJS.ProcessEnv) {
  const { pending, previous, plan } = owned.journal;
  if (!pending || !previous) throw new Error('Invalid interrupted activation');
  releasePath(plan, pending); releasePath(plan, previous);
  await directories(previous, false);
  await activate(owned, previous);
  // A failure may happen after the new worker has started. Restore the pointer AND
  // restart gracefully back onto it; keep recovery intent until health succeeds.
  const run = commands(plan, io, env);
  await run(join(plan.root, 'bin/node'), [join(plan.root, 'bin/chi-launch.mjs'), 'paseo', 'daemon', 'restart', '--wait-idle']);
  await waitForHealth(plan, io, env);
  delete owned.journal.pending; delete owned.journal.previous; await owned.save();
}
export async function autoUpdate(plan: Plan, options: Options) {
  if (options.dryRun) return { action: 'auto-update', registry: 'https://registry.npmjs.org/@henkaku-center%2fchi/latest', restart: '--wait-idle' };
  const owned = await Owned.load(plan, false);
  await owned.lock(async () => {
    await owned.verify();
    if (owned.journal.phase !== 'installed' || !owned.journal.plan.choices.autoUpdate) throw new Error('Auto-update was not confirmed for an installed runtime');
  });
  const io = options.io ?? system;
  const metadata = JSON.parse((await io.download('https://registry.npmjs.org/@henkaku-center%2fchi/latest', true)).toString()) as Metadata;
  if (metadata.name !== '@henkaku-center/chi' || !/^1\.\d+\.\d+$/.test(metadata.version)) return { status: 'no-approved-release' };
  if (compareVersions(metadata.version, version) <= 0 || compareVersions(metadata.version, owned.journal.plan.version) <= 0) return { status: 'up-to-date' };
  verifyRegistry(metadata);
  const bytes = await io.download(metadata.dist.tarball, true);
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== metadata.dist.integrity) throw new Error('Installer integrity mismatch');
  verifyProvenance(metadata, await io.download(attestationURL(metadata), true));
  const entries = tarFiles(bytes), manifest = JSON.parse(entries.get('package/package.json')?.toString() || '{}');
  if (manifest.name !== metadata.name || manifest.version !== metadata.version || !entries.has('package/dist/cli.js')) throw new Error('Installer package mismatch');
  const target = join(plan.root, 'updates', metadata.version);
  await owned.lock(async () => {
    await owned.verify();
    if (owned.journal.phase !== 'installed' || !owned.journal.plan.choices.autoUpdate) throw new Error('Installation changed during update download');
    for (const [path, data] of entries) if (/^package\/(?:dist\/[a-zA-Z0-9.-]+\.js|toolchain\/[a-zA-Z0-9.-]+\.json|package\.json)$/.test(path)) await owned.write(join(target, path.slice(8)), data);
  });
  const env = { ...cleanEnvironment(plan, options.env ?? process.env), XDG_DATA_HOME: plan.host.data, XDG_CONFIG_HOME: plan.host.config };
  // New installer owns the same exclusive update path; no lifecycle scripts run.
  await commands(plan, io, env)(join(plan.root, 'bin/node'), [join(target, 'dist/cli.js'), 'update', '--confirmed', '--choices', join(plan.root, 'choices.json')]);
  return { status: 'update-invoked', version: metadata.version };
}
export async function storedPlan(host: Host): Promise<Plan> {
  const root = join(host.data, 'chi');
  const bytes = await regular(join(root, 'choices.json'));
  if (!bytes) throw new Error('No owned choices; use install --choices FILE');
  return createPlan(JSON.parse(bytes.toString()) as Choices, host);
}
