import { bundleFromJSON } from '@sigstore/bundle';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import { Verifier, toSignedEntity, toTrustMaterial } from '@sigstore/verify';
import root from './trusted-root.json' with { type: 'json' };

// Reviewed public Sigstore roots, never supplied by metadata or the environment.
// Bundled at build time; verification does not use a user's TUF cache or network.
export const trustRoot = root;
// The publisher runs in the public source-snapshot repository, never the private
// monorepo. Statement and certificate checks share these reviewed constants.
export const releaseRepository = 'https://github.com/henkaku-center/chi-releases';
export const releaseWorkflow = '.github/workflows/release.yml';
// @sigstore/verify treats subjectAlternativeName as an unanchored regular
// expression. Escape the reviewed identity and anchor both ends so a certificate
// for a longer or altered release tag (chi-v1.0.10, chi-v1.0.1-evil, chi-v1x0x1)
// can never match the expected exact identity.
function exactIdentity(identity: string): string {
  return '^' + identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
}
export function verifyBundle(json: unknown, identity: string): void {
  const entity = toSignedEntity(bundleFromJSON(json));
  new Verifier(toTrustMaterial(TrustedRoot.fromJSON(trustRoot))).verify(entity, {
    subjectAlternativeName: exactIdentity(identity),
    extensions: { issuer: 'https://token.actions.githubusercontent.com' },
  });
}
