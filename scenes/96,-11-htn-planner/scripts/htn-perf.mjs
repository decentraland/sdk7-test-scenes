// Repository-only CPU-work benchmark; not installed by the portable installer.
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('perf', {
  entryPoints: [join(root, 'scripts/htn-perf.ts')],
  jsx: 'transform', jsxFactory: 'ReactEcs.createElement',
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
}, { timeout: 100000, cwd: root })
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 2
