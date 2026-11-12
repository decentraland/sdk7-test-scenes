// npm run htn:bench [-- options]: bundle scripts/htn-bench.ts with esbuild (like the tests) and run it.
// Options are listed at the top of scripts/htn-bench.ts. Not part of npm test (slow); its smoke test and its
// structural-counter gate are. Runs with --expose-gc: a full collection before each allocation measurement.
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('bench', {
  entryPoints: [join(root, 'scripts/htn-bench.ts')],
  jsx: 'transform', jsxFactory: 'ReactEcs.createElement',
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
}, { nodeArgs: ['--expose-gc'], cwd: root })
process.exitCode = result.status ?? 1
