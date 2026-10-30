// Structural checks of the hand-written guard DomainIR against its .domain source. These pass
// without the planner/compiler; once the compiler lands, also diff against its output (see guard.htn.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CondIR, ExprIR, TaskIR, TermIR } from '../../src/htn-planner/htn/ir'
import { guardDomain } from '../../src/examples/guard/guard.htn'
import { GUARD_ACTIONS } from '../../src/htn-planner/npc/actions'

const read = (file: string) => readFileSync(join(process.env.HTN_REPO_ROOT ?? '.', file), 'utf8')
// The included guard kit's methods come first, then guard.domain's own.
const source = read('src/examples/guard/guard_kit.domain') + read('src/examples/guard/guard.domain')

test('IR methods and branches mirror guard_kit.domain + guard.domain order and names', () => {
  const methods = [...source.matchAll(/\(:method \((\w+)/g)].map(m => m[1])
  assert.deepEqual(guardDomain.methods.map(m => m.name), methods)
  // Branch headers sit on their own line at 8-space indentation: `        (name`.
  const branches = [...source.matchAll(/^ {8}\((\w+)\s*$/gm)].map(m => m[1])
  assert.deepEqual(guardDomain.methods.flatMap(m => m.branches.map(b => b.name)), branches)
  // Two top-level methods: the belief upkeep the host plans first (GuardAgentOptions.reasoning), then the decision.
  assert.deepEqual(guardDomain.topLevel, { reasoning: { 0: 4 }, behave: { 0: 5 } })
  guardDomain.methods.forEach((m, i) => assert.equal(m.id, i))
})

test('IR slots, method references, facts and primitives are consistent', () => {
  const facts = new Set<string>()
  const prims = new Set<string>()
  for (const m of guardDomain.methods) {
    for (const b of m.branches) {
      assert.equal(new Set(b.vars).size, b.vars.length, `${b.name}: duplicate var`)
      assert.ok(b.vars.every(v => v.startsWith('?') && !v.startsWith('?any_')), `${b.name}: discards must not take slots`)
      const checkExpr = (e: ExprIR | TermIR): void => {
        switch (e.k) {
          case 'var': assert.ok(e.slot >= 0 && e.slot < b.vars.length, `${b.name}: slot ${e.slot}`); break
          case 'list': e.items.forEach(checkExpr); break
          case 'arith': case 'call': e.args.forEach(checkExpr); break
          default: break
        }
      }
      const checkCond = (c: CondIR | null): void => {
        if (c === null) return
        switch (c.k) {
          case 'and': case 'or': case 'alt': c.items.forEach(checkCond); break
          case 'not': checkCond(c.item); break
          case 'fact': facts.add(`${c.name}/${c.args.length}`); c.args.forEach(checkExpr); break
          case 'cmp': checkExpr(c.a); checkExpr(c.b); break
          default: assert.fail(`unexpected cond ${c.k}`)
        }
      }
      checkCond(b.cond)
      b.tasks.forEach((t: TaskIR) => {
        t.args.forEach(checkExpr)
        if (t.k === 'prim') prims.add(t.name)
        else assert.ok(guardDomain.methods[t.method], `${b.name}: method ${t.method}`)
      })
    }
  }
  assert.deepEqual([...facts].sort(), [...guardDomain.facts].sort())
  assert.deepEqual(guardDomain.callterms, [])
  for (const p of prims) assert.ok(GUARD_ACTIONS[p], `no executor for ${p}`)
})
