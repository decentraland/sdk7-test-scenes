// npm run htn:run -- <file.domain> [method] [args...] [options]: the debugger's Domain Runner in a terminal.
// Options: npm run htn:run -- --help (tools/htn/run.ts). Bundles tools/htn/run-main.ts with esbuild into a temp
// file, runs it, and forwards its exit code (0 plan found, 1 no plan, 2 usage or compile error).
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const bundled = await build({
  entryPoints: [join(root, 'tools/htn/run-main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning'
})
const dir = mkdtempSync(join(tmpdir(), 'htn-run-'))
try {
  const cli = join(dir, 'run.cjs')
  writeFileSync(cli, bundled.outputFiles[0].contents)
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, HTN_REPO_ROOT: root, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
