// Conformance case format (see README.md in this folder and src/htn-planner/htn/README.md) plus the loader and
// structural validation shared by cases-schema.test.ts and conformance.test.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAtom } from '../../../src/examples/upstream/atom-literal'
import { CALLTERM_SETS } from '../../../src/examples/upstream/conformance-callterms'

export const REPO_ROOT: string = process.env.HTN_REPO_ROOT ?? process.cwd()
export const FIXTURES_DIR = join(REPO_ROOT, 'test', 'htn', 'fixtures')
export const CASES_DIR = join(REPO_ROOT, 'test', 'htn', 'conformance', 'cases')

export type AtomLiteral = string // domain syntax, plus `#true`/`#false`
export type FactLiteral = [string, ...AtomLiteral[]] // [name, arg...]
export type AtomTypeName = 'int' | 'float' | 'bool' | 'sym' | 'str' | 'list'
export type Status = 'succeeded' | 'no_plan' | 'invalid_call' | 'depth_exceeded'

export interface ModeSpec {
  factsAndAxioms: boolean
  branches: boolean
}

/** Partial check of one plan step (used where upstream only inspects parts of a step). */
export interface StepExpect {
  at: number // index; negative counts from the end
  text?: string // whole step, formatTask format
  head?: string // '!name' or '&name'
  contains?: string // substring of the formatted step
  argCount?: number
  // Keys are argument paths: '2' = argument 2; '2.1' = element 1 of the list in argument 2.
  args?: Record<string, string> // path -> formatAtom text
  types?: Record<string, AtomTypeName> // path -> atom type
  sizes?: Record<string, number> // path -> list length
  nums?: Record<string, number> // path -> numeric value (float compared as float32; 0/-0 distinguished)
}

/** A runtime diagnostic's source position: explicit, or found in the domain text like upstream does. */
export interface SourceExpect {
  code: string
  line?: number
  col?: number
  find?: string // text whose first char is the expected position
  after?: string // start searching after this text (e.g. '(:method (condition)')
  nth?: number // 1-based occurrence of `find` after `after` (default 1)
  file?: string // fixture-relative file to search (default: the case domain)
  reason?: string // callterm diagnostics: calltermError.reason (upstream HTNCallTermErrorReason, snake_case)
}

export interface PlanExpect {
  status: Status
  plan?: string[] // exact plan; deferred steps as '&name args'
  planLength?: number
  nonEmpty?: boolean
  steps?: StepExpect[]
  includesSteps?: string[] // each must equal some formatted step
  excludesSteps?: string[] // none may equal a formatted step
  samePlanAs?: string // label saved by an earlier op's `save`
  samePlanPlus?: string[] // with samePlanAs: the saved plan followed by these steps
  calls?: Record<string, number> // host counters (callterm sets bump them); cumulative within a case
  trace?: string[] // host trace (callterm sets push to it); cumulative within a case
  diagnostics?: Record<string, number> // RuntimeDiagnostic code -> count; cumulative within a case
  diagnosticAt?: SourceExpect[] // source of the latest diagnostic with that code
  executed?: string[] // primitives seen by a PlanRunner loop with no world changes
  executedResult?: 'completed' | 'failed' // final PlanRunner resolution of that loop (default 'completed')
}

export interface CompileExpect {
  compile: 'ok' | 'error'
  errorCount?: number
  errorLines?: number[] // lines of every error, in order
  errorAt?: { line?: number; col?: number; find?: string; nth?: number; file?: string } // first error
  upstreamMessage?: string // documentation only: upstream's message substring (not asserted)
  irName?: string // DomainIR.name of a successful compile
  irCallterms?: string[] // must all appear in DomainIR.callterms
}

