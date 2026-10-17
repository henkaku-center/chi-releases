import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'chi-installer-test-')));
try {
  const env = { PATH: process.env.PATH, TMPDIR: root, HOME: root, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache') };
  for (const path of [env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_STATE_HOME, env.XDG_CACHE_HOME]) mkdirSync(path, { recursive: true });
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), join(dirname(fileURLToPath(import.meta.url)), 'installer.test.mjs')], { env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(root, { recursive: true, force: true }); }
