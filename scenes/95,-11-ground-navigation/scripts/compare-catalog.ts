import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { init } from 'recast-navigation'
import { TRAVERSAL_CASE_REQUIREMENTS } from '../src/traversal/catalog-coverage'
import recipes from '../tools/catalog/creator-recipes.json'
import manifest from '../tools/catalog/manifest.json'
import { advancedActionCases } from '../tools/catalog/advanced-actions'
import { executionCases } from '../tools/catalog/execution'
import { gridCases } from '../tools/catalog/grid'
import { groundCases } from '../tools/catalog/ground'
import { nativeRegressionCases } from '../tools/catalog/native-regressions'
import { renderPerformanceReport, replacePerformanceReport } from '../tools/catalog/performance-report'
import { authoringRecipeCases } from '../tools/catalog/recipe-authoring'
import { creatorBehaviorCases } from '../tools/catalog/recipe-creator-behavior'
import { creatorGeometryCases } from '../tools/catalog/recipe-creator-geometry'
import { creatorOpsCases } from '../tools/catalog/recipe-creator-ops'
import { engineRecipeCases } from '../tools/catalog/recipe-engine'
import { gameplayRecipeCases } from '../tools/catalog/recipe-gameplay'
import { recipeRuntimeCases } from '../tools/catalog/recipe-runtime'
import { revisionCases } from '../tools/catalog/revisions'
import { topologyCases } from '../tools/catalog/topology'
import { timeCrowdCases } from '../tools/catalog/time-crowd'
import { missing, type CatalogCase, type CatalogResult } from '../tools/catalog/types'
import { TRAVERSAL_RUNS, runTraversalComparison } from '../tools/sdk-detour-probe/traversal-compare'

const comparisons = ['navcat', 'detour'] as const
type Backend = typeof comparisons[number]
const args = process.argv.slice(2)
const verifyOnly = args.includes('--verify-only')
const measuredTrials = verifyOnly ? 0 : 5
const selectedId = args.find((arg) => arg.startsWith('--case='))?.slice('--case='.length)
const detourWasm = args.find((arg) => arg.startsWith('--detour-wasm='))?.slice('--detour-wasm='.length)
const updateReadme = args.includes('--update-readme')
const selectedEntries = selectedId === undefined ? manifest : manifest.filter((entry) => entry.id === selectedId)
if (!selectedEntries.length) throw new Error('Unknown catalogue case: ' + selectedId)
if (selectedId !== undefined && updateReadme) throw new Error('Updating README.md requires the complete catalogue.')
if (verifyOnly && updateReadme) throw new Error('Updating README.md requires measured trials.')
const outputName = verifyOnly ? 'catalog-verification' + (selectedId ? '-' + selectedId : '')
  : selectedId === undefined ? 'catalog-comparison' : 'catalog-' + selectedId
process.env.DCL_MAPF_DATA ??= resolve('.comparison/movingai')
const catalogCases: CatalogCase[] = [
  ...groundCases, ...topologyCases, ...gridCases, ...revisionCases, ...nativeRegressionCases,
  ...advancedActionCases, ...executionCases, ...timeCrowdCases,
  ...authoringRecipeCases, ...recipeRuntimeCases, ...gameplayRecipeCases, ...engineRecipeCases,
  ...creatorGeometryCases, ...creatorBehaviorCases, ...creatorOpsCases
]
const implementations = new Map(catalogCases.map((entry) => [entry.id, entry]))
if (implementations.size !== catalogCases.length || catalogCases.some(({ id }) => !manifest.some((entry) => entry.id === id))) {
  throw new Error('Catalog has an unknown or duplicated implementation')
}
const indexedRecipes = new Set(recipes.map(({ caseId }) => caseId))
const listedRecipes = manifest.filter(({ catalog }) => catalog === 'recipe')
if (indexedRecipes.size !== recipes.length || indexedRecipes.size !== listedRecipes.length ||
    listedRecipes.some(({ id }) => !indexedRecipes.has(id) || !implementations.has(id))) {
  throw new Error('The recipe index, manifest and catalogue implementations disagree.')
}
const traversalRequirements = new Map(TRAVERSAL_CASE_REQUIREMENTS.map((entry) => [entry.id, entry]))
if (traversalRequirements.size !== TRAVERSAL_CASE_REQUIREMENTS.length ||
    TRAVERSAL_CASE_REQUIREMENTS.some(({ id }) => implementations.has(id) || !manifest.some((entry) => entry.id === id))) {
  throw new Error('Traversal has an unknown, duplicated, or already implemented catalog case')
}

let detourWasmHash: string | undefined
if (detourWasm !== undefined) {
  if (!detourWasm) throw new Error('--detour-wasm= requires a path to a WASM module factory.')
  const path = resolve(detourWasm)
  detourWasmHash = createHash('sha256').update(await readFile(path)).digest('hex')
  const { default: factory } = await import(pathToFileURL(path).href)
  if (typeof factory !== 'function') throw new Error('The Detour WASM module must export a default factory.')
  await init(factory)
} else {
  await init()
}
function measureTraversal(record: typeof TRAVERSAL_RUNS[number]) {
  const start = performance.now()
  try {
    const result = runTraversalComparison(record, () => performance.now())
    return { ...result, wallMs: performance.now() - start }
  } catch (error) {
    return {
      backend: record.backend, scenario: record.scenario.id, variant: record.variant.id, verdict: 'error',
      detail: String(error), ticks: 0, wallMs: performance.now() - start
    }
  }
}

