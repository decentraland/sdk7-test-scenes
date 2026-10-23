// npm run htn:level -- <level> [options]: bundle scripts/htn-level.ts with esbuild (like the tests) and run it.
// Options: scripts/htn-level.ts (or run it without arguments: the usage). Exit code: the script's (0 ok, 1 a check failed or
// timed out, 2 usage).
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const bundled = await build({
  entryPoints: [join(root, 'scripts/htn-level.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning',
  jsx: 'transform',
  jsxFactory: 'ReactEcs.createElement',
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
})
const dir = mkdtempSync(join(tmpdir(), 'htn-level-'))
try {
  const file = join(dir, 'level.cjs')
  writeFileSync(file, bundled.outputFiles[0].contents)
  const r = spawnSync(process.execPath, [file, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root })
  process.exitCode = r.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
