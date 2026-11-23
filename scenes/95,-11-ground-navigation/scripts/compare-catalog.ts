import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { init } from 'recast-navigation'
import manifest from '../tools/catalog/manifest.json'
import { advancedActionCases } from '../tools/catalog/advanced-actions'
import { executionCases } from '../tools/catalog/execution'
import { gridCases } from '../tools/catalog/grid'
import { groundCases } from '../tools/catalog/ground'
import { nativeRegressionCases } from '../tools/catalog/native-regressions'
import { revisionCases } from '../tools/catalog/revisions'
import { topologyCases } from '../tools/catalog/topology'
import { timeCrowdCases } from '../tools/catalog/time-crowd'
import type { CatalogCase, CatalogResult } from '../tools/catalog/types'
import { TRAVERSAL_RUNS, runTraversalComparison } from '../tools/sdk-detour-probe/traversal-compare'

const comparisons = ['navcat', 'detour'] as const
process.env.DCL_MAPF_DATA ??= resolve('.comparison/movingai')
const catalogCases: CatalogCase[] = [
  ...groundCases, ...topologyCases, ...gridCases, ...revisionCases, ...nativeRegressionCases,
  ...advancedActionCases, ...executionCases, ...timeCrowdCases
]
const implementations = new Map(catalogCases.map((entry) => [entry.id, entry]))
if (implementations.size !== catalogCases.length || catalogCases.some(({ id }) => !manifest.some((entry) => entry.id === id))) {
  throw new Error('Catalog has an unknown or duplicated implementation')
}

await init()
const traversal = TRAVERSAL_RUNS.map((record) => ({
  caseIds: record.scenario.cases, ...runTraversalComparison(record, () => performance.now())
}))
type ReportRow = typeof manifest[number] & {
  layer: CatalogCase['layer'] | 'missing'
  coverage: string
} & Partial<Record<typeof comparisons[number], CatalogResult>>
const report: ReportRow[] = []
for (const entry of manifest) {
  const test = implementations.get(entry.id)
  const previous = traversal.filter((result) => result.caseIds.includes(entry.id))
  if (test && previous.length) throw new Error('Catalog case has two owners: ' + entry.id)
  let layer: CatalogCase['layer'] | 'missing' = test?.layer ?? 'missing'
  let coverage = test ? test.coverage ?? 'specified' : 'none'
  const outcomes: Partial<Record<typeof comparisons[number], CatalogResult>> = {}
  if (test) {
    for (const backend of comparisons) {
      try {
        outcomes[backend] = await test.run(backend)
      } catch (error) {
        outcomes[backend] = { status: 'fail', detail: String(error) }
      }
    }
  } else if (previous.length) {
    layer = 'integration'
    coverage = 'adapted'
    for (const backend of comparisons) {
      const runs = previous.filter((r) => r.backend === backend)
      const passed = runs.filter((r) => r.verdict === 'pass').length
      outcomes[backend] = {
        status: passed === runs.length && passed > 0 ? 'pass' : 'fail',
        detail: `${passed}/${runs.length} variants in the original traversal fixture`
      }
    }
  }
  const row = { ...entry, layer, coverage, ...outcomes }
  report.push(row)
  const statuses = comparisons.map((id) => outcomes[id]?.status ?? 'missing')
  if (statuses.some((status) => status !== 'pass')) {
    console.log(entry.id + ' ' + entry.title + ': ' + statuses.join(' / '))
  }
}

await mkdir('.comparison', { recursive: true })
await writeFile('.comparison/catalog-comparison.json', JSON.stringify(report, null, 2) + '\n')
for (const backend of comparisons) {
  const counts = Object.fromEntries(['pass', 'fail', 'unsupported', 'missing'].map((status) => [
    status, report.filter((row) => (row[backend]?.status ?? 'missing') === status).length
  ]))
  console.log(backend, counts)
}
if (report.some((row) => comparisons.some((backend) => row[backend]?.status === 'fail'))) process.exitCode = 1
