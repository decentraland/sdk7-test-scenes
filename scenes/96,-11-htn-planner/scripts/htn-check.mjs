// Bundle the game-owned TypeScript manifest with the installed independent harness.
import { runBundled } from './run-bundled.mjs'
import path from 'node:path'

const args = process.argv.slice(2)
if (!args[0] || args[0] === '--help') {
  console.log('Usage: node scripts/htn-check.mjs <game.tests.ts> [--seed <uint32>] [--case <name>] [--json] [--session <directory>]')
  process.exitCode = args[0] === '--help' ? 0 : 2
} else {
  const manifest = path.resolve(process.cwd(), args[0])
  const entry = path.resolve(import.meta.dirname, '../tools/consumer/check.ts')
  try {
    const result = await runBundled('check', {
      stdin: { contents: `import manifest from ${JSON.stringify(manifest)}; import { runCheck } from ${JSON.stringify(entry)}; process.exitCode = runCheck(manifest, ${JSON.stringify(path.dirname(manifest))}, process.argv.slice(2));`, resolveDir: path.dirname(manifest), loader: 'ts' },
      logLevel: 'silent'
    }, { args: args.slice(1) })
    process.exitCode = result.status ?? 1
  } catch (error) {
    const message = error.errors?.map(e => e.text).join(' | ') ?? error.message
    if (args.includes('--json')) console.log(JSON.stringify({ version: 1, status: 'config_error', error: message }))
    else console.error('htn:check: ' + message)
    process.exitCode = 2
  }
}
