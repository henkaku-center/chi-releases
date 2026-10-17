/** Repository identity accepted by Chi's GitHub authorization boundary. */
export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const trimmed = (url || '').trim();
  const match = trimmed.match(/^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}
