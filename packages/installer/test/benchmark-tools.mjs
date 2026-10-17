// Opt-in real-archive benchmark. Downloads only official pinned tools; executes
// their version commands, never auth, builds, pairing or service managers.
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.argv[2] !== '--real-tools') throw new Error('Opt in with --real-tools; this downloads official archives');
const dist = process.argv[3] ?? fileURLToPath(new URL('../dist', import.meta.url));
const { Owned } = await import(pathToFileURL(join(dist, 'files.js')));
const { createPlan, hostFrom } = await import(pathToFileURL(join(dist, 'plan.js')));
const { system, installTools, cleanEnvironment } = await import(pathToFileURL(join(dist, 'system.js')));
const home = await mkdtemp(join(tmpdir(), 'chi-tools-benchmark-'));
const plan = createPlan({ endpoint: 'https://example.test', name: 'benchmark', mappings: [], permissions: 'ask', autoUpdate: false, linger: false }, hostFrom({ HOME: home }));
const owned = await Owned.load(plan, true), cache = join(home, 'archives');
await mkdir(cache, { mode: 0o700 });
for (const [name, artifact] of Object.entries(plan.artifacts)) await writeFile(join(cache, name), await system.download(artifact.url), { mode: 0o600 });
const io = { ...system, download: url => readFile(join(cache, Object.entries(plan.artifacts).find(([, artifact]) => artifact.url === url)[0])) };
const start = performance.now();
await owned.lock(() => installTools(owned, io, cleanEnvironment(plan, { PATH: '/usr/bin:/bin' })));
const installMs = performance.now() - start, entries = Object.keys(owned.journal.files).length + Object.keys(owned.journal.trees ?? {}).length;
const remove = performance.now();
await owned.lock(async () => {
  for (const path of Object.keys(owned.journal.files)) await owned.remove(path);
  for (const path of Object.keys(owned.journal.trees ?? {})) await owned.removeTree(path);
});
console.log(JSON.stringify({ home, installMs, uninstallMs: performance.now() - remove, entries }));
