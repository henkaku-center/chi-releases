// Entirely synthetic PKI. No identity provider, credentials or network requests.
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { initializeCA, initializeCTLog, initializeTLog } from '@sigstore/mock';
import { trustRoot } from '../dist/sigstore.js';

const keys = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const clock = new Date();
const ctlog = await initializeCTLog(keys(), clock);
const ca = await initializeCA(keys(), ctlog, clock);
// A second reviewed test authority that embeds no SCT, so the certificate
// transparency threshold can be exercised independently of the rest of the bundle.
const caNoSct = await initializeCA(keys(), undefined, clock);
const tlog = await initializeTLog('https://rekor.example.test', keys(), clock);
// Advance the shared fixture clock after CA creation, including on slow runners.
// Rekor timestamps truncate to seconds; stay strictly inside certificate validity.
clock.setTime(Date.now() + 1000);
const logRoot = (key, id) => ({
  baseUrl: 'https://test.invalid', hashAlgorithm: 'SHA2_256',
  publicKey: { rawBytes: key.toString('base64'), keyDetails: 'PKIX_ECDSA_P256_SHA_256' },
  logId: { keyId: id.toString('base64') },
});
// Test-only addition, analogous to the synthetic npm authority. Nothing from a
// downloaded bundle, environment or user config can alter production trust.
trustRoot.certificateAuthorities.push({ certChain: { certificates: [{ rawBytes: Buffer.from(caNoSct.rootCertificate.buffer).toString('base64') }] } });
trustRoot.certificateAuthorities.push({ certChain: { certificates: [{ rawBytes: Buffer.from(ca.rootCertificate.buffer).toString('base64') }] } });
trustRoot.ctlogs.push(logRoot(ctlog.publicKey, Buffer.from(ctlog.logID.buffer)));
trustRoot.tlogs.push(logRoot(tlog.publicKey, createHash('sha256').update(tlog.publicKey).digest()));

export const provenanceURL = 'https://registry.npmjs.org/-/npm/v1/attestations/@henkaku-center%2fchi@1.0.1';
export const predicateType = 'https://slsa.dev/provenance/v1';
export async function provenance(metadata, { changeStatement = () => {}, identity, issuer = 'https://token.actions.githubusercontent.com', payloadType = 'application/vnd.in-toto+json', noSct = false } = {}) {
  const repository = 'https://github.com/henkaku-center/chi-releases', path = '.github/workflows/release.yml', ref = `refs/tags/chi-v${metadata.version}`;
  const statement = {
    _type: 'https://in-toto.io/Statement/v1', predicateType,
    subject: [{ name: `pkg:npm/%40henkaku-center/chi@${metadata.version}`, digest: { sha512: Buffer.from(metadata.dist.integrity.slice(7), 'base64').toString('hex') } }],
    predicate: { buildDefinition: { buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1', externalParameters: { workflow: { repository, path, ref } } } },
  };
  changeStatement(statement);
  const signer = keys(), publicKey = signer.publicKey.export({ format: 'der', type: 'spki' });
  const certificate = Buffer.from((await (noSct ? caNoSct : ca).issueCertificate({ publicKey, subjectAltName: identity ?? `${repository}/${path}@${ref}`, extensions: [{ oid: '1.3.6.1.4.1.57264.1.1', value: issuer, legacy: true }] })).buffer);
  const payload = Buffer.from(JSON.stringify(statement));
  const signature = sign('sha256', Buffer.concat([Buffer.from(`DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} `), payload]), signer.privateKey).toString('base64');
  const pem = `-----BEGIN CERTIFICATE-----\n${certificate.toString('base64')}\n-----END CERTIFICATE-----\n`;
  const body = { apiVersion: '0.0.1', kind: 'dsse', spec: { payloadHash: { algorithm: 'sha256', value: createHash('sha256').update(payload).digest('hex') }, signatures: [{ signature, verifier: Buffer.from(pem).toString('base64') }] } };
  const logged = Object.values(await tlog.log(body))[0];
  const bundle = {
    mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.1',
    dsseEnvelope: { payload: payload.toString('base64'), payloadType, signatures: [{ sig: signature, keyid: '' }] },
    verificationMaterial: { x509CertificateChain: { certificates: [{ rawBytes: certificate.toString('base64') }] }, tlogEntries: [{
      logIndex: String(logged.logIndex), logId: { keyId: Buffer.from(logged.logID, 'hex').toString('base64') }, kindVersion: { kind: 'dsse', version: '0.0.1' },
      integratedTime: String(logged.integratedTime), canonicalizedBody: logged.body,
      inclusionPromise: { signedEntryTimestamp: logged.verification.signedEntryTimestamp },
    }] },
  };
  return { attestations: [{ predicateType, bundle }] };
}
