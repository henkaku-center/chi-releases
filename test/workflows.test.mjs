import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { digest } from '../scripts/snapshot.mjs';

test('public workflow separates tested build from protected OIDC publish', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  assert.match(workflow, /tags: \['chi-v1\.\*\.\*'\]/);
  assert.doesNotMatch(workflow, /workflow_dispatch|workflow_call|pull_request|NPM_TOKEN|NODE_AUTH_TOKEN|provenance=false|--no-verify/);
  const [build, publish] = workflow.split('  publish:\n'); assert.ok(publish);
  assert.match(build, /github.repository == 'henkaku-center\/chi-releases' && github.event_name == 'push'/);
  assert.doesNotMatch(build, /id-token: write|contents: write/);
  assert.match(build, /run: node scripts\/release-check.mjs/);
  assert.match(build, /npm ci --prefix packages\/installer --ignore-scripts/);
  assert.match(build, /npm --prefix packages\/installer run build/);
  assert.match(build, /node packages\/installer\/test\/run.mjs/);
  assert.match(build, /--network=none --user node/);
  assert.match(build, /node packages\/installer\/test\/mutations.mjs/);
  assert.match(build, /run: node scripts\/pack.mjs/);
  assert.ok(build.indexOf('test/mutations.mjs') < build.indexOf('scripts/pack.mjs'));
  assert.match(publish, /needs: build/);
  assert.match(publish, /environment: npm-release/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /run: node scripts\/release-check.mjs/);
  assert.match(publish, /sha256sum --strict -c SHA256SUMS/);
  assert.match(publish, /sha512sum --strict -c SHA512SUMS/);
  assert.match(publish, /npm publish "henkaku-center-chi-\$VERSION.tgz" --access public --provenance --ignore-scripts/);
  assert.doesNotMatch(publish, /npm (ci|run build)|--clobber|--force/);
  assert.match(publish, /gh release create.*--verify-tag/);
  assert.ok(publish.indexOf('SHA512SUMS') < publish.indexOf('npm publish'));
  assert.ok(publish.indexOf('npm publish') < publish.indexOf('gh release create'));
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(ci, /id-token: write|contents: write|npm publish/);
  assert.match(ci, /npm run test:mutations/);
});

test('Pi compatibility files remain byte-identical and cannot be npm-published from root', () => {
  const pkg = JSON.parse(readFileSync('package.json'));
  assert.equal(pkg.private, true); assert.notEqual(pkg.name, '@henkaku-center/chi');
  // Historical callers may source or download these exact two paths.
  assert.equal(digest(readFileSync('packages.env')), '7012a8bb59d34cad05a111de4f1aa926331c8838311edcfb164160ab54d56972');
  assert.equal(digest(readFileSync('scripts/smoke-dev-exe.sh')), 'b71a87fc9aa5fe2778c3ebd821f4ba702de667eecc569319151b19b34379b84c');
  assert.match(readFileSync('docs/BOOTSTRAP.md', 'utf8'), /Historical Pi documentation/);
});
