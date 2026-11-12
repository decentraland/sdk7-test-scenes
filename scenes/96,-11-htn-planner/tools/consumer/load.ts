import * as fs from 'node:fs'
import path from 'node:path'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { Rng } from '../../src/htn-planner/npc/rng'
import { compileDomainFile, formatDiagnostic, parseWorldState } from '../htn/compiler'
import { loadWorldInvariants } from '../htn/world-invariants'
import type { ConsumerManifest, ConsumerScenario } from './manifest'

/** Compile once; every world/binding call owns fresh mutable state. */
export function loadConsumer(manifest: ConsumerManifest, baseDir: string) {
  if (!manifest || typeof manifest.domain !== 'string' || !Array.isArray(manifest.scenarios))
    throw new Error('manifest needs domain and scenarios')
  const domainFile = path.resolve(baseDir, manifest.domain)
  const compiled = compileDomainFile(domainFile)
  if (!compiled.ok) throw new Error(compiled.diagnostics.map(formatDiagnostic).join(' | '))
  const scenarios = manifest.scenarios
  const names = new Set<string>()
  for (const item of [...scenarios, ...(manifest.stories ?? [])]) {
    if (!item.name || names.has(item.name)) throw new Error('missing or duplicate case name: ' + item.name)
    names.add(item.name)
  }
  const statuses = ['succeeded', 'no_plan', 'depth_exceeded', 'invalid_call', 'invalid_world']
  for (const s of scenarios) {
    if (!s.method || !s.expect || !statuses.includes(s.expect.status) || !Array.isArray(s.expect.plan) || s.expect.plan.some((p: unknown) => typeof p !== 'string'))
      throw new Error(s.name + ': explicit method and expected status/plan required')
    if (s.expect.status !== 'succeeded' && s.expect.plan.length) throw new Error(s.name + ': failed status must expect an empty plan')
  }
  for (const s of manifest.stories ?? []) if (!Array.isArray(s.expect) || typeof s.play !== 'function') throw new Error(s.name + ': story needs play and expected trace')
  const invariants = manifest.invariants === false ? undefined : loadWorldInvariants(domainFile,
    manifest.invariants === undefined ? undefined : path.resolve(baseDir, manifest.invariants))
  function world(s: ConsumerScenario): WorldState {
    const w = new WorldState()
    if (s.world) parseWorldState(fs.readFileSync(path.resolve(baseDir, s.world), 'utf8'), w)
    invariants?.assert(w, s.name)
    return w
  }
  function bindings(w: WorldState, seed: number) {
    return manifest.callterms?.({ world: w, rng: new Rng(seed), seed }) ?? { callterms: {} }
  }
  return { domain: compiled.ir, scenarios, world, bindings, invariants, warnings: compiled.diagnostics.map(formatDiagnostic) }
}
export type LoadedConsumer = ReturnType<typeof loadConsumer>