const requiredTraversal = TRAVERSAL_CASE_REQUIREMENTS.filter(({ id }) => selectedEntries.some((entry) => entry.id === id))
const traversalRecords = TRAVERSAL_RUNS.filter((record) =>
  record.backend !== 'reference' && requiredTraversal.some((item) =>
    item.scenario === record.scenario.id && item.variants.includes(record.variant.id)))
const traversal = Array.from({ length: measuredTrials + 1 }, (_, index) =>
  (index % 2 ? [...traversalRecords].reverse() : traversalRecords).map(measureTraversal))

function traversalOutcome(backend: Backend, required: typeof TRAVERSAL_CASE_REQUIREMENTS[number]): CatalogResult {
  const trials = traversal.map((records) => records.filter((run) =>
    run.scenario === required.scenario && run.backend === backend && required.variants.includes(run.variant)))
  const initial = trials[0]
  const missingVariants = required.variants.filter((variant) => !initial.some((run) => run.variant === variant))
  if (missingVariants.length) return missing('Missing required variants: ' + missingVariants.join(', '))
  if (initial.length !== required.variants.length) return { status: 'fail', detail: 'Duplicated required traversal result.' }
  const failedVariants = trials.flat().filter((run) => run.verdict !== 'pass')
  return {
    status: failedVariants.some((run) => run.verdict === 'error') ? 'error' : failedVariants.length ? 'fail' : 'pass',
    detail: failedVariants.length ? 'Failed required variants: ' + failedVariants.map((run) => run.variant + ' (' + run.detail + ')').join(', ')
      : 'Passed required variants: ' + required.variants.join(', '),
    metrics: { ticks: initial.reduce((sum, run) => sum + run.ticks, 0), variants: initial.length },
    ...(!verifyOnly && {
      performance: { scope: 'required variants', samplesMs: trials.slice(1).map((runs) => runs.reduce((sum, run) => sum + run.wallMs, 0)) }
    })
  }
}

async function measureCase(test: CatalogCase, backend: Backend) {
  const start = performance.now()
  let result: CatalogResult
  try {
    result = await test.run(backend)
  } catch (error) {
    result = { status: 'error', detail: String(error) }
  }
  return { result, wallMs: performance.now() - start }
}

async function measurePair(test: CatalogCase): Promise<Record<Backend, CatalogResult>> {
  const trials: Record<Backend, Awaited<ReturnType<typeof measureCase>>[]> = { navcat: [], detour: [] }
  for (let index = 0; index <= measuredTrials; index++) {
    const order = index % 2 ? [...comparisons].reverse() : comparisons
    for (const backend of order) {
      if (['unsupported', 'not-applicable', 'missing'].includes(trials[backend][0]?.result.status)) continue
      trials[backend].push(await measureCase(test, backend))
    }
  }
  function outcome(backend: Backend): CatalogResult {
    const [warmup, ...measured] = trials[backend]
    if (!measured.length) return warmup.result
    const failure = trials[backend].find(({ result }) => result.status !== 'pass')
    return {
      ...(failure ?? measured[0]).result,
      performance: {
        scope: 'full case',
        samplesMs: measured.map(({ wallMs }) => wallMs),
        ...(measured.some(({ result }) => result.metrics) && {
          sampleMetrics: measured.map(({ result }) => result.metrics ?? {})
        })
      }
    }
  }
  return { navcat: outcome('navcat'), detour: outcome('detour') }
}

type ReportRow = typeof manifest[number] & {
  layer: CatalogCase['layer'] | 'missing'
  coverage: string
} & Record<typeof comparisons[number], CatalogResult>
const report: ReportRow[] = []
for (const entry of selectedEntries) {
  const test = implementations.get(entry.id)
  const required = traversalRequirements.get(entry.id)
  const layer: ReportRow['layer'] = test?.layer ?? (required ? 'integration' : 'missing')
  const coverage = test ? test.coverage ?? 'specified' : required ? required.coverage ?? 'adapted' : 'none'
  function outcome(backend: Backend): CatalogResult {
    return required ? traversalOutcome(backend, required) : missing('No test registered for this catalog case.')
  }
  const results = test ? await measurePair(test) : { navcat: outcome('navcat'), detour: outcome('detour') }
  const row = { ...entry, layer, coverage, ...results }
  report.push(row)
  const statuses = comparisons.map((id) => row[id].status)
  if (statuses.some((status) => status !== 'pass')) {
    console.log(entry.id + ' ' + entry.title + ': ' + statuses.join(' / '))
  }
}

await mkdir('.comparison', { recursive: true })
await writeFile('.comparison/' + outputName + '.json', JSON.stringify(report, null, 2) + '\n')
if (!verifyOnly) {
  const performanceReport = renderPerformanceReport(report, measuredTrials, detourWasmHash)
  await writeFile('.comparison/' + (selectedId === undefined ? 'catalog-performance' : outputName) + '.md', performanceReport + '\n')
  if (updateReadme) {
    const readme = await readFile('README.md', 'utf8')
    await writeFile('README.md', replacePerformanceReport(readme, performanceReport))
  }
}
for (const backend of comparisons) {
  const counts = Object.fromEntries(['pass', 'fail', 'unsupported', 'not-applicable', 'missing', 'error'].map((status) => [
    status, report.filter((row) => row[backend].status === status).length
  ]))
  console.log(backend, counts)
}
if (report.some((row) => comparisons.some((backend) => ['fail', 'missing', 'error'].includes(row[backend].status)))) process.exitCode = 1
