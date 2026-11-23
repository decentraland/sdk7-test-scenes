import { mkdir, writeFile } from 'node:fs/promises'
import { init } from 'recast-navigation'
import {
  runTraversalComparison, runTraversalLinkComparison, TRAVERSAL_LINK_RUNS, TRAVERSAL_RUNS
} from '../tools/sdk-detour-probe/traversal-compare'

await init()
const runs = TRAVERSAL_RUNS.map((record) => runTraversalComparison(record, () => performance.now()))
const links = TRAVERSAL_LINK_RUNS.map(runTraversalLinkComparison)
await mkdir('.comparison', { recursive: true })
await writeFile('.comparison/traversal-node.json', JSON.stringify({ runs, links }, null, 2) + '\n')
for (const backend of ['reference', 'navcat', 'detour']) {
  const selected = runs.filter((run) => run.backend === backend)
  const linkRuns = links.filter((run) => run.backend === backend)
  console.log(backend, selected.filter((run) => run.verdict === 'pass').length + '/' + selected.length, 'controller variants',
    linkRuns.filter((run) => run.verdict === 'pass').length + '/' + linkRuns.length, 'native link fixtures')
}
const failures = [...runs, ...links].filter((run) => run.verdict === 'fail')
for (const failure of failures) console.log(JSON.stringify(failure))
if (failures.length) process.exitCode = 1
