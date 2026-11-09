// Upstream conformance suite: replays expectations transcribed from urosidoki/htn_planner HTNTest
// (and explicit doc/SDK examples) against the TS compiler + planner. One subtest per case.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { formatAtom, formatTask } from '../../../src/htn-planner/htn/atom'
import type { Atom } from '../../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../../src/htn-planner/htn/ir'
import { PlanRunner, decompose, decomposeDeferred } from '../../../src/htn-planner/htn/planner'
import type {
  DecompositionResult, PlanStep, PlannerOptions, RuntimeDiagnostic
} from '../../../src/htn-planner/htn/planner'
import { WorldState } from '../../../src/htn-planner/htn/world-state'
import { compileDomainFile, compileDomainSource, parseWorldState } from '../../../tools/htn/compiler'
import type { CompileResult } from '../../../tools/htn/compiler'
import { parseAtom, parseAtoms } from '../../../src/examples/upstream/atom-literal'
import { CALLTERM_SETS } from '../../../src/examples/upstream/conformance-callterms'
import type { HostContext } from '../../../src/examples/upstream/conformance-callterms'
import { FIXTURES_DIR, isCompileExpect, loadCases } from './cases'
import type {
  CompileExpect, ConformanceCase, FactLiteral, ModeSpec, Op, PlanExpect, SourceExpect, StepExpect
} from './cases'

const compiled = new Map<string, CompileResult>()

function compileCase(c: ConformanceCase): CompileResult {
  if (!c.sources) {
    const path = join(FIXTURES_DIR, c.domain)
    let result = compiled.get(path)
    if (!result) compiled.set(path, (result = compileDomainFile(path)))
    return result
  }
  const sources = c.sources
  const root = join(FIXTURES_DIR, 'virtual', slug(c.name))
  const readFile = (path: string): string => {
    const key = relative(root, resolve(path)).split(sep).join('/')
    if (key in sources) return sources[key]
    throw Object.assign(new Error(`ENOENT: no such file '${path}'`), { code: 'ENOENT' })
  }
  return compileDomainSource(join(root, c.domain), sources[c.domain], { readFile })
}

const slug = (name: string) => name.replace(/[^A-Za-z0-9_-]+/g, '_')

function sourceText(c: ConformanceCase, file?: string): string {
  if (file) return readFileSync(join(FIXTURES_DIR, file), 'utf8')
  if (c.sources) return c.sources[c.domain]
  return readFileSync(join(FIXTURES_DIR, c.domain), 'utf8')
}

/** Upstream HTNSourceText::GetPosition: 1-based line and column of a byte offset. */
function positionAt(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset)
  const lineStart = before.lastIndexOf('\n') + 1
  return { line: before.split('\n').length, col: offset - lineStart + 1 }
}

function findPosition(text: string, find: string, after?: string, nth = 1): { line: number; col: number } {
  let from = 0
  if (after !== undefined) {
    from = text.indexOf(after)
    assert.ok(from >= 0, `source text does not contain ${JSON.stringify(after)}`)
  }
  let at = -1
  for (let i = 0; i < nth; i++) {
    at = text.indexOf(find, at < 0 ? from : at + 1)
    assert.ok(at >= 0, `source text does not contain occurrence ${i + 1} of ${JSON.stringify(find)}`)
  }
  return positionAt(text, at)
}

const formatStep = (s: PlanStep) => formatTask(s.name, s.args)
const formatPlan = (steps: readonly PlanStep[]) => steps.map(formatStep)

function addFact(world: WorldState, f: FactLiteral) {
  world.add(f[0], ...parseAtoms(f.slice(1)))
}

function loadWorldstate(world: WorldState, path: string) {
  parseWorldState(readFileSync(join(FIXTURES_DIR, path), 'utf8'), world)
}

class CaseRun {
  readonly world = new WorldState()
  readonly host: HostContext
  readonly diagnostics: RuntimeDiagnostic[] = []
  readonly saved = new Map<string, PlanStep[]>()
  lastPlan: PlanStep[] = []
  private runner?: PlanRunner

