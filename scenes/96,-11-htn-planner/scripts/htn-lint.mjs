// npm run htn:lint -- <file.domain|dir>... [--json] [--rule <id>]... [--config <file>] [--strict]: domain-shape lint
// in layers (compile, symbols, structure), JSON for AI agents. Options: npm run htn:lint -- --help (tools/lint/cli.ts).
// Bundles tools/lint/main.ts with esbuild into a temp file, runs it, and forwards its exit code (0 clean or warnings,
// 1 errors, 2 usage or config error).
import { runBundled } from './run-bundled.mjs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = await runBundled('lint', { entryPoints: [join(root, 'tools/lint/main.ts')] }, {
  env: { ...process.env, HTN_REPO_ROOT: root, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
})
process.exitCode = result.status ?? 1
