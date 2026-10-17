import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Called by release.yml before obtaining an npm publishing identity. Leaving the
// candidate private is a hard publication gate, including accidental tag pushes.
export function releaseCheck(manifest, ref) {
  if (manifest.name !== '@henkaku-center/chi' || !/^1\.\d+\.\d+$/.test(manifest.version) || ref !== `refs/tags/chi-v${manifest.version}`) throw new Error('Installer release requires a matching stable 1.x tag and package');
  if (manifest.private !== false) throw new Error('Installer candidate is still private; complete publication review first');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) releaseCheck(JSON.parse(await readFile(new URL('../package.json', import.meta.url))), process.env.GITHUB_REF);