  constructor(readonly c: ConformanceCase, readonly ir: DomainIR) {
    const ws = c.worldstate === undefined ? [] : Array.isArray(c.worldstate) ? c.worldstate : [c.worldstate]
    for (const w of ws) loadWorldstate(this.world, w)
    for (const f of c.facts ?? []) addFact(this.world, f)
    const vars: Record<string, Atom | undefined> = {}
    for (const [k, v] of Object.entries(c.vars ?? {})) vars[k] = v === null ? undefined : parseAtom(v)
    this.host = { world: this.world, vars, trace: [], counters: {}, errors: [] }
  }

  options(mode?: ModeSpec): PlannerOptions {
    return {
      callterms: CALLTERM_SETS[this.c.callterms ?? 'empty'],
      // Upstream tests that check reports set Report with a recording callback; the others' outcome is the same.
      calltermErrorPolicy: this.c.calltermErrorPolicy ?? 'report',
      mode: mode ?? this.c.mode,
      context: this.host,
      maxDepth: this.c.maxDepth,
      onDiagnostic: d => this.diagnostics.push(d)
    }
  }

  get planRunner(): PlanRunner {
    return (this.runner ??= new PlanRunner(this.ir, this.world, this.options()))
  }

  findMethod(name: string, arity: number): number {
    const [domain, short] = name.includes('::') ? name.split('::') : [undefined, name]
    const matches = this.ir.methods.filter(
      m => m.name === short && m.arity === arity && (domain === undefined || m.domain === domain))
    assert.equal(matches.length, 1, `cannot resolve method ${name}/${arity} unambiguously (${matches.length} matches)`)
    return matches[0].id
  }

  checkHost(where: string, e: { calls?: Record<string, number>; trace?: string[]; diagnostics?: Record<string, number>; diagnosticAt?: SourceExpect[] }) {
    for (const [k, n] of Object.entries(e.calls ?? {}))
      assert.equal(this.host.counters[k] ?? 0, n, `${where}: host counter ${k}`)
    if (e.trace) assert.deepEqual(this.host.trace, e.trace, `${where}: host trace`)
    for (const [code, n] of Object.entries(e.diagnostics ?? {}))
      assert.equal(this.diagnostics.filter(d => d.code === code).length, n,
        `${where}: diagnostics ${code} (got ${JSON.stringify(this.diagnostics.map(d => d.code))})`)
    for (const d of e.diagnosticAt ?? []) {
      const last = [...this.diagnostics].reverse().find(x => x.code === d.code)
      assert.ok(last, `${where}: no ${d.code} diagnostic`)
      assert.ok(last.source, `${where}: ${d.code} diagnostic has no source`)
      const want = d.find !== undefined ? findPosition(sourceText(this.c, d.file), d.find, d.after, d.nth) : { line: d.line, col: d.col }
      assert.deepEqual({ line: last.source.line, col: last.source.col }, want, `${where}: ${d.code} diagnostic source`)
      if (d.reason !== undefined) assert.equal(last.calltermError?.reason, d.reason, `${where}: ${d.code} reason`)
    }
    assert.deepEqual(this.host.errors, [], `${where}: callterm argument checks`)
  }

  checkPlan(where: string, result: DecompositionResult, e: PlanExpect, entry?: { method: string; args: Atom[] }) {
    const plan = formatPlan(result.plan)
    assert.equal(result.status, e.status, `${where}: status (plan ${JSON.stringify(plan)})`)
    if (e.plan) assert.deepEqual(plan, e.plan, `${where}: plan`)
    if (e.planLength !== undefined) assert.equal(plan.length, e.planLength, `${where}: plan length`)
    if (e.nonEmpty) assert.ok(plan.length > 0, `${where}: plan is empty`)
    for (const s of e.steps ?? []) {
      const i = s.at < 0 ? result.plan.length + s.at : s.at
      assert.ok(i >= 0 && i < result.plan.length, `${where}: no step ${s.at} in ${JSON.stringify(plan)}`)
      checkStep(`${where}: step ${s.at}`, result.plan[i], s)
    }
    for (const t of e.includesSteps ?? []) assert.ok(plan.includes(t), `${where}: plan lacks ${t}`)
    for (const t of e.excludesSteps ?? []) assert.ok(!plan.includes(t), `${where}: plan contains ${t}`)
    if (e.samePlanAs) {
      const saved = this.saved.get(e.samePlanAs)
      assert.ok(saved, `${where}: no saved plan ${e.samePlanAs}`)
      assert.deepEqual(plan, [...formatPlan(saved), ...(e.samePlanPlus ?? [])], `${where}: same plan as ${e.samePlanAs}`)
    }
    this.checkHost(where, e)
    if (e.executed) {
      assert.ok(entry, `${where}: executed needs a top-level method`)
      const runner = new PlanRunner(this.ir, this.world, this.options())
      assert.equal(runner.plan(entry.method, entry.args), e.status, `${where}: PlanRunner.plan status`)
      const seen: string[] = []
      let r = runner.resolve()
      for (let guard = 0; r === 'ready' && guard < 100000; guard++) {
        const cur = runner.current()
        assert.ok(cur, `${where}: resolve() was ready but current() is null`)
        seen.push(formatStep(cur))
        runner.complete()
        r = runner.resolve()
      }
      assert.equal(r, e.executedResult ?? 'completed', `${where}: final resolution`)
      assert.deepEqual(seen, e.executed, `${where}: executed primitives`)
    }
  }

