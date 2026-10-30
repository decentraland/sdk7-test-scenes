// npm run htn:golden [-- --export-only | --driver-output <file>]: regenerate the upstream golden plans (E4,
// tools/upstream-golden/main.ts). Bundles it with esbuild into a temp file, runs it, and forwards its exit code.
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('golden', { entryPoints: [join(root, 'tools/upstream-golden/main.ts')] }, {
  env: { ...process.env, HTN_REPO_ROOT: root, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
})
process.exitCode = result.status ?? 1
