// `npm run htn:lint` (tools/lint): one test per rule with a small hand-written domain (it fires / it does not), the
// layers, suppressions, the config, the JSON contract, the CLI's exit codes, the metrics against the frozen-fixture baseline, the
// primitive lists against the hosts' executors, and the shipped domains against a committed baseline
// (test/tools/htn-lint.baseline.json; a deliberate change: npm run htn:lint -- --update-baseline).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { parseConfig } from '../../tools/lint/config'
import type { LintConfig } from '../../tools/lint/config'
import { BASELINE_FILE, BASELINE_PATHS, baselineOf, loadConfig, runCli } from '../../tools/lint/cli'
import type { CliIO } from '../../tools/lint/cli'
import { collectFiles, isRootDomain, lintFile, lintFiles, LINT_REPORT_VERSION } from '../../tools/lint/lint'
import type { Finding, LintReport } from '../../tools/lint/lint'
import { RULE_CAPS, RULE_IDS, RULES } from '../../tools/lint/rules'
import { GUARD_ACTIONS } from '../../src/htn-planner/npc/actions'
import { stalkerActions } from '../../src/examples/stalker/stalker-actions'

const ROOT: string = process.env.HTN_REPO_ROOT ?? process.cwd()
const MEM = nodePath.resolve(ROOT, '.lint-mem')

/** Lint in-memory files: `files` maps a name under MEM to its text; the first is the root. */
function lintMem(files: Record<string, string>, opts: { config?: object; only?: string[] } = {}) {
  const texts = new Map(Object.entries(files).map(([name, text]) => [nodePath.join(MEM, name), text]))
  const readFile = (p: string) => {
    const text = texts.get(nodePath.resolve(p))
    if (text === undefined) throw new Error(`no ${p}`)
    return text
  }
  let config: LintConfig | null = null
  if (opts.config) {
    const parsed = parseConfig(JSON.stringify(opts.config), MEM, 'mem.json', RULE_IDS, RULE_CAPS)
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
    config = parsed.config
  }
  const root = nodePath.join(MEM, Object.keys(files)[0])
  return lintFile(root, { cwd: MEM, config, only: opts.only ?? null, readFile })
}

/** A one-file domain from method bodies. */
const dom = (body: string, head = '') => ({ 't.domain': `(:domain T top_level_domain\n${head}\n${body}\n)` })
const rules = (list: Finding[], id: string) => list.filter(f => f.rule === id)
const branch = (name: string, cond = '()', tasks = '((!wait 1))') => `(${name} ${cond} ${tasks})`
const method = (sig: string, branches: string[], top = false) => `(:method (${sig})${top ? ' top_level_method' : ''}\n${branches.join('\n')}\n)`

// ------------------------------------------------------------------ layers

test('compile layer: compiler diagnostics become compile/<code> findings with a fix; the other layers do not run', () => {
  const r = lintMem(dom(method('behave', [branch('go', '()', '((missing_task))')], true)))
  assert.equal(r.result.stoppedAt, 'compile')
  assert.deepEqual(r.result.layers, ['compile'])
  assert.equal(r.result.metrics, null)
  const f = rules(r.findings, 'compile/unknown-method')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'error')
  assert.equal(f[0].layer, 'compile')
  assert.match(f[0].fix, /declare the method/)
  assert.equal(f[0].file, 't.domain')
  assert.equal(f[0].line, 4)
})

test('a symbols-layer error stops the structure layer', () => {
  const branches = Array.from({ length: 12 }, (_, i) => branch(`b${i}`, `(and (f${i}))`, '((!bogus))'))
  const r = lintMem(dom(method('behave', branches, true)), { config: { primitives: ['!wait'] } })
  assert.equal(rules(r.findings, 'unknown-primitive').length, 1)
  assert.equal(r.result.stoppedAt, 'symbols')
  assert.deepEqual(r.result.layers, ['compile', 'symbols'])
  assert.equal(rules(r.findings, 'max-branches').length, 0, 'structure did not run')
})

// ------------------------------------------------------------------ symbols

test('unknown-primitive: only with a primitive list; names the closest known one', () => {
  const src = dom(method('behave', [branch('go', '()', '((!mvoe_to here) (!wait 1))')], true))
  assert.equal(rules(lintMem(src).findings, 'unknown-primitive').length, 0, 'no list: not checked')
  const r = lintMem(src, { config: { primitives: ['!move_to', '!wait'] } })
  const f = rules(r.findings, 'unknown-primitive')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'error')
  assert.match(f[0].message, /'!mvoe_to'/)
  assert.match(f[0].fix, /did you mean '!move_to'/)
  assert.deepEqual(f[0].data?.suggestions, ['!move_to'])
  assert.equal(rules(lintMem(src, { config: { primitives: ['!m*', '!wait'] } }).findings, 'unknown-primitive').length, 0, 'globs')
})

test('unreachable-method: a method no top-level method reaches; deferred calls count as reaching', () => {
  const r = lintMem(dom([method('behave', [branch('go', '()', '((helper) (&later))')], true), method('helper', [branch('h')]), method('later', [branch('l')]), method('orphan', [branch('o')])].join('\n')))
  const f = rules(r.findings, 'unreachable-method')
  assert.deepEqual(f.map(x => x.method), ['orphan/0'])
  assert.match(f[0].message, /never called/)
})

test('unused-axiom and unused-constant: declared in the root, used nowhere', () => {
  const head = `(:constants C (used 1) (spare 2))\n(:axiom (ready) (and (flag)))\n(:axiom (idle) (and (calm)))`
  const r = lintMem(dom(method('behave', [branch('go', '(and (#ready))', '((!wait @used))')], true), head))
  assert.deepEqual(rules(r.findings, 'unused-axiom').map(f => f.message), ["axiom '#idle/0' is not used by any condition a top-level method reaches"])
  assert.deepEqual(rules(r.findings, 'unused-constant').map(f => f.message), ["constant '@spare' is never used"])
})

test('fact-arity-mix: one fact read with two argument counts; `running` is variadic by default', () => {
  const r = lintMem(dom(method('behave', [branch('a', '(and (seen ?x ?y))'), branch('b', '(and (seen ?x ?y))'), branch('c', '(and (seen ?x))'), branch('d', '(and (running go_to ?p))'), branch('e', '(and (running stop))')], true)))
  const f = rules(r.findings, 'fact-arity-mix')
  assert.equal(f.length, 1)
  assert.equal(f[0].branch, 'c')
  assert.match(f[0].message, /'seen' is read with 1 argument\(s\) here \(1×\) but with 2 elsewhere \(2×\)/)
})

