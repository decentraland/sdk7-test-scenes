// Focused DomainIR checks: slots, overload/override resolution, constants, deferred targets,
// conditions and values.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as nodePath from 'node:path'
import { compileDomainFile } from '../../../tools/htn/compiler'
import type { CondIR, DomainIR, MethodIR, TaskIR } from '../../../src/htn-planner/htn/ir'
import { float, int, list, str, sym } from '../../../src/htn-planner/htn/atom'
import { FIXTURES, compile, describe as show } from './helpers'

function ir(source: string, files: Record<string, string> = {}): DomainIR {
  const result = compile(source, files)
  assert.ok(result.ok, show(result))
  return result.ir
}

const method = (domain: DomainIR, qualified: string, arity: number): MethodIR => {
  const [dom, name] = qualified.split('::')
  const m = domain.methods.find(x => x.domain === dom && x.name === name && x.arity === arity)
  assert.ok(m, `no method ${qualified}/${arity}`)
  return m
}
const label = (domain: DomainIR, t: TaskIR) =>
  t.k === 'prim' ? t.name : `${t.k === 'defer' ? '&' : ''}${domain.methods[t.method].domain}::${domain.methods[t.method].name}/${t.args.length}`
// Planning-relevant IR only: drop what only the debugger reads (sources, constant names, discard names, the
// split_list_front spelling, qualified call names; IR version 2).
const DEBUG_NAMED = new Set(['discard', 'axiom', 'method', 'split'])
const strip = (c: unknown): unknown =>
  JSON.parse(
    JSON.stringify(c, function (this: { k?: string }, k, v) {
      if (k === 'source' || k === 'c') return undefined
      if (k === 'name' && this.k !== undefined && DEBUG_NAMED.has(this.k)) return undefined
      return v
    })
  )
const begin = (s: { file: string; line: number; col: number } | undefined) => s && { file: s.file, line: s.line, col: s.col }

// DOMAIN_LANGUAGE.md "Constants, includes and overrides".
const BASE_MOVEMENT = `(:domain BaseMovement base
    (:constants MovementSettings base
        (move_speed 1.0)
    )
    (:method (move_to ?inp_position) base
        (ready () ((!walk ?inp_position @move_speed)))
    )
    (:method (move_to ?inp_from ?inp_to) base
        (ready () ((!walk_from_to ?inp_from ?inp_to)))
    )
)`
const SPECIAL_MOVEMENT = `(:include "BaseMovement.domain")
(:domain SpecialMovement top_level_domain
    (:constants MovementSettings overrides BaseMovement
        (move_speed 2.0)
    )
    (:method (move_to ?inp_position) overrides BaseMovement
        (ready () ((!run_to ?inp_position @move_speed)))
    )
    (:method (behave) top_level_method
        (ready ()
            (
                (move_to (1.0 0.0 2.0))
                (BaseMovement::move_to (1.0 0.0 2.0))
                (move_to (0.0 0.0 0.0) (1.0 0.0 2.0))
            )
        )
    )
)`

test('BaseMovement/SpecialMovement: override, qualified base call, inherited overload, effective constant', () => {
  const d = ir(SPECIAL_MOVEMENT, { 'BaseMovement.domain': BASE_MOVEMENT })
  assert.equal(d.name, 'SpecialMovement')
  const behave = method(d, 'SpecialMovement::behave', 0)
  assert.deepEqual(d.topLevel, { behave: { 0: behave.id } })
  assert.deepEqual(
    behave.branches[0].tasks.map(t => label(d, t)),
    ['SpecialMovement::move_to/1', 'BaseMovement::move_to/1', 'BaseMovement::move_to/2']
  )
  assert.deepEqual(strip(behave.branches[0].tasks[0].args), [{ k: 'lit', v: list(float(1), float(0), float(2)) }])
  // Selecting the base body does not restore the base constant: both bodies see 2.0.
  for (const m of [method(d, 'BaseMovement::move_to', 1), method(d, 'SpecialMovement::move_to', 1)])
    assert.deepEqual(strip(m.branches[0].tasks[0].args[1]), { k: 'lit', v: float(2) })
  assert.equal(method(d, 'BaseMovement::move_to', 1).topLevel, false)
  assert.deepEqual(begin(method(d, 'SpecialMovement::move_to', 1).source), { file: 'Root.domain', line: 6, col: 5 })
  assert.deepEqual(begin(method(d, 'BaseMovement::move_to', 1).source), { file: 'BaseMovement.domain', line: 5, col: 5 })
})

