import { mkdir, writeFile } from 'node:fs/promises'
import { createCrowdLoadTrial, CROWD_LOAD_TRIALS } from '../tools/sdk-detour-probe/crowd-load'
import { createCrowdLoadBackends } from '../tools/sdk-detour-probe/crowd-load-backends'
import { bakeCrowdLoad } from './bake-crowd-load'

const runtime = createCrowdLoadBackends(await bakeCrowdLoad())
const results = []
try {
  for (const trial of CROWD_LOAD_TRIALS) {
    const run = createCrowdLoadTrial(trial, runtime.backends, () => performance.now())
    try {
      while (!run.step()) {
        // Run the same fixed batches as in Explorer.
      }
      const report = run.result()
      for (const result of report) console.log(JSON.stringify(result))
      results.push(...report)
    } finally {
      run.dispose()
    }
  }
} finally {
  runtime.dispose()
}
await mkdir('.comparison', { recursive: true })
await writeFile('.comparison/crowd-load-node.json', JSON.stringify(results, null, 2) + '\n')