// ------------------------------------------------------------------ structure

test('max-branches: more than 8 in a top-level method, more than 10 in a sub-method; configurable', () => {
  const n = (k: number, p: string) => Array.from({ length: k }, (_, i) => branch(`${p}${i}`, `(and (f${i}))`))
  const top9 = lintMem(dom(method('behave', n(9, 'b'), true)))
  assert.equal(rules(top9.findings, 'max-branches').length, 1)
  assert.match(rules(top9.findings, 'max-branches')[0].message, /9 branches \(limit 8 for a top-level method\)/)
  assert.equal(rules(lintMem(dom(method('behave', n(8, 'b'), true))).findings, 'max-branches').length, 0)
  const sub = dom([method('behave', [branch('go', '()', '((sub))')], true), method('sub', n(10, 's'))].join('\n'))
  assert.equal(rules(lintMem(sub).findings, 'max-branches').length, 0)
  assert.equal(rules(lintMem(sub, { config: { rules: { 'max-branches': { other: 9 } } } }).findings, 'max-branches').length, 1)
})

test('max-branches is a warning at most: a smell, not a bug; a config that makes it an error is rejected', () => {
  const parse = (o: object) => parseConfig(JSON.stringify(o), MEM, 'c.json', RULE_IDS, RULE_CAPS)
  assert.equal(RULES.find(r => r.id === 'max-branches')?.severity, 'warning')
  assert.equal(RULE_CAPS['max-branches']?.max, 'warning')
  for (const ok of ['warning', 'info', 'off', { severity: 'warning', top: 6 }, { top: 6 }]) assert.ok(parse({ rules: { 'max-branches': ok } }).ok, JSON.stringify(ok))
  const top = parse({ rules: { 'max-branches': 'error' } })
  assert.equal(top.ok, false)
  assert.match(top.ok ? '' : top.error, /^c\.json\.rules\.max-branches: at most 'warning' \(a smell, not a bug/)
  const over = parse({ overrides: [{ files: ['x/**'], rules: { 'max-branches': { severity: 'error' } } }] })
  assert.match(over.ok ? '' : over.error, /^c\.json\.overrides\[0\]\.rules\.max-branches: at most 'warning'/)
  assert.ok(parse({ rules: { 'recursion-no-base': 'error', 'no-fallback': 'error' } }).ok, 'other rules may be errors')
  assert.equal(cli('test/fixtures/reference/stalker_flat.domain').code, 0, 'the frozen flat stalker (21 branches) warns, it does not fail')
})

test('flat-root: a large root whose branches mostly call only primitives', () => {
  const flat = Array.from({ length: 6 }, (_, i) => branch(`b${i}`, `(and (f${i}))`, '((!a) (!b))'))
  assert.equal(rules(lintMem(dom(method('behave', flat, true))).findings, 'flat-root').length, 1)
  const tiers = [...Array.from({ length: 4 }, (_, i) => branch(`t${i}`, `(and (f${i}))`, '((tier))')), branch('x', '(and (g))', '((!a))'), branch('idle')]
  assert.equal(rules(lintMem(dom([method('behave', tiers, true), method('tier', [branch('go')])].join('\n'))).findings, 'flat-root').length, 0, '2 of 6')
  assert.equal(rules(lintMem(dom(method('behave', flat.slice(0, 5), true))).findings, 'flat-root').length, 0, 'small roots are fine')
})

test('bookkeeping-branch: a top-level branch of bookkeeping primitives only; a write inside a behaviour is fine', () => {
  const r = lintMem(dom(method('behave', [branch('drop', '(and (stale ?t))', '((!forget ?t) (!unfocus))'), branch('look', '(and (seen ?t))', '((!move_to ?t) (!forget ?t))'), branch('idle')], true)))
  assert.deepEqual(rules(r.findings, 'bookkeeping-branch').map(f => f.branch), ['drop'])
  const custom = lintMem(dom(method('behave', [branch('note', '(and (x))', '((!jot))'), branch('idle')], true)), { config: { bookkeeping: ['!jot'] } })
  assert.deepEqual(rules(custom.findings, 'bookkeeping-branch').map(f => f.branch), ['note'])
})

test('bookkeeping-branch and flat-root: an upkeep unit (upkeepMethods, default reasoning) is a flat list of upkeep rules by design', () => {
  const upkeep = (name: string) => branch(name, `(and (${name} ?t))`, '((!forget ?t))')
  const rulesList = ['a', 'b', 'c', 'd', 'e', 'f'].map(upkeep)
  const src = dom(method('reasoning', [...rulesList, branch('done')], true) + method('behave', [upkeep('drop'), branch('idle')], true))
  const r = lintMem(src)
  assert.deepEqual(rules(r.findings, 'bookkeeping-branch').map(f => f.branch), ['drop'], 'only the decision method')
  assert.equal(rules(r.findings, 'flat-root').length, 0)
  const renamed = lintMem(src, { config: { rules: { 'bookkeeping-branch': { upkeepMethods: [] }, 'flat-root': { upkeepMethods: [] } } } })
  assert.equal(rules(renamed.findings, 'bookkeeping-branch').length, 7)
  assert.equal(rules(renamed.findings, 'flat-root').length, 1)
})

test('bookkeeping fallback (no declaration): only !forget*, !remember*, !unfocus, !refocus; !set_*, !clear_*, !watch are actions', () => {
  const one = (name: string, prim: string) => branch(name, `(and (${name}))`, `((${prim}))`)
  const src = dom(method('behave', [one('a', '!forget_noise 1'), one('b', '!remember_enemy'), one('c', '!unfocus'), one('d', '!refocus'), one('e', '!set_cautious_stance'), one('f', '!clear_cover'), one('g', '!watch'), one('h', '!watch_post'), branch('idle')], true))
  assert.deepEqual(rules(lintMem(src).findings, 'bookkeeping-branch').map(f => f.branch), ['a', 'b', 'c', 'd'])
})

test('bookkeeping declared in the config: lists merge (top level and every matching override); a host that declares its primitives and its bookkeeping has classified them, so the fallback is not applied to its primitives', () => {
  const src = dom(method('behave', [branch('jot', '(and (x))', '((!jot))'), branch('note', '(and (y))', '((!note))'), branch('route', '(and (z))', '((!forget_route))'), branch('idle')], true))
  const merged = lintMem(src, { config: { bookkeeping: ['!jot'], overrides: [{ files: ['*.domain'], bookkeeping: ['!note'] }] } })
  assert.deepEqual(rules(merged.findings, 'bookkeeping-branch').map(f => f.branch), ['jot', 'note', 'route'], 'declared + fallback for the rest')
  const host = { primitives: ['!jot', '!note', '!forget_route', '!wait'], bookkeeping: ['!jot'] }
  assert.deepEqual(rules(lintMem(src, { config: host }).findings, 'bookkeeping-branch').map(f => f.branch), ['jot'], '!forget_route is a declared action')
  const primitivesOnly = { primitives: ['!jot', '!note', '!forget_route', '!wait'] }
  assert.deepEqual(rules(lintMem(src, { config: primitivesOnly }).findings, 'bookkeeping-branch').map(f => f.branch), ['route'], 'no bookkeeping declared: the fallback still applies')
})

test('SHOP-style !!internal operators are not available: our compiler rejects the name, so they cannot mark bookkeeping', () => {
  const r = lintMem(dom(method('behave', [branch('go', '()', '((!!note 1) (!wait 1))')], true)))
  assert.deepEqual(r.findings.map(f => f.rule), ['compile/expected-identifier'])
})

test('duplicated-tail: maximal groups of >= 3 identical steps ending branches; 2 steps are not reported', () => {
  const r = lintMem(dom(method('behave', [
    branch('a', '(and (p))', '((!x) (!face) (!go) (!look) (!drop))'),
    branch('b', '(and (q))', '((!y) (!face) (!go) (!look) (!drop))'),
    branch('c', '(and (r))', '((!x) (!face) (!go) (!look) (!drop))'),
    branch('d', '(and (s))', '((!z) (!look) (!drop))'),
    branch('idle')
  ], true)))
  const f = rules(r.findings, 'duplicated-tail')
  assert.deepEqual(f.map(x => x.data?.tail), [['!face', '!go', '!look', '!drop'], ['!x', '!face', '!go', '!look', '!drop']])
  assert.deepEqual(f[0].data?.branches, ['behave.a', 'behave.b', 'behave.c'])
  assert.deepEqual(f[0].related?.map(x => x.branch), ['b', 'c'])
  assert.equal(r.result.metrics?.duplicatedTails, 2)
  assert.equal(r.result.metrics?.longestDuplicatedTail, 5)
})

test('unconditional-not-last: an always-true branch before others; suppressible inline with a reason', () => {
  const body = method('behave', [branch('first'), branch('second', '(and (p))'), branch('idle')], true)
  const f = rules(lintMem(dom(body)).findings, 'unconditional-not-last')
  assert.deepEqual(f.map(x => x.branch), ['first'])
  assert.match(f[0].fix, /htn-lint-disable-next-line unconditional-not-last/)
  const suppressed = body.replace('(first', '// htn-lint-disable-next-line unconditional-not-last -- backtracking demo\n// (another comment line)\n\n(first')
  const r = lintMem(dom(suppressed))
  assert.equal(rules(r.findings, 'unconditional-not-last').length, 0)
  assert.equal(r.result.counts.suppressed, 1)
})

test('shadowed-branch: an earlier branch whose condition is part of this one always wins; variable links and callterms are respected', () => {
  const r = lintMem(dom(method('behave', [branch('general', '(and (heard ?p ?t))'), branch('specific', '(and (heard ?q ?u) (loud ?u))'), branch('idle')], true)))
  const f = rules(r.findings, 'shadowed-branch')
  assert.deepEqual(f.map(x => [x.branch, x.data?.shadowedBy]), [['specific', 'general']])
  // `(focus ?t)` ties focus to the heard time: not the same test as any focus (the frozen-fixture baseline's false pair).
  const linked = lintMem(dom(method('behave', [branch('cont', '(and (heard ?p ?t) (focus ?t))'), branch('retarget', '(and (focus ?any_f) (heard ?p ?t) (player ?p))'), branch('idle')], true)))
  assert.equal(rules(linked.findings, 'shadowed-branch').length, 0)
  const negated = lintMem(dom(method('behave', [branch('none', '(and (not (seen ?x)))'), branch('not_this', '(and (target ?y) (not (seen ?y)))'), branch('idle')], true)))
  assert.equal(rules(negated.findings, 'shadowed-branch').length, 0, '"no row at all" does not follow from "no row for ?y"')
  const calls = lintMem(dom(method('behave', [branch('first', '(and (< (call roll) 2))'), branch('second', '(and (< (call roll) 2))'), branch('idle')], true)))
  assert.equal(rules(calls.findings, 'shadowed-branch').length, 0, 'a callterm can answer differently the second time')
})

test('recursion-no-base: a cycle in which every branch recurses; a base branch anywhere in the cycle clears it', () => {
  const bad = lintMem(dom([method('behave', [branch('go', '()', '((ping 3))')], true), method('ping ?inp_n', [branch('p', '()', '((pong ?inp_n))')]), method('pong ?inp_n', [branch('q', '()', '((ping ?inp_n))')])].join('\n')))
  const f = rules(bad.findings, 'recursion-no-base')
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'error')
  assert.deepEqual(f[0].data?.cycle, ['ping', 'pong'])
  const ok = lintMem(dom([method('behave', [branch('go', '()', '((walk 3))')], true), method('walk ?inp_n', [branch('done', '(and (== ?inp_n 0))'), branch('step', '()', '((!step) (walk (-- ?inp_n)))')])].join('\n')))
  assert.equal(rules(ok.findings, 'recursion-no-base').length, 0)
  assert.equal(rules(ok.findings, 'recursion-not-tail').length, 0)
  const deferred = lintMem(dom(method('behave', [branch('go', '()', '((!step) (&behave))')], true)))
  assert.equal(rules(deferred.findings, 'recursion-no-base').length, 0, 'a deferred self-call is a replan, not recursion')
})

