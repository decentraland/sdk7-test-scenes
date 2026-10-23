// Reachability at the linked-IR boundary (upstream HTNCompilerReachability.cpp).
// Keep every host entry and every syntactically referenced deferred target, even in dead code.
import type { CondIR, DomainIR } from '../../src/htn-planner/htn/ir'
import { callSites } from '../../src/htn-planner/htn/callterms'

/** Compact a linked domain in place, preserving source order and diagnostic requirements from removed bodies. */
export function pruneUnreachable(domain: DomainIR): DomainIR {
  const methods = new Set<number>()
  const axioms = new Set<number>()
  const pendingMethods: number[] = []
  const pendingConditions: CondIR[] = []
  let resolved = true
  const addMethod = (id: number) => {
    if (!domain.methods[id]) { resolved = false; return }
    if (!methods.has(id)) { methods.add(id); pendingMethods.push(id) }
  }
  const addCondition = (c: CondIR | null) => { if (c !== null) pendingConditions.push(c) }
  for (const byArity of Object.values(domain.topLevel)) for (const id of Object.values(byArity)) addMethod(id)
  for (const m of domain.methods)
    for (const b of m.branches)
      for (const t of b.tasks) if (t.k === 'defer') addMethod(t.method)
  while (pendingMethods.length) {
    const m = domain.methods[pendingMethods.pop()!]
    for (const b of m.branches) {
      addCondition(b.cond)
      for (const t of b.tasks) if (t.k !== 'prim') addMethod(t.method)
    }
  }
  while (pendingConditions.length) {
    const c = pendingConditions.pop()!
    switch (c.k) {
      case 'and': case 'or': case 'alt': pendingConditions.push(...c.items); break
      case 'not': pendingConditions.push(c.item); break
      case 'axiom':
        if (!domain.axioms[c.axiom]) { resolved = false; break }
        if (!axioms.has(c.axiom)) {
          axioms.add(c.axiom)
          addCondition(domain.axioms[c.axiom].cond)
        }
        break
    }
  }
  // The normal compiler diagnoses unresolved calls before reaching here. Retain everything if used independently
  // with an unresolved IR, rather than infer which declaration an unknown target could dispatch to.
  if (!resolved || (methods.size === domain.methods.length && axioms.size === domain.axioms.length)) return domain

  const originalCalls = callSites(domain)
  const retainedMethods = domain.methods.filter(m => methods.has(m.id))
  const retainedAxioms = domain.axioms.filter(a => axioms.has(a.id))
  const methodIds = new Map(retainedMethods.map((m, id) => [m.id, id]))
  const axiomIds = new Map(retainedAxioms.map((a, id) => [a.id, id]))
  // The linker builds a fresh condition tree for each declaration; aliases resolve to one declaration ID.
  const remap = (root: CondIR | null) => {
    const pending = root === null ? [] : [root]
    while (pending.length) {
      const c = pending.pop()!
      if (c.k === 'axiom') c.axiom = axiomIds.get(c.axiom)!
      else if (c.k === 'not') pending.push(c.item)
      else if (c.k === 'and' || c.k === 'or' || c.k === 'alt') pending.push(...c.items)
    }
  }
  retainedMethods.forEach((m, id) => {
    m.id = id
    for (const b of m.branches) {
      remap(b.cond)
      for (const t of b.tasks) if (t.k !== 'prim') t.method = methodIds.get(t.method)!
    }
  })
  retainedAxioms.forEach((a, id) => { a.id = id; remap(a.cond) })
  for (const byArity of Object.values(domain.topLevel))
    for (const arity of Object.keys(byArity)) byArity[Number(arity)] = methodIds.get(byArity[Number(arity)])!
  domain.methods = retainedMethods
  domain.axioms = retainedAxioms

  // Upstream emits callterm_requirements before reachability filtering. Keep only removed callsites here,
  // with their original position; live call nodes stay in the bodies and retain their identity for debugging.
  const live = new Set(callSites({ ...domain, prunedCallSites: undefined }).map(c => c.node))
  const removed = originalCalls.flatMap((call, index) => live.has(call.node) ? [] : [{ index, call }])
  if (removed.length) domain.prunedCallSites = removed
  return domain
}
