import { isAbsolute, join, resolve } from 'node:path';
import { artifacts, sources, version, web, type Platform, type Arch } from './pins.js';

export interface Choices {
  endpoint: string;
  name: string;
  mappings: { repo: string; audience: 'private' | 'shared' }[];
  permissions: 'ask';
  autoUpdate: boolean;
  linger: boolean;
  bots?: { selected: string; identities: Record<string, { name: string; email: string }> };
}
export interface Host { home: string; data: string; config: string; platform: Platform; arch: Arch; uid: number }
export interface Plan { version: string; root: string; host: Host; choices: Choices; pins: typeof sources; web: typeof web; artifacts: ReturnType<typeof artifacts> }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an options object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown option');
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid text option');
  return value;
}
export function parseChoices(input: unknown): Choices {
  const value = record(input);
  keys(value, ['endpoint', 'name', 'mappings', 'permissions', 'autoUpdate', 'linger', 'bots']);
  const endpoint = text(value.endpoint, 2048);
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || /%|\\/.test(endpoint) || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Use an explicit HTTPS API endpoint (HTTP is loopback-only)');
  if (!Array.isArray(value.mappings) || value.mappings.length > 100) throw new Error('Choose mappings explicitly; [] keeps all repositories local');
  const seen = new Set<string>();
  const mappings = value.mappings.map((input): Choices['mappings'][number] => {
    const mapping = record(input);
    keys(mapping, ['repo', 'audience']);
    const repo = text(mapping.repo).toLowerCase();
    if (!/^github:[a-z0-9][a-z0-9-]{0,38}\/(?:[a-z0-9_.-]{1,100}|\*)$/.test(repo) || /\/(?:\.|\.\.)$/.test(repo) || seen.has(repo)) throw new Error('Invalid or duplicate repository mapping');
    seen.add(repo);
    if (mapping.audience !== 'private' && mapping.audience !== 'shared') throw new Error('Choose each mapping audience');
    return { repo, audience: mapping.audience };
  });
  if (value.permissions !== 'ask') throw new Error('Confirm the single permissions mechanism: ask');
  if (typeof value.autoUpdate !== 'boolean' || typeof value.linger !== 'boolean') throw new Error('Confirm auto-update and linger choices');
  let bots: Choices['bots'];
  if (value.bots !== undefined) {
    const input = record(value.bots);
    keys(input, ['selected', 'identities']);
    const identities = record(input.identities);
    const parsed: NonNullable<Choices['bots']>['identities'] = {};
    for (const [role, entry] of Object.entries(identities)) {
      if (!/^[a-z][a-z0-9-]{0,40}$/.test(role)) throw new Error('Invalid bot role');
      const identity = record(entry);
      keys(identity, ['name', 'email']);
      const name = text(identity.name, 100), email = text(identity.email, 254);
      if (!/^[^\s<>@]+@[^\s<>@]+$/.test(email) || /[<>]/.test(name)) throw new Error('Invalid bot identity');
      parsed[role] = { name, email };
    }
    const selected = text(input.selected);
    if (!Object.hasOwn(parsed, selected)) throw new Error('Select a configured bot role');
    bots = { identities: parsed, selected };
  }
  return { endpoint: endpoint.replace(/\/$/, ''), name: text(value.name, 100), mappings, permissions: 'ask', autoUpdate: value.autoUpdate, linger: value.linger, ...(bots ? { bots } : {}) };
}
export function hostFrom(env: NodeJS.ProcessEnv = process.env, platform = process.platform, arch = process.arch): Host {
  if (process.getuid!() === 0) throw new Error('Run the installer as an ordinary user, never uid 0');
  if (platform !== 'darwin' && platform !== 'linux') throw new Error('Supported systems: macOS and glibc Linux');
  if (platform === 'linux' && process.platform === 'linux' && !(process.report.getReport() as { header?: { glibcVersionRuntime?: string } }).header?.glibcVersionRuntime) throw new Error('Linux installation requires glibc; musl is unsupported');
  if (arch !== 'arm64' && arch !== 'x64') throw new Error('Supported architectures: arm64 and x64');
  const home = text(env.HOME, 4096), data = env.XDG_DATA_HOME || join(home, '.local/share'), config = env.XDG_CONFIG_HOME || join(home, '.config');
  for (const path of [home, data, config]) if (!isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path) || resolve(path) === '/') throw new Error('HOME/XDG paths must be absolute non-root paths');
  return { home: resolve(home), data: resolve(data), config: resolve(config), platform, arch, uid: process.getuid!() };
}
export function createPlan(input: unknown, host = hostFrom()): Plan {
  const choices = parseChoices(input);
  return { version, root: join(host.data, 'chi'), host, choices, pins: sources, web, artifacts: artifacts(host.platform, host.arch) };
}
// The bundled @sigstore/verify verifier and this CLI require the same Node
// contract. npx only warns about engines, so every CLI entry point refuses an
// unsupported runtime before argument parsing, downloads or writes.
export function assertNodeFloor(version: string = process.versions.node): void {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  const major = Number(match?.[1]), minor = Number(match?.[2]), patch = Number(match?.[3]);
  const atLeast = (floorMajor: number, floorMinor: number, floorPatch: number) => major === floorMajor && (minor > floorMinor || (minor === floorMinor && patch >= floorPatch));
  const supported = atLeast(22, 22, 2) || atLeast(24, 15, 0) || major >= 26;
  if (!match || !Number.isSafeInteger(major) || !supported) throw new Error(`Installer requires Node.js ^22.22.2 || ^24.15.0 || >=26.0.0; found ${version}. Use a supported Node runtime and retry`);
}
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => {
    if (!/^1\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(v)) throw new Error('Unsupported installer version');
    const numbers = v.split('.').map(Number);
    if (!numbers.every(Number.isSafeInteger)) throw new Error('Unsupported installer version');
    return numbers;
  };
  const left = parts(a), right = parts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! < right[i]! ? -1 : 1;
  return 0;
}