test('recursion-not-tail: a recursive call with steps after it', () => {
  const r = lintMem(dom([method('behave', [branch('go', '()', '((walk 3))')], true), method('walk ?inp_n', [branch('done', '(and (== ?inp_n 0))'), branch('step', '()', '((!before) (walk (-- ?inp_n)) (!after))')])].join('\n')))
  const f = rules(r.findings, 'recursion-not-tail')
  assert.equal(f.length, 1)
  assert.deepEqual(f[0].data, { step: 2, steps: 3 })
})

test('order-dependent (info): a later, more general branch that relies on the earlier specific ones; the last branch is exempt', () => {
  const r = lintMem(dom(method('behave', [branch('stale', '(and (noise ?t) (now ?n) (> (- ?n ?t) 10))', '((!forget_noise ?t))'), branch('listen', '(and (noise ?t))', '((!listen))'), branch('fallback_like', '(and (noise ?x))', '((!x))')], true)))
  const f = rules(r.findings, 'order-dependent')
  assert.deepEqual(f.map(x => [x.branch, x.severity, x.data?.dependsOn]), [['listen', 'info', ['stale']]])
})

test('no-fallback (info): a top-level method without an always-true last branch; check methods are exempt', () => {
  const src = dom([method('behave', [branch('go', '(and (p))')], true), method('active_plan', [branch('ok', '(and (running go))', '()')], true)].join('\n'))
  assert.deepEqual(rules(lintMem(src).findings, 'no-fallback').map(f => f.method), ['behave/0', 'active_plan/0'])
  assert.deepEqual(rules(lintMem(src, { config: { checkMethods: ['active_plan'] } }).findings, 'no-fallback').map(f => f.method), ['behave/0'])
  assert.equal(rules(lintMem(dom(method('behave', [branch('go', '(and (p))'), branch('idle')], true))).findings, 'no-fallback').length, 0)
})

