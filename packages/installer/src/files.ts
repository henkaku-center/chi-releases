import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { parseChoices, type Plan } from './plan.js';

export const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function stat(path: string) {
  try { return await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function directories(path: string, create: boolean): Promise<void> {
  const parent = dirname(path);
  if (parent !== path) await directories(parent, create);
  let info = await stat(path);
  if (!info && create) { await mkdir(path, { mode: 0o700 }); info = await lstat(path); }
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Unsafe directory: ${path}`);
  if (info && ((info.uid !== 0 && info.uid !== process.getuid!()) || ((info.mode & 0o022) && !(info.mode & 0o1000)))) throw new Error(`Unsafe directory ownership or permissions: ${path}`);
}
export async function regular(path: string): Promise<Buffer | null> {
  await directories(dirname(path), false);
  const info = await stat(path);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid!() || (info.mode & 0o022)) throw new Error(`Unsafe owned file: ${path}`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = await file.stat();
    if (current.ino !== info.ino || current.dev !== info.dev || current.nlink !== 1) throw new Error('File changed during ownership check');
    return await file.readFile();
  } finally { await file.close(); }
}
export interface Journal {
  schema: 1; owner: 'chi-installer'; root: string; plan: Plan;
  files: Record<string, string>; phase: 'building' | 'installed' | 'uninstalled';
  release?: string; initial?: string; previous?: string; pending?: string;
  write?: { path: string; stage: string; before?: string; after: string };
  built?: Pick<Plan, 'pins' | 'artifacts'>;
  states?: string[];
  trees?: Record<string, string>;
  tree?: { path: string; stage: string; hash: string };
  lingerWasEnabled?: boolean;
  reconfigure?: { plan: Plan; archive: string; entries: string[]; services: boolean };
}
// Include names and executable modes as well as bytes. Added files and permission
// changes invalidate ownership; no links or special entries can be traversed.
async function treeDigest(root: string): Promise<string> {
  const entries: [string, number, string][] = [];
  async function walk(path: string, relative: string) {
    await directories(path, false);
    const info = await stat(path);
    if (!info || info.uid !== process.getuid!() || (info.mode & 0o777) !== 0o700) throw new Error('Unsafe owned tree directory');
    entries.push([relative + '/', 0o700, '']);
    for (const name of (await readdir(path)).sort()) {
      const child = join(path, name), rel = relative ? `${relative}/${name}` : name;
      const info = (await stat(child))!;
      if (info.isDirectory()) await walk(child, rel);
      else {
        const bytes = await regular(child), mode = info.mode & 0o777;
        if (!bytes || ![0o600, 0o700].includes(mode)) throw new Error('Unsafe owned tree file');
        entries.push([rel, mode, digest(bytes)]);
      }
    }
  }
  await walk(root, '');
  return digest(JSON.stringify(entries));
}
export class Owned {
  private constructor(readonly root: string, public journal: Journal) {}
  static async load(plan: Plan, create: boolean): Promise<Owned> {
    await directories(dirname(plan.root), create);
    const info = await stat(plan.root);
    if (!info) {
      if (!create) throw new Error('No owned installation');
      await mkdir(plan.root, { mode: 0o700 });
      const journal: Journal = { schema: 1, owner: 'chi-installer', root: plan.root, plan, files: {}, phase: 'building' };
      const owned = new Owned(plan.root, journal);
      await owned.save(true);
      return owned;
    }
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid!() || (info.mode & 0o077)) throw new Error('Installation root must be owned and private');
    const bytes = await regular(join(plan.root, 'ownership.json'));
    if (!bytes) throw new Error('Refusing to adopt an existing directory');
    const journal = JSON.parse(bytes.toString()) as Journal;
    if (journal.schema !== 1 || journal.owner !== 'chi-installer' || journal.root !== plan.root || !journal.files || !['building', 'installed', 'uninstalled'].includes(journal.phase)) throw new Error('Invalid ownership journal');
    if (JSON.stringify(journal.plan?.host) !== JSON.stringify(plan.host) || journal.plan.root !== plan.root) throw new Error('Ownership journal host mismatch');
    parseChoices(journal.plan.choices);
    return new Owned(plan.root, journal);
  }
  allowed(path: string): boolean {
    const absolute = resolve(path);
    if (['ownership.json', '.install-lock'].some(name => absolute === join(this.root, name))) return false;
    if (absolute.startsWith(this.root + sep)) return true;
    return this.servicePaths().includes(absolute);
  }
  servicePaths(): string[] {
    const host = this.journal.plan.host;
    if (host.platform === 'darwin') return ['paseo', 'opencode', 'update'].map(name => join(host.home, 'Library/LaunchAgents', `center.henkaku.chi.${name}.plist`));
    return ['paseo.service', 'opencode.service', 'update.service', 'update.timer'].map(name => join(host.config, 'systemd/user', `chi-owned-${name}`));
  }
  async verify(): Promise<void> {
    if (this.journal.reconfigure) throw new Error('Complete interrupted reconfigure before another lifecycle action');
    for (const [path, hash] of Object.entries(this.journal.files)) {
      if (!this.allowed(path) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Unsafe ownership journal entry');
      if (this.statePaths().includes(path)) continue; // Legacy journals: runtime-owned state, never byte-verified.
      const bytes = await regular(path);
      if (!bytes || digest(bytes) !== hash) throw new Error(`Owned file was edited or removed; preserve and reconcile it: ${path}`);
    }
    for (const [path, hash] of Object.entries(this.journal.trees ?? {})) {
      this.treePath(path);
      if (await treeDigest(path) !== hash) throw new Error('Owned tree was edited');
    }
  }
  statePaths(): string[] { return [join(this.root, 'state/paseo/config.json'), join(this.root, 'config/opencode/opencode.json'), join(this.root, 'config/opencode/cli.json')]; }
  async writeState(path: string, bytes: string): Promise<void> {
    if (!this.statePaths().includes(path)) throw new Error('Invalid state path');
    const existing = await regular(path);
    if (this.journal.states?.includes(path) || this.journal.files[path]) {
      if (!existing) throw new Error('Runtime state was removed; reconcile it explicitly');
    } else {
      await this.write(path, bytes);
    }
    this.journal.states = [...new Set([...(this.journal.states ?? []), path])];
    delete this.journal.files[path];
    await this.save();
  }
  private treePath(path: string) {
    if (path !== join(this.root, 'npm')) throw new Error('Unsafe owned tree path');
  }
  async writeTree(path: string, entries: Map<string, { bytes: Buffer; mode: number }>): Promise<void> {
    this.treePath(path);
    if (this.journal.trees?.[path]) {
      if (await treeDigest(path) !== this.journal.trees[path]) throw new Error('Owned tree was edited');
      return;
    }
    if (await stat(path)) throw new Error('Refusing to replace non-owned tree');
    const stage = await mkdtemp(join(this.root, '.chi-tree-'));
    const parents = new Set([stage]);
    for (const [relative, entry] of entries) {
      if (!relative || relative.split('/').some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f\x7f]/.test(relative) || ![0o600, 0o700].includes(entry.mode)) throw new Error('Unsafe tree member');
      const target = join(stage, relative);
      await directories(dirname(target), true);
      const file = await open(target, 'wx', entry.mode);
      try { await file.writeFile(entry.bytes); await file.sync(); } finally { await file.close(); }
      for (let parent = dirname(target); parent !== this.root; parent = dirname(parent)) parents.add(parent);
    }
    // Flush every directory entry, including file-less intermediate directories,
    // once before publishing the intent. Per-file parent syncs miss those ancestors.
    for (const parent of [...parents].sort((a, b) => b.length - a.length)) await syncDirectory(parent);
    const hash = await treeDigest(stage);
    this.journal.tree = { path, stage, hash }; await this.save();
    await this.recoverTree();
  }
  private async recoverTree() {
    const intent = this.journal.tree;
    if (!intent) return;
    const { path, stage, hash } = intent;
    this.treePath(path);
    if (dirname(stage) !== this.root || !/^\.chi-tree-[a-zA-Z0-9]+$/.test(stage.slice(this.root.length + 1)) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid interrupted tree');
    if (await stat(stage)) {
      if (await stat(path)) throw new Error('Refusing to replace non-owned tree');
      if (await treeDigest(stage) !== hash) throw new Error('Staged tree was edited');
      await rename(stage, path); await syncDirectory(this.root);
    }
    if (await treeDigest(path) !== hash) throw new Error('Published tree was edited');
    (this.journal.trees ??= {})[path] = hash;
    delete this.journal.tree; await this.save();
  }
  async removeTree(path: string): Promise<boolean> {
    this.treePath(path);
    if (!this.journal.trees?.[path]) throw new Error('Unowned tree removal');
    if (await stat(path)) {
      try { if (await treeDigest(path) !== this.journal.trees[path]) return false; }
      catch { return false; }
      await rm(path, { recursive: true });
      await syncDirectory(this.root);
    }
    delete this.journal.trees[path]; await this.save(); return true;
  }
  async lock<T>(run: () => Promise<T>): Promise<T> {
    const path = join(this.root, '.install-lock');
    const file = await open(path, 'wx', 0o600).catch(() => { throw new Error('Another install/update is active (or an interrupted lock needs inspection)'); });
    try {
      await file.writeFile(`${process.pid}\n`); await file.sync();
      // A caller may have waited between load and lock; never act on stale ownership.
      this.journal = (await Owned.load(this.journal.plan, false)).journal;
      await this.recoverWrite();
      await this.recoverTree();
      return await run();
    }
    finally { await file.close(); await unlink(path); }
  }
  async save(exclusive = false): Promise<void> {
    const target = join(this.root, 'ownership.json');
    if (!exclusive) await regular(target);
    const staging = join(this.root, `.ownership-${randomUUID()}`);
    const file = await open(exclusive ? target : staging, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(this.journal, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    if (!exclusive) await rename(staging, target);
    await syncDirectory(this.root);
  }
  async recoverWrite(): Promise<void> {
    const intent = this.journal.write;
    if (!intent) return;
    const { path, stage, before, after } = intent;
    if (!this.allowed(path) || dirname(stage) !== dirname(path) || !/^\.chi-[a-f0-9-]+$/.test(stage.slice(dirname(stage).length + 1)) || !/^[a-f0-9]{64}$/.test(after) || before !== this.journal.files[path]) throw new Error('Invalid interrupted write');
    await directories(dirname(path), false);
    const staged = await stat(stage), target = await stat(path);
    // Creation uses link(no-replace). A crash can leave the private staging link.
    if (staged && target && staged.ino === target.ino && staged.dev === target.dev && staged.isFile() && !staged.isSymbolicLink()) await unlink(stage);
    const bytes = await regular(path);
    if (bytes && digest(bytes) === after) this.journal.files[path] = after;
    else if (!(bytes ? before && digest(bytes) === before : !before)) throw new Error('Interrupted write conflicts with edited bytes');
    if (await regular(stage)) await unlink(stage);
    delete this.journal.write;
    await this.save();
  }
  async write(path: string, bytes: string | Buffer, mode = 0o600): Promise<void> {
    if (!this.allowed(path)) throw new Error('Write outside owned installation');
    await directories(dirname(path), true);
    const existing = await regular(path), hash = digest(bytes);
    const previous = this.journal.files[path];
    if (existing && (!previous || digest(existing) !== previous)) throw new Error(`Refusing to replace non-owned or edited file: ${path}`);
    if (existing && digest(existing) === hash) return;
    const staging = join(dirname(path), `.chi-${randomUUID()}`);
    const file = await open(staging, 'wx', mode);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    this.journal.write = { path, stage: staging, before: previous, after: hash };
    await this.save();
    if (existing) await rename(staging, path);
    else {
      // link is no-replace, unlike rename. Staging is removed before returning.
      const { link } = await import('node:fs/promises');
      try { await link(staging, path); } finally { await unlink(staging); }
    }
    await syncDirectory(dirname(path));
    this.journal.files[path] = hash;
    delete this.journal.write;
    await this.save();
  }
  async remove(path: string): Promise<boolean> {
    if (!this.allowed(path)) throw new Error('Unsafe removal path');
    const bytes = await regular(path);
    if (!bytes) { delete this.journal.files[path]; await this.save(); return true; }
    if (digest(bytes) !== this.journal.files[path]) return false;
    await unlink(path);
    delete this.journal.files[path];
    await this.save();
    return true;
  }
}
export async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await file.sync(); } finally { await file.close(); }
}
