import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { init } from 'recast-navigation'
import { TRAVERSAL_CASE_REQUIREMENTS } from '../src/traversal/catalog-coverage'
import manifest from '../tools/catalog/manifest.json'
import { advancedActionCases } from '../tools/catalog/advanced-actions'
import { executionCases } from '../tools/catalog/execution'
import { gridCases } from '../tools/catalog/grid'
import { groundCases } from '../tools/catalog/ground'
import { nativeRegressionCases } from '../tools/catalog/native-regressions'
import { revisionCases } from '../tools/catalog/revisions'
import { topologyCases } from '../tools/catalog/topology'
import { timeCrowdCases } from '../tools/catalog/time-crowd'
import { missing, type CatalogCase, type CatalogResult } from '../tools/catalog/types'
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
const traversalRequirements = new Map(TRAVERSAL_CASE_REQUIREMENTS.map((entry) => [entry.id, entry]))
if (traversalRequirements.size !== TRAVERSAL_CASE_REQUIREMENTS.length ||
    TRAVERSAL_CASE_REQUIREMENTS.some(({ id }) => implementations.has(id) || !manifest.some((entry) => entry.id === id))) {
  throw new Error('Traversal has an unknown, duplicated, or already implemented catalog case')
}

await init()
const traversal = TRAVERSAL_RUNS.map((record) => {
  try {
    return runTraversalComparison(record, () => performance.now())
  } catch (error) {
    return { backend: record.backend, scenario: record.scenario.id, variant: record.variant.id, verdict: 'fail', detail: String(error) }
  }
})
type ReportRow = typeof manifest[number] & {
  layer: CatalogCase['layer'] | 'missing'
  coverage: string
} & Record<typeof comparisons[number], CatalogResult>
const report: ReportRow[] = []
for (const entry of manifest) {
  const test = implementations.get(entry.id)
  const required = traversalRequirements.get(entry.id)
  const layer: ReportRow['layer'] = test?.layer ?? (required ? 'integration' : 'missing')
  const coverage = test ? test.coverage ?? 'specified' : required ? required.coverage ?? 'adapted' : 'none'
  async function outcome(backend: typeof comparisons[number]): Promise<CatalogResult> {
    if (test) {
      try {
        return await test.run(backend)
      } catch (error) {
        return { status: 'fail', detail: String(error) }
      }
    }
    if (!required) return missing('No test registered for this catalog case.')
    const runs = traversal.filter((r) =>
      r.scenario === required.scenario && r.backend === backend && required.variants.includes(r.variant))
    const missingVariants = required.variants.filter((variant) => !runs.some((run) => run.variant === variant))
    if (missingVariants.length) return missing('Missing required variants: ' + missingVariants.join(', '))
    if (runs.length !== required.variants.length) return { status: 'fail', detail: 'Duplicated required traversal result.' }
    const failedVariants = runs.filter((run) => run.verdict !== 'pass')
    return {
      status: failedVariants.length ? 'fail' : 'pass',
      detail: failedVariants.length ? 'Failed required variants: ' + failedVariants.map((run) => run.variant + ' (' + run.detail + ')').join(', ')
        : 'Passed required variants: ' + required.variants.join(', ')
    }
  }
  const row = { ...entry, layer, coverage, navcat: await outcome('navcat'), detour: await outcome('detour') }
  report.push(row)
  const statuses = comparisons.map((id) => row[id].status)
  if (statuses.some((status) => status !== 'pass')) {
    console.log(entry.id + ' ' + entry.title + ': ' + statuses.join(' / '))
  }
}

await mkdir('.comparison', { recursive: true })
await writeFile('.comparison/catalog-comparison.json', JSON.stringify(report, null, 2) + '\n')
for (const backend of comparisons) {
  const counts = Object.fromEntries(['pass', 'fail', 'unsupported', 'missing'].map((status) => [
    status, report.filter((row) => row[backend].status === status).length
  ]))
  console.log(backend, counts)
}
if (report.some((row) => comparisons.some((backend) => ['fail', 'missing'].includes(row[backend].status)))) process.exitCode = 1