test('shared-condition (info): one fact tested in many sibling branches', () => {
  const bs = (k: number) => [...Array.from({ length: k }, (_, i) => branch(`n${i}`, `(and (noise ?p) (k${i}))`)), branch('a', '(and (x))'), branch('b', '(and (y))'), branch('idle')]
  const f = rules(lintMem(dom(method('behave', bs(4), true))).findings, 'shared-condition')
  assert.deepEqual(f.map(x => x.data?.fact), ['noise/1'])
  assert.equal(rules(lintMem(dom(method('behave', bs(3), true))).findings, 'shared-condition').length, 0)
})

test('shared-condition: different stage values are dispatch, repeated tests still count', () => {
  const bs = (values: string[]) => values.map((v, i) => branch(`b${i}`, `(and (stage ?self ${v}) (k${i}))`))
  const dispatch = lintMem(dom(method('behave', [...bs(['prep', 'cook', 'serve', 'clean']), branch('idle')], true)))
  assert.equal(rules(dispatch.findings, 'shared-condition').length, 0)
  const repeated = lintMem(dom(method('behave', [...bs(['prep', 'prep', 'prep', 'prep']), branch('idle')], true)))
  assert.equal(rules(repeated.findings, 'shared-condition').length, 1)
})

test('shared-condition: polarity and variable equality are part of the test', () => {
  const conds = ['(ready ?x)', '(ready ?x)', '(not (ready ?x))', '(not (ready ?x))']
  const r = lintMem(dom(method('behave', [...conds.map((c, i) => branch(`b${i}`, `(and ${c} (k${i}))`)), branch('idle')], true)))
  assert.equal(rules(r.findings, 'shared-condition').length, 0)
  const pairs = ['(pair ?x ?x)', '(pair ?x ?x)', '(pair ?x ?y)', '(pair ?x ?y)']
  const p = lintMem(dom(method('behave', [...pairs.map((c, i) => branch(`b${i}`, `(and ${c} (k${i}))`)), branch('idle')], true)))
  assert.equal(rules(p.findings, 'shared-condition').length, 0)
})

test('missing-contract: opt-in, each local non-top method needs its own nonempty contract', () => {
  const body = method('behave', [branch('go', '()', '((helper))')], true) + '\n' + method('helper', [branch('done')])
  assert.equal(rules(lintMem(dom(body)).findings, 'missing-contract').length, 0)
  const opts = { config: { rules: { 'missing-contract': 'error' } } }
  const absent = rules(lintMem(dom(body), opts).findings, 'missing-contract')
  assert.deepEqual(absent.map(f => f.method), ['helper/0'])
  const good = body.replace('(:method (helper)', '// Contract: ready; completes the wait.\n// Re-entry needs no extra branch.\n\n(:method (helper)')
  assert.equal(rules(lintMem(dom(good), opts).findings, 'missing-contract').length, 0)
  const empty = body.replace('(:method (helper)', '// Contract:\n(:method (helper)')
  assert.equal(rules(lintMem(dom(empty), opts).findings, 'missing-contract').length, 1)
  const extended = good + '\n' + method('other', [branch('done')])
  assert.deepEqual(rules(lintMem(dom(extended), opts).findings, 'missing-contract').map(f => f.method), ['other/0'])
  assert.equal(absent[0].file, 't.domain')
  assert.ok(absent[0].line > 1 && absent[0].col >= 1)
})

test('missing-contract: included source uses its own comments and location', () => {
  const opts = { config: { rules: { 'missing-contract': 'error' } } }
  const included = '(:domain Lib\n' + method('helper', [branch('done')]) + '\n)'
  const files = { 't.domain': '(:include "lib.domain")\n' + dom(method('behave', [branch('go', '()', '((helper))')], true))['t.domain'], 'lib.domain': included }
  const findings = rules(lintMem(files, opts).findings, 'missing-contract')
  assert.deepEqual(findings.map(f => [f.file, f.method]), [['lib.domain', 'helper/0']])
  assert.equal(rules(lintMem({ ...files, 'lib.domain': included.replace('(:method', '// Contract: ready; waits.\n(:method') }, opts).findings, 'missing-contract').length, 0)
})

// ------------------------------------------------------------------ suppressions, config, --rule

test('suppressions: disable / enable ranges, every rule when none is named, unknown ids reported', () => {
  const n = Array.from({ length: 9 }, (_, i) => branch(`b${i}`, `(and (f${i}))`, '((!a) (!b))'))
  const body = `// htn-lint-disable max-branches flat-root -- known shape\n${method('behave', n, true)}\n// htn-lint-enable max-branches flat-root`
  const r = lintMem(dom(body))
  assert.equal(rules(r.findings, 'max-branches').length + rules(r.findings, 'flat-root').length, 0)
  assert.equal(r.result.counts.suppressed, 2)
  const all = lintMem(dom(`// htn-lint-disable\n${method('behave', n, true)}`))
  assert.equal(all.findings.filter(f => f.layer === 'structure').length, 0)
  const bad = lintMem(dom(`// htn-lint-disable-next-line max-brances\n${method('behave', [branch('idle')], true)}`))
  assert.deepEqual(rules(bad.findings, 'bad-suppression').map(f => [f.line, f.message]), [[3, "htn-lint comment names unknown rule 'max-brances'"]])
})