test('unqualified calls inside a base domain resolve to the most derived override', () => {
  const files = {
    'Base.domain': '(:domain Base base (:method (act) base (b () ((!base_act)))) (:method (start) (b () ((act) (Base::act)))))',
    'Mid.domain': '(:include "Base.domain")\n(:domain Mid base (:method (act) overrides Base (b () ((!mid) (Base::act)))))'
  }
  const d = ir('(:include "Mid.domain")\n(:domain Root top_level_domain (:method (act) overrides Mid (b () ((!root) (Mid::act)))) (:method (run) top_level_method (b () ((start)))))', files)
  const start = method(d, 'Base::start', 0)
  assert.deepEqual(start.branches[0].tasks.map(t => label(d, t)), ['Root::act/0', 'Base::act/0'])
  assert.deepEqual(method(d, 'Root::act', 0).branches[0].tasks.map(t => label(d, t)), ['!root', 'Mid::act/0'])
  assert.deepEqual(method(d, 'Mid::act', 0).branches[0].tasks.map(t => label(d, t)), ['!mid', 'Base::act/0'])
})

test('constant override chain keeps only effective values (HTNOverrideRegressionTest:167)', () => {
  const files = {
    'Base.domain': '(:domain Base base\n (:constants C base (attack "normal") (speed "slow"))\n)\n',
    'Mid.domain': '(:include "Base.domain")\n(:domain Mid base\n (:constants C2 overrides Base (attack "ninja"))\n)\n'
  }
  const d = ir('(:include "Mid.domain")\n(:domain Root top_level_domain\n (:constants C3 overrides Mid (attack "elite"))\n (:method (run) top_level_method (b () ((!use @attack @speed))))\n)\n', files)
  assert.deepEqual(strip(d.methods[0].branches[0].tasks[0].args), [
    { k: 'lit', v: str('elite') },
    { k: 'lit', v: str('slow') }
  ])
})

test('axiom overrides and qualified axiom calls (HTNOverrideRegressionTest:143)', () => {
  const files = {
    'Base.domain': '(:domain Base base\n (:axiom (ready ?inp_x) base ())\n)\n',
    'Mid.domain': '(:include "Base.domain")\n(:domain Mid base\n (:axiom (ready ?inp_x) overrides Base (and (#Base::ready ?inp_x) (mid_ready ?inp_x)))\n)\n'
  }
  const d = ir('(:include "Mid.domain")\n(:domain Root top_level_domain\n (:axiom (ready ?inp_x) overrides Mid (or (#Mid::ready ?inp_x) (root_fallback ?inp_x)))\n (:method (run) top_level_method (b (and (#ready enemy)) ((!ok))))\n)\n', files)
  assert.deepEqual(d.axioms.map(a => `${a.domain}::${a.name}`), ['Base::ready', 'Mid::ready', 'Root::ready'])
  assert.equal(d.axioms[0].cond, null) // empty body: unconditional
  const run = d.methods[0].branches[0].cond as { items: CondIR[] }
  assert.deepEqual(strip(run.items[0]), { k: 'axiom', axiom: 2, args: [{ k: 'lit', v: sym('enemy') }] })
  assert.deepEqual(strip(d.axioms[2].cond), {
    k: 'or',
    items: [
      { k: 'axiom', axiom: 1, args: [{ k: 'var', slot: 0 }] },
      { k: 'fact', name: 'root_fallback', args: [{ k: 'var', slot: 0 }], once: true } // ?inp_x is bound
    ]
  })
  assert.deepEqual(strip((d.axioms[1].cond as { items: CondIR[] }).items[0]), { k: 'axiom', axiom: 0, args: [{ k: 'var', slot: 0 }] })
})

