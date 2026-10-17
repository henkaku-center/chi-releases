import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { basename, join, posix } from 'node:path';
import type { Plan } from './plan.js';
import { Owned } from './files.js';

export interface Command { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; inherit?: boolean; buildLog?: number }
export interface System { run(command: Command): Promise<Buffer>; download(url: string, exact?: boolean): Promise<Buffer>; sleep(ms: number): Promise<void> }
export class CommandFailure extends Error {
  constructor(command: string, readonly exitCode: number | null) {
    super(`${basename(command)} failed; installation remains incomplete`);
  }
}
/** Public build acquisition never inherits runtime/account authentication. */
export function buildEnvironment(root: string, path = '/usr/bin:/bin') {
  return { PATH: path, HOME: join(root, 'build-home'), XDG_CONFIG_HOME: join(root, 'build-home/config'), XDG_DATA_HOME: join(root, 'build-home/data'), XDG_STATE_HOME: join(root, 'build-home/state'), XDG_CACHE_HOME: join(root, 'cache'), GOMAXPROCS: '2', CARGO_BUILD_JOBS: '2', npm_config_jobs: '2',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '4', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '', GIT_CONFIG_KEY_1: 'core.askPass', GIT_CONFIG_VALUE_1: '',
    GIT_CONFIG_KEY_2: 'protocol.file.allow', GIT_CONFIG_VALUE_2: 'never', GIT_CONFIG_KEY_3: 'protocol.ext.allow', GIT_CONFIG_VALUE_3: 'never',
    npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'build-home/npmrc'), npm_config_globalconfig: join(root, 'build-home/npm-globalrc'), npm_config_registry: 'https://registry.npmjs.org' };
}
export const system: System = {
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  run(input) {
    return new Promise((resolve, reject) => {
      const child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env, stdio: input.inherit ? 'inherit' : ['ignore', 'pipe', input.args.includes('pair') ? 'ignore' : input.buildLog ?? 'ignore'] });
      const chunks: Buffer[] = []; let count = 0;
      child.stdout?.on('data', (bytes: Buffer) => { count += bytes.length; if (count > 128 * 1024 * 1024) child.kill(); else chunks.push(bytes); });
      child.on('error', () => reject(new Error(`Unable to execute ${basename(input.command)}`)));
      child.on('close', code => code === 0 && count <= 128 * 1024 * 1024 ? resolve(Buffer.concat(chunks)) : reject(new CommandFailure(input.command, code)));
    });
  },
  async download(url, exact = false) {
    for (let redirects = 0; redirects < 6; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !['nodejs.org', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'registry.npmjs.org'].includes(parsed.hostname)) throw new Error('Untrusted artifact URL');
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); if (exact) throw new Error('Exact artifact URL cannot redirect'); url = new URL(response.headers.get('location') || '', url).href; continue; }
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Artifact download failed'); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 128 * 1024 * 1024) throw new Error('Artifact exceeds download limit'); chunks.push(part.value); } }
      finally { await reader.cancel(); reader.releaseLock(); }
      return Buffer.concat(chunks);
    }
    throw new Error('Too many artifact redirects');
  },
};
export function verify(bytes: Buffer, sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256) || createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Artifact checksum mismatch');
}
// We materialize only regular files. Archive-owned links, devices and permissions
// can never affect the host; even unselected member paths are validated first.
export function tarFiles(compressed: Buffer): Map<string, Buffer & { mode: number }> {
  const bytes = gunzipSync(compressed, { maxOutputLength: 512 * 1024 * 1024 });
  const result = new Map<string, Buffer & { mode: number }>(); let longName: string | undefined;
  const string = (value: Buffer) => value.toString('utf8').replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i]!;
    if (sum !== parseInt(string(header.subarray(148, 156)).trim(), 8)) throw new Error('Invalid archive header');
    const sizeText = string(header.subarray(124, 136)).trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error('Invalid archive size');
    const size = parseInt(sizeText, 8), end = offset + 512 + size;
    if (!Number.isSafeInteger(size) || size > 128 * 1024 * 1024 || end > bytes.length) throw new Error('Invalid archive bounds');
    const type = header[156]; const content = bytes.subarray(offset + 512, end);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 76) { if (longName || size > 4096) throw new Error('Invalid long archive name'); longName = string(content); continue; }
    const prefix = string(header.subarray(345, 500));
    const name = longName ?? (prefix ? `${prefix}/` : '') + string(header.subarray(0, 100)); longName = undefined;
    if (!name || name.startsWith('/') || name.split('/').includes('..') || /[\x00-\x1f\x7f\\]/.test(name) || posix.normalize(name).replace(/\/$/, '') !== name.replace(/\/$/, '')) throw new Error('Unsafe archive path');
    if ([49, 50].includes(type!)) continue; // Never create hard/symbolic links.
    if (type === 53) continue;
    if (type !== 0 && type !== 48) throw new Error('Unsupported archive member');
    if (result.has(name)) throw new Error('Duplicate archive member');
    const mode = string(header.subarray(100, 108)).trim();
    if (!/^[0-7]{1,7}$/.test(mode)) throw new Error('Invalid archive mode');
    result.set(name, Object.assign(content, { mode: parseInt(mode, 8) & 0o111 ? 0o700 : 0o600 }));
  }
  if (longName) throw new Error('Incomplete archive');
  return result;
}
export function cleanEnvironment(plan: Plan, input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...input };
  for (const name of Object.keys(env)) if (name.startsWith('PASEO_') || name.startsWith('OPENCODE_') || ['NODE_OPTIONS', 'BUN_OPTIONS', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'].includes(name)) delete env[name];
  return { ...env, HOME: plan.host.home, GH_CONFIG_DIR: input.GH_CONFIG_DIR || join(plan.host.config, 'gh'),
    XDG_CONFIG_HOME: join(plan.root, 'config'), XDG_DATA_HOME: join(plan.root, 'data'), XDG_STATE_HOME: join(plan.root, 'state'), XDG_CACHE_HOME: join(plan.root, 'cache'),
    PATH: `${join(plan.root, 'bin')}:${input.PATH || '/usr/bin:/bin'}` };
}
export async function installTools(owned: Owned, io: System, env: NodeJS.ProcessEnv) {
  const plan = owned.journal.plan;
  for (const [name, artifact] of Object.entries(plan.artifacts)) {
    const target = join(plan.root, 'bin', name);
    if (owned.journal.files[target]) {
      await checkVersion(target, name, artifact.version, plan, io, env);
      continue;
    }
    const bytes = await io.download(artifact.url); verify(bytes, artifact.sha256);
    let binary: Buffer;
    if (artifact.format === 'zip') {
      const archive = join(plan.root, 'downloads', `${name}.zip`);
      await owned.write(archive, bytes);
      // Extract a fixed member to stdout, never allow unzip to create paths.
      binary = await io.run({ command: 'unzip', args: ['-p', archive, artifact.member], cwd: plan.root, env });
    } else {
      const entries = tarFiles(bytes);
      binary = entries.get(artifact.member)!;
      if (name === 'node') {
        const prefix = artifact.member.replace(/bin\/node$/, 'lib/node_modules/npm/');
        const npm = new Map<string, { bytes: Buffer; mode: number }>();
        for (const [path, data] of entries) if (path.startsWith(prefix)) npm.set(path.slice(prefix.length), { bytes: data, mode: data.mode });
        if (!npm.has('bin/npm-cli.js')) throw new Error('Missing npm in verified archive');
        await owned.writeTree(join(plan.root, 'npm'), npm);
        const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
        await owned.write(join(plan.root, 'bin/npm'), `#!/bin/sh\nexec ${quote(join(plan.root, 'bin/node'))} ${quote(join(plan.root, 'npm/bin/npm-cli.js'))} "$@"\n`, 0o700);
      }
    }
    if (!binary?.length) throw new Error('Missing binary in verified archive');
    await owned.write(target, binary, 0o700);
    await checkVersion(target, name, artifact.version, plan, io, env);
  }
}
async function checkVersion(target: string, name: string, version: string, plan: Plan, io: System, env: NodeJS.ProcessEnv) {
  const result = await io.run({ command: target, args: [name === 'gitleaks' ? 'version' : '--version'], cwd: plan.root, env });
  if (!result.toString().split(/[\s,]+/).some(word => word === version || word === `v${version}`)) throw new Error('Installed tool version mismatch');
}
