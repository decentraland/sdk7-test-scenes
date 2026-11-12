// node scripts/htn-variant-diff.mjs [options]: bundle scripts/htn-variant-diff.ts with esbuild (like the tests) and run it.
// Options: the header of scripts/htn-variant-diff.ts.
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('variant-diff', {
  entryPoints: [join(root, 'scripts/htn-variant-diff.ts')],
  jsx: 'transform', jsxFactory: 'ReactEcs.createElement',
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
}, { cwd: root })
process.exitCode = result.status ?? 1
