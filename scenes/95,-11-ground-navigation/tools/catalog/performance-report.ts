import { arch, cpus, platform, release } from 'node:os'
import packageInfo from '../../package.json'
import type { CatalogResult } from './types'

const backends = ['navcat', 'detour'] as const
type PerformanceRow = { id: string; title: string; catalog: string; layer: string; coverage: string } & Record<typeof backends[number], CatalogResult>

export const PERFORMANCE_BEGIN = '<!-- catalog-performance:begin -->'
export const PERFORMANCE_END = '<!-- catalog-performance:end -->'

function format(ms: number) {
  return ms < 0.001 ? '<0.001' : ms.toFixed(ms < 1 ? 3 : 2)
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function median(sorted: readonly number[]) {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function cell(result: CatalogResult) {
  const samples = result.performance?.samplesMs
  if (!samples?.length) return escapeCell(result.status + ': ' + result.detail)
  const sorted = [...samples].sort((a, b) => a - b)
  return format(median(sorted)) + ' (' + format(sorted[0]) + '–' + format(sorted[sorted.length - 1]) + ') · ' + result.status
}

function recipePhases(result: CatalogResult) {
  const samples = result.performance?.sampleMetrics ?? []
  if (!samples.length) return '—'
  function phase(suffix: '.bakeMs' | '.queryMs', direct: 'recipeBakeMs' | 'recipeQueryMs') {
    const totals = samples.flatMap((sample) => {
      if (sample[direct] !== undefined) return [sample[direct]]
      const variants = Object.entries(sample).filter(([key]) => key.endsWith(suffix))
      return variants.length ? [variants.reduce((sum, [, ms]) => sum + ms, 0)] : []
    }).sort((a, b) => a - b)
    return totals.length === samples.length ? format(median(totals)) : '—'
  }
  return phase('.bakeMs', 'recipeBakeMs') + ' / ' + phase('.queryMs', 'recipeQueryMs')
}

export function renderPerformanceReport(rows: readonly PerformanceRow[], measuredTrials: number, detourWasmHash?: string) {
  const measured = rows.filter((row) => backends.some((backend) => row[backend].performance)).length
  const pairCount = rows.reduce((count, row) => count + backends.filter((backend) => row[backend].performance).length, 0)
  const detourModule = detourWasmHash ? `custom WASM (SHA-256 ${detourWasmHash})` : 'bundled WASM'
  return [
    PERFORMANCE_BEGIN,
    `Run on ${new Date().toISOString().slice(0, 10)} UTC with Node ${process.versions.node}, ${platform()} ${release()} ${arch()}, ${cpus()[0]?.model ?? 'CPU unreported'}. navcat ${packageInfo.dependencies.navcat}, recast-navigation-js ${packageInfo.dependencies['recast-navigation']} with ${detourModule}. Measured ${measured}/${rows.length} cases, ${pairCount} case/backend pairs.`,
    '',
    `Each cell shows median wall time in milliseconds (min–max), then the verdict. One warm-up and ${measuredTrials} measured runs per pair. Timing includes case fixture setup, work and verdict checks, and excludes one-time WASM initialization. Traversal rows sum the required variants within each trial. A published Explorer run, an isolated path query, and a complete test harness have different costs.`,
    '',
    '<details>',
    '<summary>Per-case timings and verdicts</summary>',
    '',
    '| Case | Layer / coverage | navcat (Node) | Detour (Node WASM) |',
    '| --- | --- | ---: | ---: |',
    ...rows.map((row) => `| ${row.id} ${escapeCell(row.title)} | ${row.layer} / ${row.coverage} | ${cell(row.navcat)} | ${cell(row.detour)} |`),
    '',
    '</details>',
    '',
    'Recipe phase medians use the same measured trials as the end-to-end table. Each cell is bake and setup / query in milliseconds, summed across fixture variants and controls within each trial. A dash marks a phase without a complete sample series.',
    '',
    '| Recipe | navcat bake / query (ms) | Detour bake / query (ms) |',
    '| --- | ---: | ---: |',
    ...rows.filter((row) => row.catalog === 'recipe').map((row) =>
      `| ${row.id} ${escapeCell(row.title)} | ${recipePhases(row.navcat)} | ${recipePhases(row.detour)} |`),
    PERFORMANCE_END
  ].join('\n')
}

export function replacePerformanceReport(readme: string, report: string) {
  const start = readme.indexOf(PERFORMANCE_BEGIN)
  const end = readme.indexOf(PERFORMANCE_END)
  if (start < 0 || end < start) throw new Error('Missing catalogue performance markers in README.md.')
  return readme.slice(0, start) + report + readme.slice(end + PERFORMANCE_END.length)
}
