// Checksums are release inputs, never learned from a downloaded sidecar at install time.
// Official nodejs.org/dist/v24.18.0/SHASUMS256.txt and the gh/gitleaks release checksum files.
export const version = '1.0.0';
export const web = {
  repository: 'gszep/paseo', commit: 'fc46610aa635a0c49ce4d335eefba7fd7e3ec42d',
  appBaseUrl: 'https://chi.henkaku.center', relayUrl: 'wss://relay.paseo.sh', name: 'Chi', brand: 'web/brand',
  agentGuideCommit: 'f8dac9c9b2e06ecb8c695b3b2a6a0ddfd28e87f5',
  agentGuideBlob: '77927a6d431e75622334e93bb13d62ae2938d105',
  connectApiUrl: 'https://chi-backend-vadmp23swa-an.a.run.app/api',
};
export const sources = {
  // Fresh-host baseline with reviewed reasoning-preservation/capacity fixes.
  // Legacy helper-preserving host promotion remains a separate, held operation.
  paseo: { repository: 'gszep/paseo', commit: 'fc46610aa635a0c49ce4d335eefba7fd7e3ec42d' },
  opencode: { repository: 'gszep/opencode', commit: '54f70dc4bb2d53b823aeb746f192d432058c028c', version: '2.0.15-chi.2' },
  // Provenance of the embedded plugin only; installation never fetches this repository.
  chi: { repository: 'henkaku-center/chi', commit: 'e7318db0a493495ab0cb7dd34d27a08948b82207', payloadSha256: '478b8100f927b222183be1d2e6e3dbc33112b903b91f7ad7b3524cf275541a0e', files: {
    'packages/opencode-chi-mentions/package.json': 'd5655beff86a4fa7d50127ec54f33ac18af2ad29d971cb948c42b20878e29325',
    'packages/opencode-chi-mentions/index.js': 'cf1e0641b444552e33a6a1f5312e9bab19a3152fd95c0d1a1a65111cdedaee54',
    'packages/opencode-chi-mentions/tui.js': '01c52041da70ff655870cea2753f063ad5cc636acdfdf27bbb9d4b733cf840ed',
    'packages/opencode-chi-mentions/rpc.js': '9e44d1b9dc30771c5654517f880b8ea2bde2b7789e833e3ccfa65795b83b8e96',
    'packages/opencode-chi-mentions/source.js': '78552f9dd3e67c471d4cf8f0b737870f557d58bd2082db9bfe177f0eb9d758d8',
    'packages/chi-native/src/github-login.ts': '3aab516d38dbd0bd8aecbf3c74cf458150e4eea591caeb00649405fae1063ed5',
    'packages/chi-native/src/repository.ts': '0ebe2f1454e350018a6d07bfeadd7a80aa0411148b8fc25ffdf85deeefb0f617',
    'backend/scripts/http-client.ts': '5ba6b958ef55a9f428660179d3a42f5f83e01a10ea71428eb6691908c69bd557',
  } },
};
export type Platform = 'darwin' | 'linux';
export type Arch = 'arm64' | 'x64';
export interface Artifact { url: string; sha256: string; member: string; format: 'tar' | 'zip'; version: string }
const nodeHashes = {
  'darwin-arm64': 'e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1',
  'darwin-x64': 'dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080',
  'linux-arm64': '6b4484c2190274175df9aa8f28e2d758a819cb1c1fe6ab481e2f95b463ab8508',
  'linux-x64': '783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8',
};
const leakHashes = {
  'darwin-arm64': 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  'darwin-x64': 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  'linux-arm64': 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  'linux-x64': '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
};
const ghHashes = {
  'darwin-arm64': 'aedf5982cfda5e8f27ae6c67d9ed0c0ed6079c4d7cf051784197ab1896a7976b',
  'darwin-x64': 'e765fc9b8291a5beec699824a8a4e58aadbd9a487b414f2891c31cc69b38a963',
  'linux-arm64': '15518ce7455beb67e91928cc0b5d8431d491afeced45d173929d29f2647810ac',
  'linux-x64': '664b70c80aaddf7b45c4df890324d3876762e630cffb429971791b8e2fb2e04b',
};
export function artifacts(platform: Platform, arch: Arch): Record<'node' | 'gh' | 'gitleaks', Artifact> {
  const key = `${platform}-${arch}` as const;
  const node = `node-v24.18.0-${key}`;
  const gh = `gh_2.70.0_${platform === 'darwin' ? 'macOS' : platform}_${arch === 'x64' ? 'amd64' : arch}`;
  const format = platform === 'darwin' ? 'zip' : 'tar';
  return {
    node: { url: `https://nodejs.org/dist/v24.18.0/${node}.tar.gz`, sha256: nodeHashes[key], member: `${node}/bin/node`, format: 'tar', version: '24.18.0' },
    gh: { url: `https://github.com/cli/cli/releases/download/v2.70.0/${gh}.${format === 'zip' ? 'zip' : 'tar.gz'}`, sha256: ghHashes[key], member: `${gh}/bin/gh`, format, version: '2.70.0' },
    gitleaks: { url: `https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_${key.replace('-', '_')}.tar.gz`, sha256: leakHashes[key], member: 'gitleaks', format: 'tar', version: '8.30.1' },
  };
}
