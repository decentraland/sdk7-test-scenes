// Optional author-owned HTN measurement launcher. Node only; never imported by the deployed scene.
import { version } from 'esbuild'
import { runBundled } from './run-bundled.mjs'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
if (!args.length || args[0] === '--help') {
  console.log('Usage: node scripts/htn-measure.mjs path/to/consumer.ts [--quick|--full] [--json FILE|-] [--compare FILE] [options]\nUse a game-owned export-default ConsumerManifest, shared with htn:check. See docs/consumer-benchmark.md.\nPass your manifest followed by --help for all measurement flags.')
  process.exit(0)
}
const manifest = resolve(process.cwd(), args[0])
const hash = createHash('sha256')
function fingerprint(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(dir, item.name)
    if (item.isDirectory()) fingerprint(file)
    else if (item.name.endsWith('.ts')) hash.update(relative(root, file).replaceAll('\\', '/')).update(readFileSync(file))
  }
}
try {
  fingerprint(join(root, 'src/htn-planner'))
  fingerprint(join(root, 'tools/htn'))
  fingerprint(join(root, 'tools/consumer'))
  for (const file of ['compare.ts', 'alloc.ts']) hash.update(readFileSync(join(root, 'scripts/bench', file)))
  const child = await runBundled('measure', {
    stdin: {
      contents: `import manifest from ${JSON.stringify(manifest)}; import { runMeasure } from ${JSON.stringify(join(root, 'tools/consumer/bench.ts'))}; runMeasure(manifest, ${JSON.stringify(dirname(manifest))}, process.argv.slice(2))`,
      resolveDir: root, sourcefile: 'htn-consumer-measure-entry.ts', loader: 'ts'
    },
    define: { 'process.env.HTN_MEASURE_IMPLEMENTATION': JSON.stringify(hash.digest('hex')), 'process.env.HTN_MEASURE_ESBUILD': JSON.stringify(version) }
  }, { nodeArgs: ['--expose-gc'], args: args.slice(1), cwd: process.cwd(), timeout: args.includes('--full') ? 125000 : 15000 })
  if (child.error) console.error('htn:measure:', child.error.message)
  process.exitCode = child.status ?? 2
} catch (error) {
  console.error('htn:measure:', error.message)
  process.exitCode = 2
}
