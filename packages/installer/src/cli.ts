#!/usr/bin/env node
// The executable entry point must have no static imports. Node evaluates every
// static import before running the first statement, so on a runtime below the
// floor an import of a newer builtin (node:readline/promises) would fail before
// the Node-floor refusal could print its message. Every dependency stays behind
// a dynamic import; `plan.js` loads on unsupported runtimes so its check can
// refuse them clearly.
const { assertNodeFloor } = await import('./plan.js');
try { assertNodeFloor(); }
catch (error) {
  console.error(error instanceof Error ? error.message : 'Installation failed');
  process.exit(1);
}
const { main } = await import('./main.js');
main().catch(error => { console.error(error instanceof Error ? error.message : 'Installation failed'); process.exitCode = 1; });