test('slots: params first, then locals in first-use order per branch; ?any_ is a discard', () => {
  const d = ir(`(:domain Root top_level_domain
    (:method (run ?inp_a ?inp_b) top_level_method
      (first (and (pair ?inp_b ?x ?any_skip) (= ?y (+ ?x 1)) (split_list_back (1 2 3) ?rest ?last))
        ((!out ?y ?rest ?last)))
      (second (and (other ?z)) ((!out ?z ?inp_a)))))`)
  const run = d.methods[0]
  assert.deepEqual(run.params, ['?inp_a', '?inp_b'])
  const [first, second] = run.branches
  assert.deepEqual(first.vars, ['?inp_a', '?inp_b', '?x', '?y', '?rest', '?last'])
  assert.deepEqual(strip(first.cond), {
    k: 'and',
    items: [
      { k: 'fact', name: 'pair', args: [{ k: 'var', slot: 1 }, { k: 'var', slot: 2 }, { k: 'discard' }] },
      { k: 'assign', slot: 3, expr: { k: 'arith', op: '+', args: [{ k: 'var', slot: 2 }, { k: 'lit', v: int(1) }] } },
      // split args stay in source order: back -> (list, rest, element)
      { k: 'split', from: 'back', list: { k: 'lit', v: list(int(1), int(2), int(3)) }, a: { k: 'var', slot: 4 }, b: { k: 'var', slot: 5 } }
    ]
  })
  assert.deepEqual(second.vars, ['?inp_a', '?inp_b', '?z'])
  assert.deepEqual(strip(second.tasks), [{ k: 'prim', name: '!out', args: [{ k: 'var', slot: 2 }, { k: 'var', slot: 0 }] }])
  assert.deepEqual(d.facts, ['pair/3', 'other/1'])
})

test('axiom params: modes and slots; split_list aliases front', () => {
  const d = ir(`(:domain Root top_level_domain
    (:axiom (pick ?inp_list ?out_head ?io_tail) (and (split_list ?inp_list ?out_head ?io_tail) (> (call weight ?out_head) 0)))
    (:method (run) top_level_method (b (and (#pick (1 2) ?h ?t)) ((!r ?h ?t)))))`)
  const pick = d.axioms[0]
  assert.deepEqual(pick.params, [
    { name: '?inp_list', mode: 'inp' },
    { name: '?out_head', mode: 'out' },
    { name: '?io_tail', mode: 'io' }
  ])
  assert.deepEqual(pick.vars, ['?inp_list', '?out_head', '?io_tail'])
  assert.deepEqual(strip(pick.cond), {
    k: 'and',
    items: [
      { k: 'split', from: 'front', list: { k: 'var', slot: 0 }, a: { k: 'var', slot: 1 }, b: { k: 'var', slot: 2 } },
      { k: 'cmp', op: '>', a: { k: 'call', name: 'weight', args: [{ k: 'var', slot: 1 }] }, b: { k: 'lit', v: int(0) } }
    ]
  })
  assert.deepEqual(d.callterms, ['weight'])
})

test('callterms: standalone condition vs value; nested calls, runtime lists and constants', () => {
  const d = ir(`(:domain Root top_level_domain
    (:constants (true 1) (false 0) (tag query))
    (:method (run ?inp_e) top_level_method
      (b (and (call is_visible ?inp_e)
              (= ?pos (call get_pos ?inp_e))
              (= ?req (action ?pos (++ 2) (meta @tag (call get_time))))
              (== @false 0)
              (!= 0 false))
         ((!go ?pos (@tag 1.5) -1 -0.0 "s") (&later ?req))))
    (:method (later ?inp_r) (b () ((!done ?inp_r)))))`)
  const run = d.methods[0]
  assert.deepEqual(run.branches[0].vars, ['?inp_e', '?pos', '?req'])
  assert.deepEqual(strip(run.branches[0].cond), {
    k: 'and',
    items: [
      { k: 'call', name: 'is_visible', args: [{ k: 'var', slot: 0 }] },
      { k: 'assign', slot: 1, expr: { k: 'call', name: 'get_pos', args: [{ k: 'var', slot: 0 }] } },
      {
        k: 'assign',
        slot: 2,
        expr: {
          k: 'list',
          items: [
            { k: 'lit', v: sym('action') },
            { k: 'var', slot: 1 },
            { k: 'arith', op: '++', args: [{ k: 'lit', v: int(2) }] },
            { k: 'list', items: [{ k: 'lit', v: sym('meta') }, { k: 'lit', v: sym('query') }, { k: 'call', name: 'get_time', args: [] }] }
          ]
        }
      },
      { k: 'cmp', op: '==', a: { k: 'lit', v: int(0) }, b: { k: 'lit', v: int(0) } },
      { k: 'cmp', op: '!=', a: { k: 'lit', v: int(0) }, b: { k: 'lit', v: sym('false') } }
    ]
  })
  const [go, later] = run.branches[0].tasks
  // A list made only of literals and constants is folded into one literal.
  assert.deepEqual(go.args, [
    { k: 'var', slot: 1 },
    { k: 'lit', v: list(sym('query'), float(1.5)) },
    { k: 'lit', v: int(-1) },
    { k: 'lit', v: float(-0) },
    { k: 'lit', v: str('s') }
  ])
  assert.ok(Object.is((go.args[3] as { v: { v: number } }).v.v, -0))
  assert.deepEqual(strip(later), { k: 'defer', method: 1, args: [{ k: 'var', slot: 2 }], name: '&later' })
  assert.deepEqual(d.callterms, ['is_visible', 'get_pos', 'get_time'])
  assert.deepEqual(d.facts, [])
})

