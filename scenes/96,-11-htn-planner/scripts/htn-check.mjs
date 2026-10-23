// Bundle the game-owned TypeScript manifest with the installed independent harness.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
if (!args[0] || args[0] === '--help') {
  console.log('Usage: node scripts/htn-check.mjs <game.tests.ts> [--seed <uint32>] [--case <name>] [--json] [--session <directory>]')
  process.exitCode = args[0] === '--help' ? 0 : 2
} else {
  const manifest = path.resolve(process.cwd(), args[0])
  const entry = path.resolve(import.meta.dirname, '../tools/consumer/check.ts')
  const dir = mkdtempSync(path.join(tmpdir(), 'htn-check-'))
  try {
    const bundled = await build({ stdin: { contents: `import manifest from ${JSON.stringify(manifest)}; import { runCheck } from ${JSON.stringify(entry)}; process.exitCode = runCheck(manifest, ${JSON.stringify(path.dirname(manifest))}, process.argv.slice(2));`, resolveDir: path.dirname(manifest), loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', write: false, logLevel: 'silent' })
    const file = path.join(dir, 'check.cjs')
    writeFileSync(file, bundled.outputFiles[0].contents)
    const result = spawnSync(process.execPath, [file, ...args.slice(1)], { stdio: 'inherit', windowsHide: true })
    process.exitCode = result.status ?? 1
  } catch (error) {
    const message = error.errors?.map(e => e.text).join(' | ') ?? error.message
    if (args.includes('--json')) console.log(JSON.stringify({ version: 1, status: 'config_error', error: message }))
    else console.error('htn:check: ' + message)
    process.exitCode = 2
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