  run(op: Op, where: string) {
    switch (op.op) {
      case 'decompose': {
        const args = parseAtoms(op.args ?? [])
        const result = decompose(this.ir, this.world, op.method, args, this.options(op.mode))
        this.lastPlan = result.plan
        this.checkPlan(where, result, op.expect, { method: op.method, args })
        if (op.save) this.saved.set(op.save, result.plan)
        return
      }
      case 'plan': {
        const runner = this.planRunner
        const status = runner.plan(op.method, parseAtoms(op.args ?? []))
        this.lastPlan = [...runner.steps]
        this.checkPlan(where, { status, plan: this.lastPlan }, op.expect)
        if (op.expect.remaining) assert.deepEqual(formatPlan(runner.steps), op.expect.remaining, `${where}: remaining`)
        return
      }
      case 'resolve': {
        const runner = this.planRunner
        assert.equal(runner.resolve(), op.expect, `${where}: resolution`)
        const cur = runner.current()
        if (op.current !== undefined) assert.equal(cur && formatStep(cur), op.current, `${where}: current`)
        if (op.currentStep) {
          assert.ok(cur, `${where}: no current primitive`)
          checkStep(`${where}: current`, cur, { at: 0, ...op.currentStep })
        }
        if (op.remaining) assert.deepEqual(formatPlan(runner.steps), op.remaining, `${where}: remaining`)
        this.checkHost(where, op)
        return
      }
      case 'complete':
        return this.planRunner.complete()
      case 'clear':
        return this.planRunner.clear()
      case 'expandDeferred': {
        const source = op.of !== undefined ? this.saved.get(op.of) : this.lastPlan
        assert.ok(source, `${where}: no saved plan ${op.of}`)
        const step = source[op.from]
        assert.ok(step && step.kind === 'deferred', `${where}: step ${op.from} is not deferred`)
        const result = decomposeDeferred(this.ir, this.world, step, this.options())
        this.checkPlan(where, result, op.expect)
        this.lastPlan = result.plan
        if (op.save) this.saved.set(op.save, result.plan)
        return
      }
      case 'decomposeDeferred': {
        const args = parseAtoms(op.args ?? [])
        const method = this.findMethod(op.method, args.length)
        const step: Extract<PlanStep, { kind: 'deferred' }> = { kind: 'deferred', method, name: op.method, args }
        const result = decomposeDeferred(this.ir, this.world, step, this.options())
        this.checkPlan(where, result, op.expect)
        this.lastPlan = result.plan
        return
      }
      case 'addFact':
        return addFact(this.world, op.fact)
      case 'addFacts':
        return op.facts.forEach(f => addFact(this.world, f))
      case 'removeFact': {
        let i = 0
        this.world.removeWhere(op.name, op.arity, () => i++ === op.index)
        return
      }
      case 'clearFacts':
        return this.world.clear(op.name, op.arity)
      case 'clearWorld':
        return this.world.clearAll()
      case 'loadWorldstate':
        this.world.clearAll()
        return loadWorldstate(this.world, op.path)
      case 'setVar':
        this.host.vars[op.name] = op.value === null ? undefined : parseAtom(op.value)
        return
      case 'resetCounters':
        this.host.counters = {}
        this.host.trace.length = 0
        this.diagnostics.length = 0
        return
      case 'expectCounters':
        return this.checkHost(where, op)
    }
  }
}

