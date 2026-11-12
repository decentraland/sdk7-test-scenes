// Node-side, opt-in world checks. Reuse condition-only HTN methods; never run host actions or callterms.
import * as fs from 'node:fs'
import { checkFacts, decompose } from '../../src/htn-planner/htn/planner'
import type { WorldState } from '../../src/htn-planner/htn/world-state'
import { compileDomainFile, formatDiagnostic } from './compiler'

export class InvariantConfigError extends Error {}
export class InvalidWorldError extends Error {
  constructor(readonly file: string, readonly checks: string[], readonly context: string) {
    super(`${context}: invalid world (${checks.join(', ')}); checks: ${file}`)
  }
}
export interface WorldInvariants {
  file: string
  /** Call after a complete fixture/sensor/effect update, not between individual fact writes. */
  assert(world: WorldState, context?: string): void
}

/** Auto-discover <stem>.invariants.domain; an explicit file must exist. Compile once, check many worlds. */
export function loadWorldInvariants(domainFile: string, explicit?: string): WorldInvariants | undefined {
  const file = explicit ?? domainFile.replace(/\.domain$/, '.invariants.domain')
  if (explicit === undefined && !fs.existsSync(file)) return undefined
  if (!fs.existsSync(file)) throw new InvariantConfigError(`cannot read invariant file '${file}'`)
  const compiled = compileDomainFile(file)
  if (!compiled.ok) throw new InvariantConfigError(`${file}: ${compiled.diagnostics.map(formatDiagnostic).join(' | ')}`)
  const domain = compiled.ir
  const entries = Object.entries(domain.topLevel).flatMap(([name, arities]) =>
    Object.keys(arities).map(arity => ({ name, arity: Number(arity) })))
  if (!entries.length || entries.some(e => e.arity !== 0))
    throw new InvariantConfigError(`${file}: checks must have at least one top-level method, all with zero arguments`)
  if (domain.callterms.length || domain.methods.some(m => m.branches.some(b => b.tasks.length)))
    throw new InvariantConfigError(`${file}: checks must be pure conditions: no tasks or host callterms; use axioms for shared conditions`)
  return {
    file,
    assert(world, context = 'world') {
      const wrongArity = checkFacts(domain, world).wrongArity
      if (wrongArity.length) throw new InvariantConfigError(`${context}: wrong fact arity (${wrongArity.join(', ')}); ${file}`)
      const failed: string[] = []
      for (const { name } of entries) {
        const diagnostics: string[] = []
        const result = decompose(domain, world, name, [], {
          mode: { factsAndAxioms: true, branches: true },
          calltermErrorPolicy: 'report', onDiagnostic: d => diagnostics.push(d.message)
        })
        if (diagnostics.length || (result.status !== 'succeeded' && result.status !== 'no_plan'))
          throw new InvariantConfigError(`${context}: invariant '${name}' could not be evaluated (${result.status}): ${diagnostics.join(' | ')}; ${file}`)
        if (result.status === 'no_plan') failed.push(name)
      }
      if (failed.length) throw new InvalidWorldError(file, failed, context)
    }
  }
}
