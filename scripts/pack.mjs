import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyInputs } from './snapshot.mjs';

const pkg = verifyInputs(process.cwd(), process.env.GITHUB_REF_NAME);
mkdirSync('artifacts');
const report = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', '../../artifacts'], { cwd: 'packages/installer', encoding: 'utf8' }));
// npm 11 emits an array; npm 12 keys the same records by package name.
const records = Array.isArray(report) ? report : Object.values(report);
if (records.length !== 1) throw new Error('Expected exactly one packed installer');
const [packed] = records;
if (packed.filename !== `henkaku-center-chi-${pkg.version}.tgz` || packed.name !== pkg.name || packed.version !== pkg.version) throw new Error('Wrong package');
const allowed = /^(?:package\.json|README\.md|TRUST\.md|LICENSE|dist\/[a-z]+\.js|toolchain\/package(?:-lock)?\.json)$/;
if (packed.files.some(file => !allowed.test(file.path)) || !['dist/cli.js', 'dist/sigstore.js', 'LICENSE', 'TRUST.md'].every(path => packed.files.some(file => file.path === path))) throw new Error('Unexpected or incomplete npm payload');
const bytes = readFileSync(`artifacts/${packed.filename}`);
for (const algorithm of ['sha256', 'sha512']) writeFileSync(`artifacts/${algorithm.toUpperCase()}SUMS`, `${createHash(algorithm).update(bytes).digest('hex')}  ${packed.filename}\n`);
