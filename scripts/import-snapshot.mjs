import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySnapshot, roots } from './snapshot.mjs';

export function importSnapshot(source, tag, destination) {
  verifySnapshot(source, tag, true);
  // A fresh public-only checkout is the parent. Never transplant private .git.
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: destination }).length) throw new Error('Public checkout must be clean');
  for (const name of ['packages', 'backend']) {
    const directory = join(destination, name);
    if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) throw new Error('Unsafe destination');
    mkdirSync(directory, { recursive: true });
  }
  for (const path of ['LICENSE', '.installer-snapshot.json']) {
    // Remove a possible destination link rather than writing through it.
    rmSync(join(destination, path), { force: true });
    cpSync(join(source, path), join(destination, path), { errorOnExist: true, force: false });
  }
  for (const directory of roots) {
    rmSync(join(destination, directory), { recursive: true, force: true });
    cpSync(join(source, directory), join(destination, directory), { recursive: true, errorOnExist: true, force: false });
  }
  verifySnapshot(destination, tag);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) importSnapshot(resolve(process.argv[2]), process.argv[3], process.cwd());
