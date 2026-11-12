// Helpers for the canonical examples' tests (test/examples/canon/*.test.ts): the catalogue (tools/htn/canon.ts), a
// station, a scenario's world and plan, a story's run, the executor list htn-lint.json gives a domain.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { decompose, formatTask, WorldState } from '../../../src/htn-planner'
import type { DomainIR } from '../../../src/htn-planner'
import { loadCanon, playStory, storyId } from '../../../tools/htn/canon'
import type { CanonScenario, CanonStation } from '../../../tools/htn/canon'
import { globRegex } from '../../../tools/lint/config'

export const ROOT: string = process.env.HTN_REPO_ROOT ?? process.cwd()
export const ALL = { factsAndAxioms: true, branches: true }
export const NO_BRANCHES = { factsAndAxioms: true, branches: false }
export const NONE = { factsAndAxioms: false, branches: false }

/** The catalogue, read once per test file. */
export const CANON = loadCanon(ROOT)

export function station(id: string): CanonStation {
  const s = CANON.stations.find(x => x.id === id)
  assert.ok(s, `no station '${id}'`)
  return s
}

/** A fresh world of a scenario. */
export function worldOf(stationId: string, scenario: string): WorldState {
  const s = station(stationId).scenarios.find(x => x.name === scenario)
  assert.ok(s, `no scenario '${stationId}/${scenario}'`)
  const w = new WorldState()
  s.setup(w)
  return w
}

/** A scenario's plan under `mode` (default ALL), formatted, with its status and the runtime diagnostics. */
export function planOf(domain: DomainIR, s: Pick<CanonScenario, 'setup' | 'method' | 'args'>, mode = ALL): { status: string; plan: string[]; diagnostics: string[] } {
  const w = new WorldState()
  s.setup(w)
  CANON.stations.find(station => station.domain === domain)?.invariants?.assert(w, s.method)
  const diagnostics: string[] = []
  const r = decompose(domain, w, s.method, s.args ?? [], { mode, calltermErrorPolicy: 'report', onDiagnostic: d => diagnostics.push(d.message) })
  return { status: r.status, plan: r.plan.map(p => formatTask(p.name, p.args)), diagnostics }
}

/** A story's run by its id (`<station>/<name>` slug). */
export function storyRun(id: string) {
  const story = CANON.stations.flatMap(s => s.stories).find(s => storyId(s) === id)
  assert.ok(story, `no story '${id}'`)
  return playStory(CANON, story)
}

/** Primitive names a domain's branches use. */
export function primitivesOf(domain: DomainIR): string[] {
  const out = new Set<string>()
  for (const m of domain.methods) for (const b of m.branches) for (const t of b.tasks) if (t.k === 'prim') out.add(t.name)
  return [...out].sort()
}

/** The executor list htn-lint.json gives a file (the last matching override with `primitives`), or undefined. */
export function lintPrimitives(file: string): string[] | undefined {
  const config = JSON.parse(fs.readFileSync(nodePath.join(ROOT, 'htn-lint.json'), 'utf8')) as { overrides: { files: string[]; primitives?: string[] }[] }
  let found: string[] | undefined
  for (const o of config.overrides) if (o.primitives && o.files.some(g => globRegex(g).test(file))) found = o.primitives
  return found
}