test('method overloads, recursion and deferred targets (Domains/Test/method_overloads.domain)', () => {
  const result = compileDomainFile(nodePath.join(FIXTURES, 'Domains/Test/method_overloads.domain'))
  assert.ok(result.ok, show(result))
  const d = result.ir
  const id = (q: string, n: number) => method(d, q, n).id
  assert.deepEqual(d.topLevel, {
    run: { 0: id('MethodOverloads::run', 0), 1: id('MethodOverloads::run', 1) },
    deferred: { 0: id('MethodOverloads::deferred', 0), 1: id('MethodOverloads::deferred', 1) },
    mixed: { 1: id('MethodOverloads::mixed', 1) },
    defer_mixed: { 0: id('MethodOverloads::defer_mixed', 0) }
  })
  assert.deepEqual(
    method(d, 'MethodOverloads::run', 0).branches[0].tasks.map(t => label(d, t)),
    [
      'OverloadBase::select/0',
      'MethodOverloads::select/1',
      'MethodOverloads::select/2',
      'OverloadBase::select/0',
      'OverloadBase::select/1',
      'MethodOverloads::walk/2'
    ]
  )
  const walk = method(d, 'MethodOverloads::walk', 2)
  assert.deepEqual(walk.branches.map(b => b.tasks.map(t => label(d, t))), [['MethodOverloads::walk/2'], ['MethodOverloads::walk/1']])
  // Deferred targets are kept even when not top-level (the non-public `mixed/0`).
  assert.deepEqual(method(d, 'MethodOverloads::defer_mixed', 0).branches[0].tasks.map(t => label(d, t)), ['&MethodOverloads::mixed/0'])
  assert.equal(method(d, 'MethodOverloads::mixed', 0).topLevel, false)
})

test('shared implementations: qualified and effective aliases (Domains/Test/shared_implementations.domain)', () => {
  const result = compileDomainFile(nodePath.join(FIXTURES, 'Domains/Test/shared_implementations.domain'))
  assert.ok(result.ok, show(result))
  const d = result.ir
  const run = method(d, 'SharedImplementations::run', 0)
  assert.deepEqual(run.branches[0].tasks.map(t => label(d, t)), [
    'SharedBase::shared/1',
    'SharedBase::shared/1',
    'SharedBase::choose/0',
    'SharedBase::choose/0',
    'SharedImplementations::choose/1',
    'SharedBase::choose/1',
    'SharedImplementations::choose/2',
    '!outputs'
  ])
  const axioms = (run.branches[0].cond as { items: { axiom: number }[] }).items.map(c => `${d.axioms[c.axiom].domain}::${d.axioms[c.axiom].name}`)
  assert.deepEqual(axioms, ['SharedImplementations::choose_value', 'SharedBase::choose_value', 'SharedImplementations::choose_value'])
  // Unreferenced base declarations are kept (no pruning), so the callterm list is complete.
  assert.ok(d.callterms.includes('unused_condition'))
  assert.ok(method(d, 'SharedBase::unused', 0))
  // (:method (client_empty) top_level_method) has no branches.
  assert.deepEqual(method(d, 'SharedImplementations::client_empty', 0).branches, [])
})

