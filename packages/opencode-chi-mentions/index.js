import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Plugin } from '@opencode/plugin';
import { readGitHubCliToken, exchangeGitHubToken } from '@henkaku-center/chi-native/auth';
import { parseGitHubRemote } from '@henkaku-center/chi-native/repository';
import { append, boundedText, endpointUrl } from '@henkaku-center/chi-native/http';
import { Participants, misconfiguredMessage } from './rpc.js';
import { participantSource } from './source.js';

const exec = promisify(execFile);
export default Plugin.define({
  id: 'chi.mentions',
  async setup(context) {
    const endpoint = context.options?.endpoint;
    let reason = 'missing-endpoint';
    if (typeof endpoint === 'string' && endpoint.trim()) {
      try { endpointUrl(endpoint); reason = undefined; }
      catch { reason = 'invalid-endpoint'; }
    } else if (endpoint !== undefined && endpoint !== null && endpoint !== '') {
      reason = 'invalid-endpoint';
    }
    if (reason) {
      const inactive = { state: 'inactive', reason, message: misconfiguredMessage };
      await context.rpc.register(Participants, {
        status: async () => ({ ...inactive }),
        complete: async (_input, request) => request.error('misconfigured', misconfiguredMessage, { ...inactive }),
      });
      return;
    }
    const complete = participantSource({
      endpoint, directory: context.location.directory,
      async repository(directory, signal) {
        const remote = await exec('git', ['remote', 'get-url', 'origin'], { cwd: directory, signal, maxBuffer: 65536 });
        const repo = parseGitHubRemote(remote.stdout);
        if (!repo) throw new Error('Chi requires a GitHub origin');
        return `github:${repo.owner}/${repo.repo}`;
      },
      async login(signal) {
        const githubToken = readGitHubCliToken();
        if (!githubToken) throw new Error('GitHub login required');
        return exchangeGitHubToken({ githubToken, backendUrl: endpoint, signal });
      },
      async participants({ repo, identity, signal }) {
        const response = await fetch(append(endpointUrl(endpoint), 'participants'), {
          redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
          headers: { authorization: `Bearer ${identity.sessionToken}`, 'x-chi-repo': repo },
        });
        if (!response.ok) { await response.body?.cancel(); throw new Error('Chi participants unavailable'); }
        return JSON.parse(await boundedText(response, 4 * 1024 * 1024));
      },
    });
    await context.rpc.register(Participants, {
      status: async () => ({ state: 'ready', reason: 'configured', message: 'Chi endpoint configured; authorization is reacquired for each completion.' }),
      complete: (input, request) => complete({ ...input, signal: request.signal })
        .catch(() => request.error('unavailable', 'Chi participants unavailable', {})),
    });
  },
});
