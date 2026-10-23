// Cross-platform scene CI entry. Usage: npm run htn:ci
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
if (args.length) {
  console[args.length === 1 && args[0] === '--help' ? 'log' : 'error']('Usage: npm run htn:ci (notices, tests, types, root domains, lint, strict active_plan)')
  process.exitCode = args.length === 1 && args[0] === '--help' ? 0 : 2
} else {
  const root = join(import.meta.dirname, '..')
  const dir = mkdtempSync(join(tmpdir(), 'htn-ci-'))
  try {
    const bundled = await build({
      stdin: { contents: `import { runCi } from './htn-ci'; process.exitCode = runCi(${JSON.stringify(root)});`, resolveDir: import.meta.dirname, loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', write: false, logLevel: 'warning'
    })
    const cli = join(dir, 'ci.cjs')
    writeFileSync(cli, bundled.outputFiles[0].contents)
    const result = spawnSync(process.execPath, [cli], { cwd: root, stdio: 'inherit', windowsHide: true })
    process.exitCode = result.status ?? 1
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