export type Op =
  | { op: 'decompose'; method: string; args?: AtomLiteral[]; mode?: ModeSpec; save?: string; expect: PlanExpect }
  | { op: 'plan'; method: string; args?: AtomLiteral[]; expect: PlanExpect & { remaining?: string[] } }
  | {
      op: 'resolve'
      expect: 'ready' | 'completed' | 'failed'
      current?: string
      currentStep?: Omit<StepExpect, 'at'>
      remaining?: string[]
      calls?: Record<string, number>
      trace?: string[]
      diagnostics?: Record<string, number>
      diagnosticAt?: SourceExpect[]
    }
  | { op: 'complete' }
  | { op: 'clear' }
  | { op: 'expandDeferred'; from: number; of?: string; save?: string; expect: PlanExpect } // decomposeDeferred(plan[from]); plan = saved `of` or the last one
  | { op: 'decomposeDeferred'; method: string; args?: AtomLiteral[]; expect: PlanExpect } // by name, not top-level only
  | { op: 'addFact'; fact: FactLiteral }
  | { op: 'addFacts'; facts: FactLiteral[] }
  | { op: 'removeFact'; name: string; arity: number; index: number } // upstream RemoveFact(name, arity, index)
  | { op: 'clearFacts'; name: string; arity: number }
  | { op: 'clearWorld' }
  | { op: 'loadWorldstate'; path: string } // clears first, like HTNDatabaseHook::ParseWorldStateFile
  | { op: 'setVar'; name: string; value: AtomLiteral | null }
  | { op: 'resetCounters' }
  | { op: 'expectCounters'; calls?: Record<string, number>; trace?: string[]; diagnostics?: Record<string, number> }

export interface ConformanceCase {
  name: string
  upstream: string
  note?: string
  domain: string // fixture path (relative to test/htn/fixtures/), or a key of `sources`
  sources?: Record<string, string> // in-memory domain files (upstream tests with inline sources)
  worldstate?: string | string[]
  facts?: FactLiteral[]
  callterms?: string
  calltermErrorPolicy?: 'fail_silently' | 'report' // default 'report' (diagnostics recorded)
  vars?: Record<string, AtomLiteral | null>
  mode?: ModeSpec
  maxDepth?: number
  method?: string
  args?: AtomLiteral[]
  expect?: PlanExpect | CompileExpect
  script?: Op[]
  file?: string // set by the loader
}

export function isCompileExpect(e: PlanExpect | CompileExpect | undefined): e is CompileExpect {
  return !!e && 'compile' in e
}

/** Every case in cases/*.json. A file holds one case object or an array of cases. */
export function loadCases(): ConformanceCase[] {
  const out: ConformanceCase[] = []
  for (const file of readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')) as ConformanceCase | ConformanceCase[]
    for (const c of Array.isArray(data) ? data : [data]) out.push({ ...c, file })
  }
  return out
}

const STATUSES: Status[] = ['succeeded', 'no_plan', 'invalid_call', 'depth_exceeded']
const TYPES: AtomTypeName[] = ['int', 'float', 'bool', 'sym', 'str', 'list']
const REASONS = [
  'not_registered', 'missing_binding', 'missing_instance', 'argument_count_mismatch', 'argument_type_mismatch',
  'argument_conversion_failed', 'return_conversion_failed', 'non_boolean_condition_result'
]
const PLAN_KEYS = new Set([
  'status', 'plan', 'planLength', 'nonEmpty', 'steps', 'includesSteps', 'excludesSteps', 'samePlanAs',
  'samePlanPlus', 'calls', 'trace', 'diagnostics',
  'diagnosticAt', 'executed', 'executedResult', 'remaining'
])
const CASE_KEYS = new Set([
  'name', 'upstream', 'note', 'domain', 'sources', 'worldstate', 'facts', 'callterms', 'calltermErrorPolicy', 'vars', 'mode',
  'maxDepth', 'method', 'args', 'expect', 'script', 'file'
])
const OP_KEYS: Record<string, string[]> = {
  decompose: ['method', 'args', 'mode', 'save', 'expect'],
  plan: ['method', 'args', 'expect'],
  resolve: ['expect', 'current', 'currentStep', 'remaining', 'calls', 'trace', 'diagnostics', 'diagnosticAt'],
  complete: [],
  clear: [],
  expandDeferred: ['from', 'of', 'save', 'expect'],
  decomposeDeferred: ['method', 'args', 'expect'],
  addFact: ['fact'],
  addFacts: ['facts'],
  removeFact: ['name', 'arity', 'index'],
  clearFacts: ['name', 'arity'],
  clearWorld: [],
  loadWorldstate: ['path'],
  setVar: ['name', 'value'],
  resetCounters: [],
  expectCounters: ['calls', 'trace', 'diagnostics']
}