test('config: severities and options per rule, overrides by path glob, errors as results', () => {
  const src = dom(method('behave', [branch('first'), branch('idle')], true))
  assert.equal(rules(lintMem(src, { config: { rules: { 'unconditional-not-last': 'off' } } }).findings, 'unconditional-not-last').length, 0)
  const asError = rules(lintMem(src, { config: { rules: { 'unconditional-not-last': 'error' } } }).findings, 'unconditional-not-last')
  assert.equal(asError[0].severity, 'error')
  const over = { overrides: [{ files: ['*.domain'], rules: { 'unconditional-not-last': 'info' } }] }
  assert.equal(rules(lintMem(src, { config: over }).findings, 'unconditional-not-last')[0].severity, 'info')
  const miss = { overrides: [{ files: ['other/**'], rules: { 'unconditional-not-last': 'info' } }] }
  assert.equal(rules(lintMem(src, { config: miss }).findings, 'unconditional-not-last')[0].severity, 'warning')
  const parse = (text: string) => parseConfig(text, MEM, 'c.json', RULE_IDS)
  assert.deepEqual(parse('{"rules":{"nope":"off"}}'), { ok: false, error: "c.json.rules: unknown rule 'nope'" })
  assert.deepEqual(parse('{"rules":{"no-fallback":"loud"}}'), { ok: false, error: 'c.json.rules.no-fallback: expected off, error, warning or info' })
  assert.equal(parse('{').ok, false)
  assert.deepEqual(parse('{"overrides":[{"rules":{}}]}'), { ok: false, error: 'c.json.overrides[0].files: expected a non-empty list of globs' })
})

test('--rule: only the named rules run; compile errors still show', () => {
  const n = Array.from({ length: 9 }, (_, i) => branch(`b${i}`, `(and (f${i}))`, '((!a) (!b))'))
  const r = lintMem(dom(method('behave', n, true)), { only: ['flat-root'] })
  assert.deepEqual([...new Set(r.findings.map(f => f.rule))], ['flat-root'])
  const broken = lintMem(dom(method('behave', [branch('go', '()', '((missing))')], true)), { only: ['flat-root'] })
  assert.deepEqual(broken.findings.map(f => f.rule), ['compile/unknown-method'])
})

