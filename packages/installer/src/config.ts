import { join } from 'node:path';
import type { Plan } from './plan.js';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

function workflow(plan: Plan): string {
  const selected = plan.choices.bots?.selected;
  const identity = selected ? plan.choices.bots!.identities[selected] : undefined;
  return `# Installed runtime workflow

Generated from tracked packages/installer/src/config.ts, workflow-v1, installer
${plan.version}. Update the source, not this installed copy. This workflow applies
to root, named-role and native-child sessions; project policy stays in AGENTS.md.

Complete and validate authorized work, then commit and push through the
repository's documented branch/PR flow in the same turn. Never interpret this as
permission to push directly to a protected branch. Report blocked commit, push
or merge steps promptly. Run git status before finishing; preserve and report
unrelated modified/untracked work. Release, publish, merge, restart or deploy only
with task or repository authority, never merely because validation passed.

Use an isolated worktree or clone. Never bypass hooks or protections or overwrite
another agent's work. Do not share node_modules with an installed checkout. Use
the repository's Node version; the owned launcher places its installed Node on
PATH. Pending final-head CI is not validation; report actual evidence and blockers.

Commit authorship and GitHub authentication are separate. Preserve the human CLI
login. Never run gh auth switch/login/logout or read, extract, export or reuse
credentials from keychains, credential helpers, token files or another account's
configuration. Report access failures. Never change shared Git configuration.
${identity ? `The default agent commit identity is ${JSON.stringify(identity.name)} <${identity.email}>.
Set GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME and GIT_COMMITTER_EMAIL
on each commit command. A named role's explicit identity overrides this default.` : 'Preserve the explicitly supplied agent author/committer identity. If a required\nidentity is missing, report the missing binding rather than inventing one.'}
End every PR, issue or comment with the acting identity, actual provider/model
and actual session ID. Do not use guessed IDs or environment-variable placeholders.

Delegate only when needed through existing linked child tools, with completion,
error and permission notifications enabled. Preserve the requested role. Never
launch detached root/peer agents or use paseo run as a fallback. If that child
mechanism lacks a required capability, report the narrow gap instead of building
another launcher. Existing peers may finish; do not interrupt or duplicate them
merely to change their relationship. Child notifications do not supervise detached
OS jobs: long-running jobs need durable supervision and independent exit/stall
detection, including cleanup of invocation-owned processes.

Write human-facing messages politely and to the point. Lead with the request,
keep a few short paragraphs, and link to details instead of adding tutorials or
background the reader did not ask for. This applies outside specialized skills too.

When a capability needs installation paths or account bindings, consult available
host-binding skills before guessing or inspecting full runtime configuration.
Bindings are private facts, not credentials or permission to authenticate.
`;
}

// Runtime role definitions are generated from reviewed source and the existing
// explicit bot choices, never copied from a user's global instruction files.
function roles(plan: Plan): Record<string, string> {
  const files: Record<string, string> = {};
  for (const role of ['builder', 'reviewer'] as const) {
    const identity = plan.choices.bots?.identities[role];
    if (!identity) continue;
    const description = role === 'builder'
      ? 'Implements and validates focused changes with bot commit authorship'
      : 'Reviews demonstrated regressions and risks with severity-calibrated findings';
    const task = role === 'builder'
      ? 'Complete the assigned task, follow repository instructions, and report concrete evidence and remaining blockers.'
      : 'Inspect the assigned change against its baseline, verify findings, and report severity and file/line evidence. Do not modify the implementation unless authorized. Follow the project review policy; do not invent a universal approval threshold.';
    files[join(plan.root, 'config/opencode/agents', `${role}.md`)] = `---
description: ${description}
mode: all
---

You are a ${role}. ${task}

Your commit identity is ${JSON.stringify(identity.name)} <${identity.email}>.
Set GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME and GIT_COMMITTER_EMAIL
to this role's identity on each Git commit command, including native child
sessions whose inherited environment may name a different role. This overrides
the default identity in the generated ambient runtime workflow. End every PR, issue or comment
with: — ${identity.name} · <actual provider/model> · <actual session ID>.
Write actual values, never environment-variable placeholders or guessed IDs.
`;
  }
  return files;
}
export function configFiles(plan: Plan): Record<string, string> {
  const root = plan.root;
  const plugin = join(root, 'runtime/plugin');
  const relay = new URL(plan.web.relayUrl);
  if (!['ws:', 'wss:'].includes(relay.protocol) || relay.username || relay.password || relay.search || relay.hash || relay.pathname !== '/') throw new Error('Invalid pinned relay origin');
  const relayEndpoint = `${relay.hostname}:${relay.port || (relay.protocol === 'wss:' ? '443' : '80')}`;
  const files: Record<string, string> = {
    ...roles(plan),
    [join(root, 'config/opencode/AGENTS.md')]: workflow(plan),
    [join(root, 'state/paseo/config.json')]: json({ version: 1,
      app: { baseUrl: plan.web.appBaseUrl },
      daemon: { listen: '127.0.0.1:0', cors: { allowedOrigins: [new URL(plan.web.appBaseUrl).origin] }, relay: { enabled: true, endpoint: relayEndpoint, useTls: relay.protocol === 'wss:' } },
      chi: { destinations: { chosen: { name: plan.choices.name, endpoint: plan.choices.endpoint } }, mappings: plan.choices.mappings.map(m => ({ ...m, destination: 'chosen' })) },
    }),
    [join(root, 'config/opencode/opencode.json')]: json({ $schema: 'https://opencode.ai/config.json', update: 'disable',
      plugins: [{ package: plugin, options: { endpoint: plan.choices.endpoint } }],
      permissions: [{ action: '*', resource: '*', effect: 'ask' }],
    }),
    [join(root, 'config/opencode/cli.json')]: json({ plugins: [plugin] }),
    [join(root, 'choices.json')]: json(plan.choices),
  };
  if (plan.choices.bots) files[join(root, 'config/bot-identities.json')] = json(plan.choices.bots);
  return files;
}
export function launcher(plan: Plan): string {
  return `#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = ${JSON.stringify(plan.root)};
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('PASEO_') || key.startsWith('OPENCODE_') || key === 'NODE_OPTIONS' || key === 'BUN_OPTIONS') delete env[key];
Object.assign(env, ${JSON.stringify({ HOME: plan.host.home, XDG_CONFIG_HOME: join(plan.root, 'config'), XDG_DATA_HOME: join(plan.root, 'data'), XDG_STATE_HOME: join(plan.root, 'state'), XDG_CACHE_HOME: join(plan.root, 'cache') })});
env.PATH = join(root, 'bin') + ':' + (env.PATH || '/usr/bin:/bin');
env.GH_CONFIG_DIR ||= ${JSON.stringify(join(plan.host.config, 'gh'))};
const role = ${JSON.stringify(plan.choices.bots?.selected ?? null)};
if (role) {
  const bot = JSON.parse(readFileSync(join(root, 'config/bot-identities.json'), 'utf8')).identities[role];
  env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = bot.name;
  env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = bot.email;
}
const [tool, ...args] = process.argv.slice(2);
const paseo = () => JSON.parse(readFileSync(join(root, 'active-paseo.json'), 'utf8')).path;
if (tool === 'update') {
  env.XDG_DATA_HOME = ${JSON.stringify(plan.host.data)};
  env.XDG_CONFIG_HOME = ${JSON.stringify(plan.host.config)};
}
const commands = {
  paseo: [join(root, 'bin/node'), [join(paseo(), 'packages/cli/dist/index.js'), ...args, '--home', join(root, 'state/paseo')]],
  opencode: [join(root, 'runtime/opencode-bin'), args],
  update: [join(root, 'bin/node'), [join(root, 'installer/dist/cli.js'), 'auto-update', '--confirmed']],
};
if (!Object.hasOwn(commands, tool)) throw new Error('Unknown owned tool');
const [command, argv] = commands[tool];
const child = spawn(command, argv, { env, stdio: 'inherit', cwd: process.cwd() });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
`;
}
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function pairCommand(plan: Plan): string {
  return `${quote(join(plan.root, 'bin/node'))} ${quote(join(plan.root, 'installer/dist/cli.js'))} pair --confirmed`;
}
export function toolLauncher(plan: Plan, tool: 'opencode' | 'paseo'): string {
  return `#!/bin/sh\nexec ${quote(join(plan.root, 'bin/node'))} ${quote(join(plan.root, 'bin/chi-launch.mjs'))} ${tool} "$@"\n`;
}
function xml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
function systemd(value: string) { return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', '$$') + '"'; }
export function services(plan: Plan): Record<string, string> {
  const files: Record<string, string> = {};
  const node = join(plan.root, 'bin/node'), entry = join(plan.root, 'bin/chi-launch.mjs');
  const tasks: Record<string, string[]> = { paseo: ['paseo', 'daemon', 'run'], opencode: ['opencode', 'serve', '--service'] };
  if (plan.choices.autoUpdate) tasks.update = ['update'];
  for (const [name, args] of Object.entries(tasks)) {
    if (plan.host.platform === 'darwin') {
      const schedule = name === 'update' ? '<key>StartInterval</key><integer>86400</integer>' : '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>';
      files[join(plan.host.home, 'Library/LaunchAgents', `center.henkaku.chi.${name}.plist`)] = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>center.henkaku.chi.${name}</string><key>ProgramArguments</key><array>${[node, entry, ...args].map(x => `<string>${xml(x)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(plan.root)}</string>${schedule}</dict></plist>\n`;
    } else {
      files[join(plan.host.config, 'systemd/user', `chi-owned-${name}.service`)] = `[Unit]\nDescription=Chi owned ${name}\n[Service]\nType=${name === 'update' ? 'oneshot' : 'simple'}\nExecStart=${[node, entry, ...args].map(systemd).join(' ')}\nWorkingDirectory=${systemd(plan.root)}\n${name === 'update' ? '' : 'Restart=on-failure\n'}[Install]\nWantedBy=default.target\n`;
    }
  }
  if (plan.host.platform === 'linux' && plan.choices.autoUpdate) files[join(plan.host.config, 'systemd/user/chi-owned-update.timer')] = '[Unit]\nDescription=Chi daily owned update check\n[Timer]\nOnCalendar=daily\nPersistent=true\nRandomizedDelaySec=3600\nUnit=chi-owned-update.service\n[Install]\nWantedBy=timers.target\n';
  return files;
}