/** Structural problems of one case (empty when valid). Does not need the compiler or planner. */
export function validateCase(c: ConformanceCase): string[] {
  const errors: string[] = []
  const err = (m: string) => errors.push(m)
  const literal = (where: string, text: unknown) => {
    if (typeof text !== 'string') return err(`${where}: literal must be a string`)
    try {
      parseAtom(text)
    } catch (e) {
      err(`${where}: ${(e as Error).message}`)
    }
  }
  const fact = (where: string, f: unknown) => {
    if (!Array.isArray(f) || f.length === 0 || typeof f[0] !== 'string' || !/^[A-Za-z_][\w]*$/.test(f[0]))
      return err(`${where}: fact must be [name, ...literals]`)
    f.slice(1).forEach((a, i) => literal(`${where}[${i + 1}]`, a))
  }
  const fixture = (where: string, p: unknown) => {
    if (typeof p !== 'string' || !p) return err(`${where}: missing path`)
    if (!existsSync(join(FIXTURES_DIR, p))) err(`${where}: fixture not found: ${p}`)
  }
  const mode = (where: string, m: unknown) => {
    const v = m as ModeSpec
    if (typeof v !== 'object' || typeof v.factsAndAxioms !== 'boolean' || typeof v.branches !== 'boolean')
      err(`${where}: mode needs boolean factsAndAxioms and branches`)
  }
  const step = (where: string, s: StepExpect, needAt: boolean) => {
    if (needAt && typeof s.at !== 'number') err(`${where}.at must be a number`)
    for (const [i, t] of Object.entries(s.types ?? {}))
      if (!TYPES.includes(t)) err(`${where}.types[${i}]: unknown type ${t}`)
    for (const m of [s.args, s.types, s.sizes, s.nums])
      for (const k of Object.keys(m ?? {})) if (!/^\d+(\.\d+)*$/.test(k)) err(`${where}: bad argument path ${k}`)
  }
  const plan = (where: string, e: PlanExpect | undefined) => {
    if (!e || typeof e !== 'object') return err(`${where}: missing expect`)
    if (!STATUSES.includes(e.status)) err(`${where}.status: must be one of ${STATUSES.join(', ')}`)
    for (const k of Object.keys(e)) if (!PLAN_KEYS.has(k)) err(`${where}: unknown key ${k}`)
    if (e.plan && !e.plan.every(s => typeof s === 'string')) err(`${where}.plan: strings only`)
    e.steps?.forEach((s, i) => step(`${where}.steps[${i}]`, s, true))
    if (e.executedResult && !['completed', 'failed'].includes(e.executedResult)) err(`${where}.executedResult`)
    e.diagnosticAt?.forEach((d, i) => {
      if (!d.code) err(`${where}.diagnosticAt[${i}].code missing`)
      if (d.find === undefined && (d.line === undefined || d.col === undefined))
        err(`${where}.diagnosticAt[${i}]: needs line+col or find`)
      if (d.file) fixture(`${where}.diagnosticAt[${i}].file`, d.file)
      if (d.reason !== undefined && !REASONS.includes(d.reason)) err(`${where}.diagnosticAt[${i}].reason: unknown ${d.reason}`)
    })
  }

  if (!c.name || typeof c.name !== 'string') err('name: missing')
  if (!c.upstream || typeof c.upstream !== 'string') err('upstream: missing')
  for (const k of Object.keys(c)) if (!CASE_KEYS.has(k)) err(`unknown key ${k}`)
  if (c.sources) {
    if (typeof c.sources !== 'object') err('sources: must be an object')
    else if (!(c.domain in c.sources)) err(`domain: ${c.domain} is not a key of sources`)
  } else fixture('domain', c.domain)
  for (const w of c.worldstate === undefined ? [] : Array.isArray(c.worldstate) ? c.worldstate : [c.worldstate])
    fixture('worldstate', w)
  c.facts?.forEach((f, i) => fact(`facts[${i}]`, f))
  c.args?.forEach((a, i) => literal(`args[${i}]`, a))
  for (const [k, v] of Object.entries(c.vars ?? {})) if (v !== null) literal(`vars.${k}`, v)
  if (c.callterms !== undefined && !(c.callterms in CALLTERM_SETS)) err(`callterms: unknown set ${c.callterms}`)
  if (c.mode) mode('mode', c.mode)
  if (c.maxDepth !== undefined && !(Number.isInteger(c.maxDepth) && c.maxDepth > 0)) err('maxDepth: positive int')
  if (c.calltermErrorPolicy !== undefined && !['fail_silently', 'report'].includes(c.calltermErrorPolicy))
    err('calltermErrorPolicy: fail_silently | report')

  const hasScript = c.script !== undefined
  if (hasScript === (c.expect !== undefined)) err('exactly one of expect / script is required')
  if (isCompileExpect(c.expect)) {
    if (!['ok', 'error'].includes(c.expect.compile)) err('expect.compile: ok | error')
    if (c.method !== undefined) err('compile cases take no method')
  } else if (c.expect) {
    if (typeof c.method !== 'string' || !c.method) err('method: missing')
    plan('expect', c.expect)
  }
  if (hasScript) {
    if (!Array.isArray(c.script) || c.script.length === 0) return [...errors, 'script: non-empty array']
    if (c.method !== undefined || c.args !== undefined) err('script cases put method/args on ops')
    const labels = new Set<string>()
    c.script.forEach((o, i) => {
      const w = `script[${i}]`
      const allowed = OP_KEYS[o.op]
      if (!allowed) return err(`${w}: unknown op ${o.op}`)
      for (const k of Object.keys(o)) if (k !== 'op' && !allowed.includes(k)) err(`${w}: unknown key ${k}`)
      switch (o.op) {
        case 'decompose':
        case 'plan':
        case 'decomposeDeferred':
          if (typeof o.method !== 'string' || !o.method) err(`${w}.method missing`)
          o.args?.forEach((a, j) => literal(`${w}.args[${j}]`, a))
          if (o.op === 'decompose' && o.mode) mode(`${w}.mode`, o.mode)
          plan(`${w}.expect`, o.expect)
          break
        case 'expandDeferred':
          if (!Number.isInteger(o.from)) err(`${w}.from must be an int`)
          if (o.of !== undefined && !labels.has(o.of)) err(`${w}.of: unknown label ${o.of}`)
          plan(`${w}.expect`, o.expect)
          break
        case 'resolve':
          if (!['ready', 'completed', 'failed'].includes(o.expect)) err(`${w}.expect: ready | completed | failed`)
          if (o.currentStep) step(`${w}.currentStep`, o.currentStep as StepExpect, false)
          break
        case 'addFact':
          fact(`${w}.fact`, o.fact)
          break
        case 'addFacts':
          if (!Array.isArray(o.facts)) err(`${w}.facts must be an array`)
          else o.facts.forEach((f, j) => fact(`${w}.facts[${j}]`, f))
          break
        case 'removeFact':
        case 'clearFacts':
          if (typeof o.name !== 'string' || !Number.isInteger(o.arity)) err(`${w}: name/arity`)
          if (o.op === 'removeFact' && !Number.isInteger(o.index)) err(`${w}.index`)
          break
        case 'loadWorldstate':
          fixture(`${w}.path`, o.path)
          break
        case 'setVar':
          if (typeof o.name !== 'string') err(`${w}.name`)
          if (o.value !== null) literal(`${w}.value`, o.value)
          break
      }
      const save = (o as { save?: string }).save
      if (save) labels.add(save)
      const same = (o as { expect?: PlanExpect }).expect
      if (same && typeof same === 'object' && same.samePlanAs && !labels.has(same.samePlanAs))
        err(`${w}.expect.samePlanAs: unknown label ${same.samePlanAs}`)
    })
  }
  return errors
}
