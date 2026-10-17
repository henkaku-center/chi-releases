import { execFileSync } from 'node:child_process';

export type AuthState = {
  schemaVersion: 1;
  chiUserId: string;
  sessionToken: string;
  identityProvider: string;
  repoProvider: string;
  createdAt: string;
};

export function readGitHubCliToken(): string | null {
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; }
  catch { return null; }
}

export async function exchangeGitHubToken({ githubToken, backendUrl, fetchImpl = globalThis.fetch, signal }: {
  githubToken: string; backendUrl: string; fetchImpl?: typeof fetch; signal?: AbortSignal;
}): Promise<AuthState> {
  signal?.throwIfAborted();
  if (typeof backendUrl !== 'string' || !backendUrl.trim()) throw new Error('Chi destination required: configure an explicit endpoint');
  const url = new URL(backendUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid Chi endpoint');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/auth/token`;
  const response = await fetchImpl(url.toString(), {
    method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ githubToken }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Chi token exchange failed: ${response.status}`); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Chi token exchange returned an incomplete identity');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 65536) throw new Error('Chi token exchange response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (!body || typeof body.chiUserId !== 'string' || !body.chiUserId || typeof body.sessionToken !== 'string' || !body.sessionToken) throw new Error('Chi token exchange returned an incomplete identity');
  return { schemaVersion: 1, chiUserId: body.chiUserId, sessionToken: body.sessionToken,
    identityProvider: typeof body.identityProvider === 'string' ? body.identityProvider : 'unknown',
    repoProvider: typeof body.repoProvider === 'string' ? body.repoProvider : 'unknown', createdAt: new Date().toISOString() };
}
