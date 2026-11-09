// Opt-in reproduction fixture; excludes engine.update, CRDT serialization and rendering.
import { runBundled } from '../run-bundled.mjs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const modes = ['agent-idle', 'agent-senses', 'agent-far', 'agent-async-empty', 'body-root', 'body-nested',
  'squad-root', 'squad-far', 'squad-nested', 'squad-capsule']
const args = process.argv.slice(2)
if (args.length < 2 || args.length > 3 || !modes.includes(args[0]) || !['10', '50', '100'].includes(args[1])) {
  console.error('Usage: node scripts/bench/host-allocation.mjs <mode> <10|50|100> [external-profile.json]')
  console.error('Modes: ' + modes.join(', '))
  process.exitCode = 2
} else {
  const scene = fileURLToPath(new URL('../../', import.meta.url))
  const result = await runBundled('host-allocation', {
    entryPoints: [join(scene, 'benchmarks/host-allocation.workload.ts')],
    format: 'esm', target: 'node22',
    banner: { js: "import{createRequire as __createRequire}from'node:module';const require=__createRequire(import.meta.url);" }
  }, { args, nodeArgs: ['--expose-gc'], cwd: scene })
  if (result.error) console.error(result.error.message)
  process.exitCode = result.status ?? 1
}
