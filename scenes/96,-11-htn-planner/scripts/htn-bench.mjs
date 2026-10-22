// npm run htn:bench [-- options]: bundle scripts/htn-bench.ts with esbuild (like the tests) and run it.
// Options are listed at the top of scripts/htn-bench.ts. Not part of npm test (slow); its smoke test and its
// structural-counter gate are. Runs with --expose-gc: a full collection before each allocation measurement.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const bundled = await build({
  entryPoints: [join(root, 'scripts/htn-bench.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning',
  // The counter gate runs every playground level (src/playgrounds.ts), as htn:level does.
  jsx: 'transform',
  jsxFactory: 'ReactEcs.createElement',
  define: { 'process.env.HTN_REPO_ROOT': JSON.stringify(root) }
})
const dir = mkdtempSync(join(tmpdir(), 'htn-bench-'))
try {
  const file = join(dir, 'bench.cjs')
  writeFileSync(file, bundled.outputFiles[0].contents)
  const r = spawnSync(process.execPath, ['--expose-gc', file, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root })
  process.exitCode = r.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
