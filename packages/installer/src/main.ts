import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { createPlan, hostFrom } from './plan.js';
import { autoUpdate, install, pair, reconfigure, storedPlan, uninstall, update } from './install.js';
import { pairCommand } from './config.js';

// Loaded only by the minimal `cli.ts` entry point, after the Node-floor check.
export async function main() {
  const args = process.argv.slice(2);
  const action = args[0]?.startsWith('--') ? 'install' : args.shift() || 'install';
  let choices: string | undefined, confirmed = false, dryRun = false;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--choices': choices = args[++i]; if (!choices) throw new Error('--choices requires a JSON file'); break;
      case '--confirmed': confirmed = true; break;
      case '--dry-run': dryRun = true; break;
      case '--help': console.log('chi [install|pair|update|auto-update|uninstall|reconfigure] [--choices FILE] [--dry-run] [--confirmed]\nThe choices file explicitly selects endpoint, name, mappings, permissions:"ask", autoUpdate, linger and optional bots. Reconfigure requires interactive confirmation even with --confirmed. Use an exact verified release; foreign-install takeover is not automatic.'); return;
      default: throw new Error('Unknown argument');
    }
  }
  if (!['install', 'pair', 'update', 'auto-update', 'uninstall', 'reconfigure'].includes(action)) throw new Error('Unknown action');
  const host = hostFrom();
  let plan;
  if (choices) plan = createPlan(JSON.parse(await readFile(choices, 'utf8')), host);
  else if (action !== 'install') plan = await storedPlan(host);
  else {
    if (dryRun || !process.stdin.isTTY) throw new Error('Provide --choices FILE; choices are never inferred');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const endpoint = await prompt.question('Chi API endpoint: ');
      const name = await prompt.question('Destination name: ');
      console.log('Enter mappings as JSON [{"repo":"github:owner/repo","audience":"private"}]. [] keeps all repositories local.');
      const mappings = JSON.parse(await prompt.question('Mappings: '));
      const auto = await prompt.question('Enable daily owned daemon updates? [y/N] ');
      const linger = host.platform === 'linux' ? await prompt.question('Allow enabling your user linger for boot supervision? [y/N] ') : 'n';
      plan = createPlan({ endpoint, name, mappings, permissions: 'ask', autoUpdate: auto.toLowerCase() === 'y', linger: linger.toLowerCase() === 'y' }, host);
    } finally { prompt.close(); }
  }
  console.log(JSON.stringify({ action, plan }, null, 2));
  if (!confirmed && !dryRun && action !== 'reconfigure') {
    if (!process.stdin.isTTY) throw new Error('Review the dry-run plan, then pass --confirmed (including ask permissions)');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { confirmed = await prompt.question('Confirm this exact plan, including ask permissions? Type yes: ') === 'yes'; } finally { prompt.close(); }
  }
  const options = { confirmed, dryRun, confirmChanges: async (diff: unknown) => {
    console.log(JSON.stringify(diff, null, 2));
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Reconfigure requires an interactive terminal to confirm the consent diff');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { return await prompt.question('Confirm this consent diff and archive the old installation? Type yes: ') === 'yes'; } finally { prompt.close(); }
  } };
  const actions = { install, pair, update, 'auto-update': autoUpdate, uninstall, reconfigure };
  console.log(JSON.stringify(await actions[action as keyof typeof actions](plan, options), null, 2));
  if (action === 'install' && !dryRun) {
    if (!process.stdout.isTTY) {
      console.log(`Installation complete. Pairing needs an interactive terminal so the private offer is never persisted; run: ${pairCommand(plan)}`);
      return;
    }
    await pair(plan, options);
    console.log(`Open ${plan.web.appBaseUrl}, paste the private pairing offer, sign in with your own GitHub account and confirm the host appears. Model-provider login is separate.`);
  }
}