test('a finding in an include shared by two roots is reported once', () => {
  const lib = `(:domain Lib\n${method('shared', [branch('a', '(and (p))', '((!x) (!y) (!z))'), branch('b', '(and (q))', '((!x) (!y) (!z))')])}\n)`
  const root = (name: string) => `(:include "lib.domain")\n(:domain ${name} top_level_domain\n${method('behave', [branch('go', '()', '((shared))')], true)}\n)`
  const dir = fs.mkdtempSync(nodePath.join(ROOT, '.lint-tmp-'))
  try {
    fs.writeFileSync(nodePath.join(dir, 'lib.domain'), lib)
    fs.writeFileSync(nodePath.join(dir, 'a.domain'), root('A'))
    fs.writeFileSync(nodePath.join(dir, 'b.domain'), root('B'))
    const files = collectFiles([dir], dir)
    assert.ok(files.ok)
    assert.deepEqual(files.skipped.map(s => s.file), ['lib.domain'])
    const report = lintFiles(files.roots, { cwd: dir, config: null }, files.skipped)
    assert.equal(report.findings.filter(f => f.rule === 'duplicated-tail').length, 1)
    assert.equal(report.findings.find(f => f.rule === 'duplicated-tail')?.file, 'lib.domain')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------------------------ across domains

/** Lint several in-memory roots in one run (files under MEM; `roots`: which of them are roots, in order). */
function lintMemRun(files: Record<string, string>, roots: string[], config?: object) {
  const texts = new Map(Object.entries(files).map(([name, text]) => [nodePath.join(MEM, name), text]))
  const readFile = (p: string) => {
    const text = texts.get(nodePath.resolve(p))
    if (text === undefined) throw new Error(`no ${p}`)
    return text
  }
  let parsed: LintConfig | null = null
  if (config) {
    const r = parseConfig(JSON.stringify(config), MEM, 'mem.json', RULE_IDS, RULE_CAPS)
    assert.ok(r.ok, r.ok ? '' : r.error)
    parsed = r.config
  }
  return lintFiles(roots.map(r => nodePath.join(MEM, r)), { cwd: MEM, config: parsed, readFile })
}
const rootDomain = (name: string, body: string, include = '') => `${include}(:domain ${name} top_level_domain\n${body}\n)`
const across = (r: LintReport) => r.findings.filter(f => f.rule === 'duplicated-across-domains')

test('duplicated-across-domains: an identical method in two roots (variables renamed, constants changed) is one warning; a different one is not', () => {
  const advance = (v: string, c: string) =>
    method(`advance`, [branch('next', `(and (current ?${v}) (count ?n) (> ?n ${c}))`, `((!set_index (% (++ ?${v}) ?n)))`), branch('none', '()', '()')])
  const behave = method('behave', [branch('go', '()', '((advance))')], true)
  const a = rootDomain('A', `(:constants C (zero 0))\n${behave}\n${advance('index', '@zero')}`)
  const b = rootDomain('B', `${behave}\n${advance('i', '0')}`)
  const r = lintMemRun({ 'a.domain': a, 'b.domain': b }, ['a.domain', 'b.domain'])
  const f = across(r)
  assert.equal(f.length, 1)
  assert.equal(f[0].severity, 'warning')
  assert.deepEqual([f[0].file, f[0].method, f[0].data?.kind], ['a.domain', 'advance/0', 'method'])
  assert.deepEqual(f[0].related?.map(x => [x.file, x.domain, x.method]), [['b.domain', 'B', 'advance/0']])
  assert.match(f[0].message, /method 'advance\/0' is the same in 2 root domains \(A, B\)/)
  assert.match(f[0].fix, /:include/)
  assert.equal(r.files[0].counts.warnings, 1, 'counted on the root it is reported in')
  const changed = rootDomain('B', `${behave}\n${advance('i', '0').replace('(count ?n)', '(route_length ?n)')}`)
  assert.equal(across(lintMemRun({ 'a.domain': a, 'b.domain': changed }, ['a.domain', 'b.domain'])).length, 0, 'another fact: another method')
  const tiny = (n: string) => rootDomain(n, `${method('behave', [branch('go', '()', '((rest))')], true)}\n${method('rest', [branch('r', '()', '((!wait 1))')])}`)
  assert.equal(across(lintMemRun({ 'a.domain': tiny('A'), 'b.domain': tiny('B') }, ['a.domain', 'b.domain'])).length, 0, 'too small to be worth sharing')
})

test('duplicated-across-domains: >= 3 shared closing steps in branches of different roots; 2 steps, one root, or a shared :include are not', () => {
  const a = rootDomain('A', method('behave', [branch('chase', '(and (visible ?t))', '((!chase ?t) (!catch ?t) (!wait @pause))'), branch('idle')], true), '').replace('(:domain A top_level_domain\n', '(:domain A top_level_domain\n(:constants C (pause 1.5))\n')
  const b = rootDomain('B', method('behave', [branch('hunt', '(and (order chase) (visible ?x))', '((!shout) (!chase ?x) (!catch ?x) (!wait 1.5))'), branch('idle')], true))
  const f = across(lintMemRun({ 'a.domain': a, 'b.domain': b }, ['a.domain', 'b.domain']))
  assert.deepEqual(f.map(x => [x.data?.kind, x.data?.tail, x.branch]), [['tail', ['!chase', '!catch', '!wait'], 'chase']])
  assert.deepEqual(f[0].related?.map(x => [x.file, x.branch]), [['b.domain', 'hunt']])
  assert.match(f[0].message, /the same 3 closing steps \(!chase !catch !wait\) end branches in 2 root domains/)
  const two = rootDomain('B', method('behave', [branch('hunt', '(and (visible ?x))', '((!shout) (!catch ?x) (!wait 1.5))'), branch('idle')], true))
  assert.equal(across(lintMemRun({ 'a.domain': a, 'b.domain': two }, ['a.domain', 'b.domain'])).length, 0, '2 steps')
  assert.equal(across(lintMemRun({ 'a.domain': a }, ['a.domain'])).length, 0, 'one root')
  const lib = `(:domain Lib\n${method('pounce ?t', [branch('p', '()', '((!chase ?t) (!catch ?t) (!wait 1.5))')])}\n)`
  const user = (n: string) => rootDomain(n, method('behave', [branch('go', '(and (visible ?t))', '((pounce ?t))'), branch('idle')], true), '(:include "lib.domain")\n')
  assert.equal(across(lintMemRun({ 'lib.domain': lib, 'a.domain': user('A'), 'b.domain': user('B') }, ['a.domain', 'b.domain'])).length, 0, 'the include is one declaration, not two')
})

test('duplicated-across-domains: a root with the rule off takes no part (documented exclusions); a suppression at the reported place works', () => {
  const body = method('behave', [branch('chase', '(and (visible ?t))', '((!chase ?t) (!catch ?t) (!wait 1))'), branch('idle')], true)
  const files = { 'a.domain': rootDomain('A', body), 'copy/b.domain': rootDomain('B', body) }
  assert.equal(across(lintMemRun(files, ['a.domain', 'copy/b.domain'])).length, 1, 'the identical behave; its tail is part of it')
  const off = { overrides: [{ files: ['copy/**'], rules: { 'duplicated-across-domains': 'off' } }] }
  assert.equal(across(lintMemRun(files, ['a.domain', 'copy/b.domain'], off)).length, 0)
  const suppressed = { ...files, 'a.domain': rootDomain('A', `// htn-lint-disable duplicated-across-domains -- kept apart on purpose\n${body}`) }
  const r = lintMemRun(suppressed, ['a.domain', 'copy/b.domain'])
  assert.equal(across(r).length, 0)
  assert.equal(r.summary.suppressed, 1)
})

test('isRootDomain reads top_level_domain past comments', () => {
  assert.equal(isRootDomain('// (:domain X top_level_domain\n(:domain X\n)'), false)
  assert.equal(isRootDomain('(:include "a.domain")\n(:domain   X  top_level_domain\n)'), true)
})

// ------------------------------------------------------------------ CLI and JSON

function cli(...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const io: CliIO = { out: t => out.push(t), err: t => err.push(t), cwd: ROOT, sceneRoot: ROOT }
  const code = runCli(argv, io)
  return { code, stdout: out.join('\n'), stderr: err.join('\n') }
}

// The frozen flat guard (test/fixtures/reference/guard_flat.domain): a known bad shape, so it has findings to show.
test('JSON: a stable, versioned contract', () => {
  const r = cli('test/fixtures/reference/guard_flat.domain', '--json')
  assert.equal(r.code, 0, r.stderr)
  const report = JSON.parse(r.stdout) as LintReport
  assert.equal(report.version, LINT_REPORT_VERSION)
  assert.equal(report.version, 1)
  assert.equal(report.tool, 'htn-lint')
  assert.equal(report.config, 'htn-lint.json')
  assert.deepEqual(Object.keys(report).sort(), ['config', 'files', 'findings', 'rules', 'skipped', 'summary', 'tool', 'version'])
  assert.deepEqual(Object.keys(report.summary).sort(), ['errors', 'files', 'infos', 'ms', 'suppressed', 'warnings'])
  const file = report.files[0]
  assert.deepEqual(Object.keys(file).sort(), ['counts', 'domain', 'file', 'includes', 'layers', 'metrics', 'stoppedAt'])
  assert.equal(file.domain, 'GuardFlat')
  for (const f of report.findings) {
    for (const key of ['rule', 'layer', 'severity', 'file', 'line', 'col', 'endLine', 'endCol', 'message', 'why', 'fix']) assert.ok(key in f, `${f.rule} has ${key}`)
    assert.ok(['error', 'warning', 'info'].includes(f.severity))
    assert.ok(RULE_IDS.has(f.rule) || f.rule.startsWith('compile/') || f.rule === 'bad-suppression')
    assert.equal(f.file, 'test/fixtures/reference/guard_flat.domain')
    assert.ok(Number.isInteger(f.line) && f.line >= 1)
    assert.ok(Number.isInteger(f.col) && f.col >= 1)
    for (const p of f.related ?? []) assert.ok(p.file && p.line >= 1 && p.col >= 1)
    assert.equal('place' in f, false) // Coordinates are flat fields in the v1 JSON contract.
  }
  const bk = report.findings.find(f => f.rule === 'bookkeeping-branch')
  assert.deepEqual([bk?.domain, bk?.method, bk?.branch], ['GuardFlat', 'behave/0', 'forget_stale_memory'])
})

test('CLI exit codes: 0 warnings only, 1 with --strict or errors, 2 usage or config errors', () => {
  assert.equal(cli('test/fixtures/reference/guard_flat.domain').code, 0)
  assert.equal(cli('test/fixtures/reference/guard_flat.domain', '--strict').code, 1)
  assert.equal(cli('test/htn/fixtures/upstream/HTNDiagnosticTests/DiagnosticSemanticErrors.domain').code, 1)
  assert.equal(cli('src/examples/basics/hello.domain', '--strict').code, 0)
  assert.equal(cli('--bogus', 'x.domain').code, 2)
  assert.equal(cli('test/fixtures/reference/guard_flat.domain', '--rule', 'nope').code, 2)
  assert.equal(cli('no/such.domain').code, 2)
  assert.equal(cli().code, 2)
  assert.equal(cli('test/fixtures/reference/guard_flat.domain', '--config', 'no-such.json').code, 2)
  assert.equal(cli('--help').code, 0)
  const listed = cli('--list-rules')
  assert.equal(listed.code, 0)
  for (const r of RULES) assert.match(listed.stdout, new RegExp(`^${r.id}  ${r.layer}  ${r.severity}`, 'm'))
})

test('text: one line per finding with place and rule, then its fix; a metrics line per domain; the summary last', () => {
  const r = cli('test/fixtures/reference/guard_flat.domain')
  const lines = r.stdout.split('\n')
  assert.ok(lines.includes("test/fixtures/reference/guard_flat.domain:80:9: warning bookkeeping-branch GuardFlat::behave/0.forget_stale_memory: top-level branch 'forget_stale_memory' only does bookkeeping (!forget) and competes with behaviours for priority"))
  assert.match(r.stdout, /^ {2}fix: move this upkeep to the host/m)
  assert.match(r.stdout, /^GuardFlat \(test\/fixtures\/reference\/guard_flat\.domain\): methods 3 \(top 1\), branches 12 \(top 8; per method avg 4, max 8\), depth 2/m)
  assert.match(lines[lines.length - 1], /^htn:lint: 1 domain\(s\), 0 error\(s\), 3 warning\(s\), 2 info\(s\), \d+ ms$/)
})

// ------------------------------------------------------------------ the shipped domains

function shipped(): LintReport {
  const io: CliIO = { out: () => {}, err: () => {}, cwd: ROOT, sceneRoot: ROOT }
  const config = loadConfig(undefined, false, io)
  assert.ok(config.ok)
  const files = collectFiles(BASELINE_PATHS, ROOT)
  assert.ok(files.ok)
  return lintFiles(files.roots, { cwd: ROOT, config: config.config }, files.skipped)
}

// The frozen-fixture baseline measured the guard and the stalker before the restructure: the frozen flat fixtures are those domains.
test('metrics match the frozen-fixture baseline (docs/htn-lint.md)', () => {
  const report = shipped()
  const m = (domain: string) => report.files.find(f => f.domain === domain)?.metrics
  assert.deepEqual(
    (({ methods, topMethods, branches, branchesPerMethod, topBranches, depth, oneStepBranches, oneStepTopBranches, primitiveOnlyTopBranches, bookkeepingTopBranches, bookkeepingOccurrences, primitiveOccurrences, duplicatedTails }) =>
      ({ methods, topMethods, branches, branchesPerMethod, topBranches, depth, oneStepBranches, oneStepTopBranches, primitiveOnlyTopBranches, bookkeepingTopBranches, bookkeepingOccurrences, primitiveOccurrences, duplicatedTails }))(m('GuardFlat')!),
    { methods: 3, topMethods: 1, branches: 12, branchesPerMethod: { avg: 4, max: 8 }, topBranches: 8, depth: 2, oneStepBranches: 6, oneStepTopBranches: 3, primitiveOnlyTopBranches: 6, bookkeepingTopBranches: 2, bookkeepingOccurrences: 6, primitiveOccurrences: 21, duplicatedTails: 0 }
  )
  const s = m('StalkerFlat')!
  assert.deepEqual([s.methods, s.branches, s.branchesPerMethod.max, s.topBranches, s.depth, s.oneStepBranches, s.oneStepTopBranches, s.primitiveOnlyTopBranches, s.bookkeepingTopBranches], [3, 28, 21, 21, 2, 12, 10, 18, 5])
  assert.deepEqual([s.bookkeepingOccurrences, s.primitiveOccurrences, s.bookkeepingShare, s.duplicatedTails, s.longestDuplicatedTail], [26, 68, 0.38, 4, 6])
  const a = m('AAACombatNPC')!
  assert.deepEqual([a.methods, a.branches, a.branchesPerMethod.avg, a.branchesPerMethod.max, a.topBranches, a.depth, a.oneStepBranches, a.primitiveOnlyTopBranches, a.duplicatedTails, a.primitiveOccurrences, a.includes], [8, 54, 6.75, 9, 8, 3, 6, 1, 1, 117, 5])
  // 05: one memory primitive (!remember_enemy); !set_cautious_stance, !clear_cover, !clear_weapon_jam are actions.
  assert.deepEqual([a.bookkeepingOccurrences, a.bookkeepingTopBranches], [1, 0])
  assert.equal(m('GuardFlat')!.bookkeepingShare, 0.29)
  // The frozen-fixture baseline counted the stalker's 14 specific-first pairs (11 in behave, 3 in after_waypoint); order-dependent
  // groups them per general branch.
  const pairs = report.findings.filter(f => f.rule === 'order-dependent' && f.domain === 'StalkerFlat').reduce((n, f) => n + (f.data?.dependsOn as string[]).length, 0)
  assert.equal(pairs, 14)
})

test('our NPC domains before the restructure (the frozen flat fixtures) are the known bad examples: the structure warnings fire on them, unsuppressed', () => {
  const report = shipped()
  const count = (file: string, rule: string) => report.findings.filter(f => f.file === file && f.rule === rule).length
  const stalker = 'test/fixtures/reference/stalker_flat.domain'
  const guard = 'test/fixtures/reference/guard_flat.domain'
  assert.deepEqual([count(stalker, 'max-branches'), count(stalker, 'flat-root'), count(stalker, 'bookkeeping-branch'), count(stalker, 'duplicated-tail')], [1, 1, 5, 4])
  assert.deepEqual([count(guard, 'flat-root'), count(guard, 'bookkeeping-branch')], [1, 2])
  assert.equal(report.files.find(f => f.file === stalker)?.counts.suppressed, 0)
  assert.equal(report.files.find(f => f.file === guard)?.counts.suppressed, 0)
})

test('the live stalker and guard (src/examples) have none of those structure warnings', () => {
  const report = shipped()
  const shape = new Set(['max-branches', 'flat-root', 'bookkeeping-branch', 'duplicated-tail'])
  for (const file of ['src/examples/stalker/stalker.domain', 'src/examples/guard/guard.domain']) {
    assert.deepEqual(report.findings.filter(f => f.file === file && shape.has(f.rule)).map(f => `${f.rule} ${f.branch ?? f.method}`), [], file)
  }
})

test('yard_guard and guard share the guard kit (guard_kit.domain) instead of copying it: no duplicated-across-domains', () => {
  // The frozen fixtures show yard_guard copying guard's advance_patrol whole and the chase, search and patrol steps; they live
  // once in the kit now, which both include.
  const report = shipped()
  const guardFiles = ['src/examples/squad/yard_guard.domain', 'src/examples/guard/guard.domain', 'src/examples/guard/guard_kit.domain']
  const f = report.findings.filter(x => x.rule === 'duplicated-across-domains' && [x.file, ...(x.related ?? []).map(r => r.file)].some(file => guardFiles.includes(file)))
  assert.deepEqual(f.map(x => x.message), [])
  for (const root of guardFiles.slice(0, 2)) assert.deepEqual(report.files.find(x => x.file === root)?.includes, ['src/examples/guard/guard_kit.domain'], root)
  const y = report.files.find(x => x.domain === 'YardGuard')?.metrics
  assert.ok(y)
  assert.deepEqual([y.methods, y.branches, y.topBranches, y.depth, y.duplicatedTails], [6, 12, 5, 3, 0])
})

test('the frozen flat fixtures repeat the live domains on purpose: with their exclusion lifted, duplicated-across-domains finds it', () => {
  const io: CliIO = { out: () => {}, err: () => {}, cwd: ROOT, sceneRoot: ROOT }
  const loaded = loadConfig(undefined, false, io)
  assert.ok(loaded.ok && loaded.config)
  const raw = JSON.parse(fs.readFileSync(nodePath.join(ROOT, 'htn-lint.json'), 'utf8')) as { overrides: { files: string[] }[] }
  const excluded = raw.overrides.find(o => o.files.includes('test/fixtures/reference/**'))
  assert.ok(excluded, 'htn-lint.json takes the frozen fixtures out of duplicated-across-domains')
  excluded.files = excluded.files.filter(f => f !== 'test/fixtures/reference/**')
  const parsed = parseConfig(JSON.stringify(raw), ROOT, 'htn-lint.json', RULE_IDS, RULE_CAPS)
  assert.ok(parsed.ok)
  const files = collectFiles(['src/examples/guard', 'src/examples/squad', 'test/fixtures/reference'], ROOT)
  assert.ok(files.ok)
  const report = lintFiles(files.roots, { cwd: ROOT, config: parsed.config, only: ['duplicated-across-domains'] }, files.skipped)
  const advance = report.findings.find(x => x.data?.kind === 'method' && x.method === 'advance_patrol/0')
  assert.deepEqual(advance?.data?.domains, ['Guard', 'YardGuard', 'GuardFlat'])
  assert.ok(report.findings.every(x => (x.data?.domains as string[]).includes('GuardFlat')), 'only the fixture against the live domains')
})

test('the primitive lists in htn-lint.json are the hosts\' executor registries', () => {
  const io: CliIO = { out: () => {}, err: () => {}, cwd: ROOT, sceneRoot: ROOT }
  const config = loadConfig(undefined, false, io)
  assert.ok(config.ok && config.config)
  const listFor = (file: string) => config.config!.overrides!.find(o => o.files.includes(file))?.primitives?.slice().sort()
  assert.deepEqual(listFor('src/examples/guard/guard.domain'), Object.keys(GUARD_ACTIONS).sort())
  const stalker = stalkerActions({} as never, {} as never)
  assert.deepEqual(listFor('src/examples/stalker/stalker.domain'), Object.keys(stalker).sort())
  assert.deepEqual(listFor('src/examples/squad/yard_guard.domain'), Object.keys(GUARD_ACTIONS).sort(), 'yard_guard runs on the guard kit')
})

test("htn-lint.json declares the bookkeeping primitives of guard, yard_guard and stalker, each one of the host's primitives", () => {
  const io: CliIO = { out: () => {}, err: () => {}, cwd: ROOT, sceneRoot: ROOT }
  const config = loadConfig(undefined, false, io)
  assert.ok(config.ok && config.config)
  const entry = (file: string) => config.config!.overrides!.find(o => o.files.includes(file) && o.bookkeeping)
  const guardKit = ['!forget', '!forget_noise', '!set_waypoint']
  assert.deepEqual(entry('src/examples/guard/guard.domain')?.bookkeeping, guardKit)
  assert.deepEqual(entry('src/examples/squad/yard_guard.domain')?.bookkeeping, guardKit)
  assert.deepEqual(entry('src/examples/stalker/stalker.domain')?.bookkeeping, [...guardKit, '!watch', '!unfocus', '!refocus'])
  for (const file of ['src/examples/guard/guard.domain', 'src/examples/squad/yard_guard.domain', 'src/examples/stalker/stalker.domain']) {
    const prims: Set<string> = new Set(config.config!.overrides!.find(o => o.files.includes(file) && o.primitives)?.primitives ?? [])
    for (const b of entry(file)?.bookkeeping ?? []) assert.ok(prims.has(b), `${file}: ${b} is one of its primitives`)
  }
})

test('baseline: finding counts and metrics of the shipped domains match test/tools/htn-lint.baseline.json', () => {
  const start = performance.now()
  const report = shipped()
  const ms = performance.now() - start
  const path = nodePath.join(ROOT, BASELINE_FILE)
  assert.ok(fs.existsSync(path), `${BASELINE_FILE} is missing: npm run htn:lint -- --update-baseline`)
  const expected = JSON.parse(fs.readFileSync(path, 'utf8'))
  assert.deepEqual(baselineOf(report), expected, `htn:lint findings changed; if on purpose: npm run htn:lint -- --update-baseline, and commit ${BASELINE_FILE}`)
  assert.ok(ms < 3000, `linting every shipped domain took ${Math.round(ms)} ms`)
})
