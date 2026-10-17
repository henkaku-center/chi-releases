import { createPublicKey, verify } from 'node:crypto';
import { verifyBundle, releaseRepository, releaseWorkflow } from './sigstore.js';

// npm's ECDSA P-256 registry key, reviewed from /-/npm/v1/keys. Key rotation
// requires a reviewed installer release; never trust keys from package metadata.
export const registryKeys = [{
  keyid: 'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U',
  key: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==',
}];
export interface Metadata {
  name: string; version: string;
  dist: { tarball: string; integrity: string; signatures?: { keyid: string; sig: string }[]; attestations?: { url: string; provenance?: { predicateType: string } } };
}

const predicateType = 'https://slsa.dev/provenance/v1';
export function attestationURL(metadata: Metadata): string {
  const expected = `https://registry.npmjs.org/-/npm/v1/attestations/@henkaku-center%2fchi@${metadata.version}`;
  if (metadata.dist.attestations?.url !== expected || metadata.dist.attestations.provenance?.predicateType !== predicateType) throw new Error('Missing or unexpected installer provenance URL/type');
  return expected;
}
export function verifyProvenance(metadata: Metadata, bytes: Buffer): void {
  const { attestations } = JSON.parse(bytes.toString());
  const matches = Array.isArray(attestations) ? attestations.filter(a => a?.predicateType === predicateType) : [];
  if (matches.length !== 1) throw new Error('Expected exactly one installer SLSA provenance attestation');
  const bundle = matches[0].bundle;
  if (bundle?.dsseEnvelope?.payloadType !== 'application/vnd.in-toto+json') throw new Error('Invalid provenance payload type');
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString());
  const repository = releaseRepository, path = releaseWorkflow;
  const ref = `refs/tags/chi-v${metadata.version}`;
  const definition = statement.predicate?.buildDefinition, workflow = definition?.externalParameters?.workflow;
  if (statement._type !== 'https://in-toto.io/Statement/v1' || statement.predicateType !== predicateType || definition?.buildType !== 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1') throw new Error('Invalid installer provenance statement');
  if (workflow?.repository !== repository || workflow.path !== path || workflow.ref !== ref) throw new Error('Unexpected installer provenance workflow');
  const subject = statement.subject;
  if (!Array.isArray(subject) || subject.length !== 1 || subject[0]?.name !== `pkg:npm/%40henkaku-center/chi@${metadata.version}` || subject[0]?.digest?.sha512 !== Buffer.from(metadata.dist.integrity.slice(7), 'base64').toString('hex')) throw new Error('Installer provenance subject mismatch');
  verifyBundle(bundle, `${repository}/${path}@${ref}`);
}
export function verifyRegistry(metadata: Metadata): void {
  if (metadata.dist?.tarball !== `https://registry.npmjs.org/@henkaku-center/chi/-/chi-${metadata.version}.tgz`) throw new Error('Unexpected installer tarball URL');
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(metadata.dist.integrity)) throw new Error('Invalid installer integrity');
  const message = Buffer.from(`${metadata.name}@${metadata.version}:${metadata.dist.integrity}`);
  const signatures = metadata.dist.signatures;
  if (!Array.isArray(signatures) || !signatures.some(signature => {
    const key = registryKeys.find(key => key.keyid === signature?.keyid);
    if (!key || typeof signature.sig !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature.sig)) return false;
    try { return verify('sha256', message, createPublicKey({ key: Buffer.from(key.key, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature.sig, 'base64')); }
    catch { return false; }
  })) throw new Error('Installer registry signature is missing, unknown or invalid');
}
