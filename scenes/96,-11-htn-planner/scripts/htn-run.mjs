// npm run htn:run -- <file.domain> [method] [args...] [options]: the debugger's Domain Runner in a terminal.
// Options: npm run htn:run -- --help (tools/htn/run.ts). Bundles tools/htn/run-main.ts with esbuild into a temp
// file, runs it, and forwards its exit code (0 plan found, 1 no plan, 2 usage or compile error).
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('run', { entryPoints: [join(root, 'tools/htn/run-main.ts')] }, {
  env: { ...process.env, HTN_REPO_ROOT: root, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
})
process.exitCode = result.status ?? 1
