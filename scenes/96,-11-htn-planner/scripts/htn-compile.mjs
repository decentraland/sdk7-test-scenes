// Compile a .domain file into a DomainIR TS module (Node only; the compiler never ships in the scene).
// Usage: npm run htn:compile -- <file.domain> <out.ts> [exportName] [--ir-import <specifier>]
//        npm run htn:compile -- --check <file.domain|file.worldstate>...   (validate only; exit 4 on errors)
// Bundles tools/htn/cli.ts with esbuild into a temp file, runs it, and forwards its exit code.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const bundled = await build({
  entryPoints: [join(root, 'tools/htn/cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  logLevel: 'warning'
})
const dir = mkdtempSync(join(tmpdir(), 'htn-compile-'))
try {
  const cli = join(dir, 'cli.cjs')
  writeFileSync(cli, bundled.outputFiles[0].contents)
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, HTN_REPO_ROOT: root }
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
