const owner = /^github:[a-z\d](?:[a-z\d-]{0,38})$/;
const handle = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

/** No directory or credential cache: each request reacquires current authority. */
export function participantSource({ endpoint, directory, repository, login, participants }) {
  const url = new URL(endpoint);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid Chi endpoint');
  return async ({ query, signal }) => {
    signal.throwIfAborted();
    const repo = await repository(directory, signal);
    if (!/^github:[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Chi repository unavailable');
    const identity = await login(signal);
    signal.throwIfAborted();
    const actor = identity.chiUserId.toLowerCase();
    if (!owner.test(actor)) throw new Error('Chi identity unavailable');
    const result = await participants({ repo, identity, signal });
    signal.throwIfAborted();
    if (result?.ok !== true || typeof result.self !== 'string' || result.self.toLowerCase() !== actor || !Array.isArray(result.participants)) throw new Error('Chi participant identity mismatch');
    const records = new Map();
    for (const person of result.participants) {
      if (typeof person?.ownerId !== 'string' || typeof person.handle !== 'string' || !owner.test(person.ownerId.toLowerCase()) || !handle.test(person.handle)) throw new Error('Invalid Chi participant');
      const id = person.ownerId.toLowerCase();
      if (records.has(id) && records.get(id) !== person.handle) throw new Error('Conflicting Chi participant');
      records.set(id, person.handle);
    }
    const prefix = query.toLowerCase();
    return [...records].filter(([, value]) => value.toLowerCase().startsWith(prefix))
      .sort((a, b) => a[1].localeCompare(b[1])).slice(0, 100)
      .map(([ownerId, value]) => ({ id: ownerId, value, description: 'Chi collaborator', data: { ownerId, handle: value, actor, repo, endpoint: url.href } }));
  };
}
