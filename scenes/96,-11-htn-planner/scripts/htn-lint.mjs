// npm run htn:lint -- <file.domain|dir>... [--json] [--rule <id>]... [--config <file>] [--strict]: domain-shape lint
// in layers (compile, symbols, structure), JSON for AI agents. Options: npm run htn:lint -- --help (tools/lint/cli.ts).
// Bundles tools/lint/main.ts with esbuild into a temp file, runs it, and forwards its exit code (0 clean or warnings,
// 1 errors, 2 usage or config error).
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const bundled = await build({
  entryPoints: [join(root, 'tools/lint/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning'
})
const dir = mkdtempSync(join(tmpdir(), 'htn-lint-'))
try {
  const cli = join(dir, 'lint.cjs')
  writeFileSync(cli, bundled.outputFiles[0].contents)
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, HTN_REPO_ROOT: root, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
