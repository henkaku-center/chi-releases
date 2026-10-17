/** Explicit caller-selected destinations; path prefixes never replace an origin. */
export function endpointUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('invalid-endpoint');
  return url;
}

export function append(endpoint: URL, path: string): URL {
  const url = new URL(endpoint.href);
  url.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${path}`;
  if (url.origin !== endpoint.origin) throw new Error('invalid-endpoint');
  return url;
}

export async function boundedText(response: Response, max: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty-response');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) throw new Error('evidence-response-limit');
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } finally { await reader.cancel(); reader.releaseLock(); }
}

const evidenceReasons: Record<number, readonly string[]> = {
  409: ['evidence-head-conflict', 'native-authority-conflict', 'object-deleted'],
  413: ['native-store-limit', 'server-secret-scan-limit', 'evidence-entry-limit', 'native-capture-bounds'],
  422: ['server-secret-scan-rejected', 'native-capture-unminimised', 'native-capture-unsupported-message'],
  503: ['native-store-unavailable', 'native-store-corrupt', 'server-secret-scan-unavailable'],
};

/** The status message remains machine-readable; presentation may append only this
 * fixed public reason, never server text, scanner diagnostics or unknown codes. */
export class EvidenceHttpError extends Error {
  constructor(readonly status: number, readonly reason: string | null) { super(`evidence-http-${status}`); }
}

export async function evidenceHttpError(response: Response): Promise<EvidenceHttpError> {
  let reason: string | null = null;
  try {
    const body = JSON.parse(await boundedText(response, 1024));
    if (body?.ok === false && typeof body.reason === 'string' && evidenceReasons[response.status]?.includes(body.reason)) reason = body.reason;
  } catch { /* Malformed/oversized/untrusted diagnostics keep the status-only error. */ }
  return new EvidenceHttpError(response.status, reason);
}
