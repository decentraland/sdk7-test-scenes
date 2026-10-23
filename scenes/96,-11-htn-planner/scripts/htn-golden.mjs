// npm run htn:golden [-- --export-only | --driver-output <file>]: regenerate the upstream golden plans (E4,
// tools/upstream-golden/main.ts). Bundles it with esbuild into a temp file, runs it, and forwards its exit code.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const bundled = await build({
  entryPoints: [join(root, 'tools/upstream-golden/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning'
})
const dir = mkdtempSync(join(tmpdir(), 'htn-golden-'))
try {
  const cli = join(dir, 'golden.cjs')
  writeFileSync(cli, bundled.outputFiles[0].contents)
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, HTN_REPO_ROOT: root, INIT_CWD: process.env.INIT_CWD ?? process.cwd() }
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
