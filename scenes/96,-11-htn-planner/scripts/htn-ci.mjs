// Cross-platform scene CI entry. Usage: npm run htn:ci
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const args = process.argv.slice(2)
if (args.length) {
  console[args.length === 1 && args[0] === '--help' ? 'log' : 'error']('Usage: npm run htn:ci (notices, tests, types, root domains, lint, strict active_plan)')
  process.exitCode = args.length === 1 && args[0] === '--help' ? 0 : 2
} else {
  const root = join(import.meta.dirname, '..')
  const result = await runBundled('ci', {
    stdin: { contents: `import { runCi } from './htn-ci'; process.exitCode = runCi(${JSON.stringify(root)});`, resolveDir: import.meta.dirname, loader: 'ts' }
  }, { args: [], cwd: root })
  process.exitCode = result.status ?? 1
}
