import { readFileSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const files = JSON.parse(readFileSync(new URL('./snapshot-files.json', import.meta.url)));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function releaseManifest(manifest, tag) {
  if (manifest.name !== '@henkaku-center/chi' || manifest.private !== false || !/^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version) || tag !== `chi-v${manifest.version}`) throw new Error('Requires reviewed public installer and exact stable 1.x tag');
  if (manifest.repository?.url !== 'git+https://github.com/henkaku-center/chi-releases.git' || manifest.repository?.directory !== 'packages/installer') throw new Error('Wrong public source repository');
  if (manifest.publishConfig || manifest.dependencies || manifest.optionalDependencies || manifest.bundledDependencies) throw new Error('Unexpected publish override or runtime dependency');
}
export function regularFiles(root) {
  const paths = [];
  function walk(path = '') {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) throw new Error('Symlinks forbidden');
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path))) walk(path ? `${path}/${name}` : name);
    } else if (stat.isFile() && stat.nlink === 1 && stat.size <= 1024 * 1024) paths.push(path);
    else throw new Error('Non-regular or oversized snapshot file');
  }
  walk();
  return paths.sort();
}
export function verifySnapshot(root, tag, isolated = false) {
  // In an isolated incoming directory, reject EVERYTHING besides the manifest
  // and exact files. In a checkout, confine reads to these paths and reject links
  // on every component; public release tooling is never an export input.
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('Unsafe snapshot root');
  if (isolated && JSON.stringify(regularFiles(root)) !== JSON.stringify([...files, '.installer-snapshot.json'].sort())) throw new Error('Snapshot allowlist mismatch');
  if (JSON.stringify(regularFiles(join(root, 'packages/installer')).map(path => `packages/installer/${path}`)) !== JSON.stringify(files.filter(path => path.startsWith('packages/installer/')).sort())) throw new Error('Installer allowlist mismatch');
  return verifyInputs(root, tag);
}

// Recheck committed inputs after building; generated dist/node_modules are not
// snapshot inputs, but no build/test script may silently rewrite those inputs.
export function verifyInputs(root, tag) {
  function read(path) {
    let current = root;
    for (const part of path.split('/')) {
      current = join(current, part);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error('Symlinks forbidden');
    }
    const stat = lstatSync(current);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error('Non-regular snapshot file');
    return readFileSync(current);
  }
  const manifest = JSON.parse(read('.installer-snapshot.json'));
  if (manifest.tag !== tag || Object.keys(manifest).sort().join() !== 'files,tag' || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify([...files].sort())) throw new Error('Snapshot manifest mismatch');
  for (const path of files) if (digest(read(path)) !== manifest.files[path]) throw new Error('Snapshot digest mismatch');
  const pkg = JSON.parse(read('packages/installer/package.json'));
  releaseManifest(pkg, tag);
  return pkg;
}
