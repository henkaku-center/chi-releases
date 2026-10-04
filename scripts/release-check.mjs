import { verifySnapshot } from './snapshot.mjs';

if (process.env.GITHUB_REPOSITORY !== 'henkaku-center/chi-releases' || process.env.GITHUB_EVENT_NAME !== 'push' || !/^refs\/tags\/chi-v1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(process.env.GITHUB_REF ?? '')) throw new Error('Release requires a public-repository tag push');
verifySnapshot(process.cwd(), process.env.GITHUB_REF.slice('refs/tags/'.length));
