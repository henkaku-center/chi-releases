import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import { buildPlugin } from './plugin.mjs';

// Retained and downloaded installers have no node_modules. Bundle the verifier
// and reviewed roots into a single ESM file copied by the existing dist allowlist.
await build({
  entryPoints: ['src/sigstore.ts'], outfile: 'dist/sigstore.js', bundle: true,
  platform: 'node', format: 'esm', target: 'node22', legalComments: 'inline',
  banner: { js: `/*!\nCopyright The Sigstore Authors.\n${await readFile(new URL('./sigstore-LICENSE', import.meta.url), 'utf8')}\n*/\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);` },
});
// tsc copies this JSON too; the executable bundle already contains these roots.
await rm('dist/trusted-root.json');
await buildPlugin();
