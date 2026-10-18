// Read-only inventory, not adoption or a compatibility certificate. Never loads
// runtime config/auth, opens native databases, or starts/discovers a daemon.
import { readFileSync, readSync, readdirSync, lstatSync, realpathSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { join, delimiter, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function countAgentRecords(directory) {
  const result = { records: 0, opencodeRecords: 0, nativeMappings: 0, invalid: 0, complete: false };
  const root = lstatSync(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw Error('Expected an explicit real agents directory');
  let total = 0;
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) files.push(join(directory, entry.name));
    else if (entry.isDirectory()) {
      for (const child of readdirSync(join(directory, entry.name), { withFileTypes: true })) {
        if (child.isSymbolicLink()) throw Error('Linked records are not inventoried');
        if (child.isFile() && child.name.endsWith('.json')) files.push(join(directory, entry.name, child.name));
      }
    } else if (entry.isSymbolicLink()) throw Error('Linked records are not inventoried');
    if (files.length > 10000) throw Error('Record-count bound exceeded');
  }
  for (const path of files) {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      total += stat.size;
      if (!stat.isFile() || stat.size > 1024 * 1024 || total > 32 * 1024 * 1024) throw Error('Metadata-size bound exceeded');
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!read) throw Error('Record changed during inventory');
        offset += read;
      }
      const after = fstatSync(fd);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('Record changed during inventory');
      let record;
      try { record = JSON.parse(bytes.toString('utf8')); } catch { result.invalid++; continue; }
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || typeof record.provider !== 'string') { result.invalid++; continue; }
      result.records++;
      if (record.provider === 'opencode') {
        result.opencodeRecords++;
        if (record.persistence?.provider === 'opencode' && typeof record.persistence.sessionId === 'string' && record.persistence.sessionId) result.nativeMappings++;
      }
    } finally { closeSync(fd); }
  }
  // Counts are a live filesystem observation, not an atomic backup or unique
  // native-session count. Titles, IDs, directories and config never leave here.
  result.complete = result.invalid === 0;
  return result;
}

function command(name, args) {
  try { return execFileSync(name, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (error) { return typeof error.stdout === 'string' ? error.stdout.trim() : ''; }
}
function binary(name) {
  for (const dir of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const path = join(dir, name);
    try {
      const real = realpathSync(path), stat = lstatSync(real);
      if (!stat.isFile() || !(stat.mode & 0o111)) continue;
      // --version only; never service status, session list, API or auth commands.
      const output = command(real, ['--version']);
      const version = output.match(/^(?:opencode |paseo |v)?(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)$/)?.[1] || 'unrecognized; do not paste raw output';
      return { path, resolvedPath: real, uid: stat.uid, gid: stat.gid, version, packageManagerOwnership: 'not established by filesystem owner' };
    } catch { /* Continue PATH search, without exposing filesystem errors. */ }
  }
  return { found: false };
}
export function preflight(agentsDirectory) {
  let distro = {}, kernel = '', pid1 = '';
  try { distro = Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n').filter(line => /^(ID|VERSION_ID)=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; })); } catch {}
  try { kernel = readFileSync('/proc/sys/kernel/osrelease', 'utf8').trim(); pid1 = readFileSync('/proc/1/comm', 'utf8').trim(); } catch {}
  const service = command('systemctl', ['--user', 'is-system-running']);
  const linger = command('loginctl', ['show-user', String(process.getuid?.() ?? ''), '--property=Linger', '--value']);
  return {
    platform: process.platform, arch: process.arch, distro, wslKernelDetected: /microsoft|wsl/i.test(kernel),
    glibc: command('getconf', ['GNU_LIBC_VERSION']).match(/^glibc \d+\.\d+$/)?.[0] || 'unknown',
    pid1: pid1 === 'systemd' ? 'systemd' : 'not systemd or unavailable',
    userServiceManager: ['running', 'degraded', 'starting', 'offline', 'maintenance', 'stopping'].includes(service) ? service : 'unavailable or unrecognized',
    linger: ['yes', 'no'].includes(linger) ? linger : 'unknown',
    binaries: { opencode: binary('opencode'), paseo: binary('paseo') },
    paseoAgentRecords: agentsDirectory ? countAgentRecords(resolve(agentsDirectory)) : 'unknown: no explicitly identified agents directory supplied',
    nativeSessionCount: 'unknown: no service startup/API/database access performed',
    acceptance: 'inventory only; WSL takeover is not validated',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw Error('Usage: node existing-install-preflight.mjs [EXPLICIT_PASEO_AGENTS_DIRECTORY]');
  try { console.log(JSON.stringify(preflight(process.argv[2]), null, 2)); }
  catch { console.error('Preflight incomplete; inspect locally. Do not send raw records/configuration.'); process.exitCode = 1; }
}