function checkStep(where: string, step: PlanStep, s: StepExpect) {
  const text = formatStep(step)
  const head = step.name
  if (s.text !== undefined) assert.equal(text, s.text, `${where}: text`)
  if (s.head !== undefined) assert.equal(head, s.head, `${where}: head`)
  if (s.contains !== undefined) assert.ok(text.includes(s.contains), `${where}: ${JSON.stringify(text)} lacks ${JSON.stringify(s.contains)}`)
  if (s.argCount !== undefined) assert.equal(step.args.length, s.argCount, `${where}: argument count`)
  const arg = (path: string): Atom => {
    const [first, ...rest] = path.split('.').map(Number)
    let a: Atom | undefined = step.args[first]
    for (const i of rest) a = a?.t === 'list' ? a.v[i] : undefined
    assert.ok(a, `${where}: no argument ${path} in ${JSON.stringify(text)}`)
    return a
  }
  for (const [i, v] of Object.entries(s.args ?? {})) assert.equal(formatAtom(arg(i)), v, `${where}: argument ${i}`)
  for (const [i, t] of Object.entries(s.types ?? {})) assert.equal(arg(i).t, t, `${where}: argument ${i} type`)
  for (const [i, n] of Object.entries(s.sizes ?? {})) {
    const a = arg(i)
    assert.ok(a.t === 'list', `${where}: argument ${i} is not a list`)
    assert.equal(a.v.length, n, `${where}: argument ${i} size`)
  }
  for (const [i, n] of Object.entries(s.nums ?? {})) {
    const a = arg(i)
    assert.ok(a.t === 'int' || a.t === 'float', `${where}: argument ${i} is not numeric (${a.t})`)
    const want = a.t === 'float' ? Math.fround(n) : n
    assert.ok(Object.is(a.v, want) || (a.v === want && want !== 0), `${where}: argument ${i} = ${a.v}, expected ${n}`)
  }
}

function runCompileCase(c: ConformanceCase, e: CompileExpect, result: CompileResult) {
  const errors = result.diagnostics.filter(d => d.severity === 'error')
  const summary = JSON.stringify(errors.map(d => `${d.file}:${d.line}:${d.col} ${d.code} ${d.message}`))
  if (e.compile === 'ok') {
    assert.ok(result.ok, `expected the domain to compile: ${summary}`)
    if (e.irName !== undefined) assert.equal(result.ir.name, e.irName, 'DomainIR.name')
    for (const name of e.irCallterms ?? [])
      assert.ok(result.ir.callterms.includes(name), `DomainIR.callterms lacks ${name}: ${JSON.stringify(result.ir.callterms)}`)
    return
  }
  assert.ok(!result.ok, 'expected a compile error')
  assert.ok(errors.length > 0, 'expected at least one error diagnostic')
  if (e.errorCount !== undefined) assert.equal(errors.length, e.errorCount, `error count ${summary}`)
  if (e.errorLines) assert.deepEqual(errors.map(d => d.line), e.errorLines, `error lines ${summary}`)
  if (e.errorAt) {
    const first = errors[0]
    const want = e.errorAt.find !== undefined
      ? findPosition(e.errorAt.file && c.sources ? c.sources[e.errorAt.file] : sourceText(c), e.errorAt.find, undefined, e.errorAt.nth)
      : { line: e.errorAt.line, col: e.errorAt.col }
    if (want.line !== undefined) assert.equal(first.line, want.line, `first error line ${summary}`)
    if (want.col !== undefined) assert.equal(first.col, want.col, `first error column ${summary}`)
    if (e.errorAt.file) assert.ok(first.file.replace(/\\/g, '/').endsWith(e.errorAt.file), `first error file ${summary}`)
  }
}

for (const c of loadCases()) {
  test(c.name, () => {
    const result = compileCase(c)
    if (isCompileExpect(c.expect)) return runCompileCase(c, c.expect, result)
    assert.ok(result.ok, `domain failed to compile: ${JSON.stringify(result.diagnostics)}`)
    const run = new CaseRun(c, result.ir)
    if (c.expect) {
      const args = parseAtoms(c.args ?? [])
      const method = c.method as string
      const planned = decompose(result.ir, run.world, method, args, run.options())
      run.checkPlan('expect', planned, c.expect, { method, args })
      return
    }
    c.script!.forEach((op, i) => run.run(op, `script[${i}] ${op.op}${'method' in op ? ' ' + op.method : ''}`))
  })
}
