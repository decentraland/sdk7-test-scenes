// Repository-only CPU-work benchmark; not installed by the portable installer.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..')
const dir = mkdtempSync(join(tmpdir(), 'htn-perf-'))
try {
  const result = await build({ entryPoints: [join(root, 'scripts/htn-perf.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node20', write: false,
    logLevel: 'warning', jsx: 'transform', jsxFactory: 'ReactEcs.createElement', define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) } })
  const file = join(dir, 'perf.cjs')
  writeFileSync(file, result.outputFiles[0].contents)
  const child = spawnSync(process.execPath, [file, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root, timeout: 100000, windowsHide: true })
  if (child.error) console.error(child.error.message)
  process.exitCode = child.status ?? 2
} finally { rmSync(dir, { recursive: true, force: true }) }