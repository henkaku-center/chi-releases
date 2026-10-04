import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const cases = [
  ['scripts/snapshot.mjs', 'manifest.private !== false', 'false'],
  ['scripts/snapshot.mjs', 'manifest.repository?.url !==', 'false && manifest.repository?.url !=='],
  ['scripts/snapshot.mjs', 'manifest.publishConfig ||', 'false ||'],
  ['scripts/snapshot.mjs', 'manifest.tag !== tag', 'false'],
  ['scripts/snapshot.mjs', 'digest(read(path)) !== manifest.files[path]', 'false'],
  ['scripts/snapshot.mjs', 'if (isolated &&', 'if (false &&'],
  ['scripts/snapshot.mjs', 'if (JSON.stringify(regularFiles(join(root,', 'if (false && JSON.stringify(regularFiles(join(root,'],
  ['scripts/snapshot.mjs', 'stat.nlink === 1', 'true'],
  ['scripts/import-snapshot.mjs', 'verifySnapshot(source, tag, true);', ''],
  ['scripts/release-check.mjs', "process.env.GITHUB_REPOSITORY !== 'henkaku-center/chi-releases'", 'false'],
  ['scripts/release-check.mjs', "process.env.GITHUB_EVENT_NAME !== 'push'", 'false'],
  ['.github/workflows/release.yml', 'environment: npm-release', 'environment: unprotected'],
  ['.github/workflows/release.yml', 'needs: build', 'needs: []'],
  ['.github/workflows/release.yml', '--provenance --ignore-scripts', '--provenance=false --ignore-scripts'],
  ['.github/workflows/release.yml', 'run: node scripts/release-check.mjs', 'run: echo bypass'],
  ['.github/workflows/release.yml', 'sha512sum --strict -c SHA512SUMS', 'echo bypass'],
  ['.github/workflows/release.yml', '--verify-tag', ''],
  ['scripts/pack.mjs', "'--ignore-scripts',", ''],
  ['scripts/pack.mjs', 'verifyInputs(process.cwd(), process.env.GITHUB_REF_NAME)', "JSON.parse(readFileSync('packages/installer/package.json'))"],
  ['scripts/pack.mjs', 'packed.files.some(file => !allowed.test(file.path))', 'false'],
  ['scripts/pack.mjs', "['dist/cli.js', 'dist/sigstore.js', 'LICENSE', 'TRUST.md'].every", "['dist/cli.js', 'LICENSE', 'TRUST.md'].every"],
];
function test() { return spawnSync(process.execPath, ['--test', 'test/snapshot.test.mjs', 'test/workflows.test.mjs', 'test/pack.test.mjs'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); }
const baseline = test();
if (baseline.status !== 0) throw new Error(`Baseline failed\n${baseline.stdout}\n${baseline.stderr}`);
for (const [path, from, to] of cases) {
  const original = readFileSync(path, 'utf8'); if (!original.includes(from)) throw new Error(`Moved mutation: ${from}`);
  try {
    writeFileSync(path, original.replaceAll(from, to));
    const result = test();
    if (result.status === 0 || !/AssertionError|ERR_ASSERTION/.test(result.stdout + result.stderr)) throw new Error(`Survived: ${from}\n${result.stdout}\n${result.stderr}`);
    console.log(`KILLED ${path}: ${from}`);
  } finally { writeFileSync(path, original); }
}
console.log(`${cases.length}/${cases.length} release guard mutations killed`);