test('negative literals keep their types (Domains/Test/negative_literals.domain)', () => {
  const d = ir('(:domain Root top_level_domain (:method (run) top_level_method (b () ((!v -2147483648 -0.5 (- 5 2) (-2 -0.5))))))')
  assert.deepEqual(d.methods[0].branches[0].tasks[0].args, [
    { k: 'lit', v: int(-2147483648) },
    { k: 'lit', v: float(-0.5) },
    { k: 'arith', op: '-', args: [{ k: 'lit', v: int(5) }, { k: 'lit', v: int(2) }] },
    { k: 'lit', v: list(int(-2), float(-0.5)) }
  ])
})

test('symbols true/false stay symbols; "strings" stay strings; floats are single precision', () => {
  const d = ir('(:domain Root top_level_domain (:method (run) top_level_method (b () ((!v true "true" 0.1 (true false))))))')
  assert.deepEqual(strip(d.methods[0].branches[0].tasks[0].args), [
    { k: 'lit', v: sym('true') },
    { k: 'lit', v: str('true') },
    { k: 'lit', v: { t: 'float', v: Math.fround(0.1) } },
    { k: 'lit', v: list(sym('true'), sym('false')) }
  ])
})

test('alt / or / not conditions and empty bodies', () => {
  const d = ir(`(:domain Root top_level_domain (:method (run) top_level_method
    (a (alt (p ?t) (q ?t)) ((!x ?t)))
    (b (or (and (p ?t)) (not (q ?t))) ((!y)))
    (c (and) ())
    (d () ())))`)
  const [a, b, c, e] = d.methods[0].branches
  assert.deepEqual(strip(a.cond), { k: 'alt', items: [{ k: 'fact', name: 'p', args: [{ k: 'var', slot: 0 }] }, { k: 'fact', name: 'q', args: [{ k: 'var', slot: 0 }] }] })
  assert.deepEqual(strip(b.cond), {
    k: 'or',
    items: [{ k: 'and', items: [{ k: 'fact', name: 'p', args: [{ k: 'var', slot: 0 }] }] }, { k: 'not', item: { k: 'fact', name: 'q', args: [{ k: 'var', slot: 0 }] } }]
  })
  assert.deepEqual(strip(c.cond), { k: 'and', items: [] })
  assert.equal(e.cond, null)
  assert.deepEqual(e.tasks, [])
  assert.deepEqual(a.source, { file: 'Root.domain', line: 2, col: 5, endLine: 2, endCol: 38 })
  const fact = (a.cond as { items: CondIR[] }).items[0]
  assert.deepEqual(fact.source, { file: 'Root.domain', line: 2, col: 13, endLine: 2, endCol: 18 })
})

// HTNCCodeGenerator.cpp AnalyzeCondition (:222): a fact is one-solution unless a variable argument is outside the
// statically bound set. Bound on entry: method parameters (:3079), an axiom's ?inp_ parameters
// (HTNConditionContinuation.inl:136); `and` threads the set, `or`/`alt` keep what every child binds, `not` binds nothing.
test('facts with no statically unbound variable are marked once', () => {
  const d = ir(`(:domain Root top_level_domain
    (:method (run ?inp_e) top_level_method
      (a (and (p ?inp_e 1 ?any_x) (q ?v) (r ?v ?inp_e) (= ?w 2) (s ?w) (#ax ?inp_e ?o ?io) (t ?o ?io)) ())
      (b (and (or (p ?x) (q ?x ?y)) (r ?x) (s ?y) (not (u ?z)) (v ?z) (split_list (1 2) ?h ?rest) (w ?h ?rest)) ()))
    (:axiom (ax ?inp_a ?out_b ?io_c) (and (p ?inp_a) (q ?io_c) (= ?out_b 1))))`)
  const once = (c: CondIR | null): string[] => {
    if (c === null) return []
    switch (c.k) {
      case 'and': case 'or': case 'alt': return c.items.flatMap(once)
      case 'not': return once(c.item)
      case 'fact': return [`${c.name}${c.once === true ? '!' : ''}`]
      default: return []
    }
  }
  const [a, b] = d.methods[0].branches
  assert.deepEqual(once(a.cond), ['p!', 'q', 'r!', 's!', 't!'])
  assert.deepEqual(once(b.cond), ['p', 'q', 'r!', 's', 'u', 'v', 'w!'])
  assert.deepEqual(once(d.axioms[0].cond), ['p!', 'q'])
})
