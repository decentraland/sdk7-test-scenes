import { readFile } from 'node:fs/promises'
import manifest from '../tools/catalog/manifest.json'
import type { CatalogResult } from '../tools/catalog/types'

type CatalogueRow = {
  id: string
  title: string
  coverage: 'specified' | 'adapted' | 'none'
  navcat: CatalogResult
  detour: CatalogResult
}

type ExplorerEvent = {
  stage: string
  id?: string
  title?: string
  verdict?: string
}

const [catalogueFile = '.comparison/catalog-comparison.json', explorerFile = '.comparison/sdk-integration-acceptance.json'] =
  process.argv.slice(2)
const catalogue: CatalogueRow[] = JSON.parse(await readFile(catalogueFile, 'utf8'))
const explorer: ExplorerEvent[] = JSON.parse(await readFile(explorerFile, 'utf8'))
const sdkCases = new Set(['SDK-T01', 'SDK-T02', 'SDK-T03', 'SDK-T04'])
const byId = new Map(catalogue.map((row) => [row.id, row]))
if (catalogue.length !== manifest.length || byId.size !== manifest.length ||
    !explorer.some((event) => event.stage === 'done')) {
  throw new Error('The Node catalogue or Explorer log is incomplete.')
}

const uncovered: string[] = []
for (const { id, title } of manifest) {
  const node = byId.get(id)
  if (!node || node.title !== title) {
    uncovered.push(id + ' ' + title + ' — missing catalogue result')
    continue
  }
  const verdicts = [node.navcat?.status, node.detour?.status]
  if (verdicts.some((status) => !status || status === 'missing' || status === 'error') ||
      verdicts.every((status) => status === 'unsupported' || status === 'not-applicable')) {
    uncovered.push(id + ' ' + title + ' — missing test result or runner error')
    continue
  }
  if (sdkCases.has(id)) {
    const results = explorer.filter((event) => event.stage === 'result' && event.id === id && event.title === title)
    if (results.length !== 1 || results[0].verdict !== 'pass') {
      uncovered.push(id + ' ' + title + ' — missing successful live SDK7 check')
    }
  } else if (node.coverage !== 'specified') {
    uncovered.push(id + ' ' + title + ' — partial fixture')
  }
}
for (const item of uncovered) console.log(item)
console.log(manifest.length - uncovered.length + '/' + manifest.length + ' catalogue cases covered.')
if (uncovered.length) process.exitCode = 1
