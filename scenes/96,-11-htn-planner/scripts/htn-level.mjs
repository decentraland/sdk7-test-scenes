// npm run htn:level -- <level> [options]: bundle scripts/htn-level.ts with esbuild (like the tests) and run it.
// Options: scripts/htn-level.ts (or run it without arguments: the usage). Exit code: the script's (0 ok, 1 a check failed or
// timed out, 2 usage).
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('level', {
  entryPoints: [join(root, 'scripts/htn-level.ts')],
  jsx: 'transform', jsxFactory: 'ReactEcs.createElement',
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
}, { cwd: root })
process.exitCode = result.status ?? 1
