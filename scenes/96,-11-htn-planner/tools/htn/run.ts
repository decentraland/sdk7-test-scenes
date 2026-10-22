// CLI: the debugger's Domain Runner in a terminal (upstream HTNDemo main.cpp:346-462: domain, top-level method,
// backtracking mode, world state; Run -> status, ms, plan, tree, world). Mainly for AI agents: edit a domain, run it
// against a world state, read the plan, the failed branches and why. Compiles the domain (with includes) in memory,
// plans with src/debugger/runner.ts (the tab's code) and prints src/debugger/runner-report.ts.
// Usage: `npm run htn:run -- --help`. Exit codes: 0 plan found, 1 no plan or a runtime failure, 2 usage or compile
// error, 3 invalid world. Never prints a stack trace for a user error.
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { buildSession, domainGraph, formatAtom, listCallterms, WorldState } from '../../src/htn-planner'
import type { Atom, BacktrackingMode, CallTerm, DomainIR, ViewMode } from '../../src/htn-planner'
import { parseAtom } from '../../src/examples/upstream/atom-literal'
import { CALLTERM_SETS, HostContext } from '../../src/examples/upstream/conformance-callterms'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../src/examples/upstream/lab'
import { galleryCallterms, MODES } from '../../src/examples/upstream/stations'
import { cloneWorld, EMPTY_WORLD, findRunnerWorld, runDomain, RunnerDomain, runnerCatalogue, runnerWorlds, RunnerWorld, topLevelMethods, worldSlugs } from '../../src/debugger/runner'
import { formatRunReport, runReport } from '../../src/debugger/runner-report'
import { compileDomainFile, formatDiagnostic, parseWorldState } from './compiler'
import { findStory, loadCanon, playStory, storyId } from './canon'
import type { Canon } from './canon'
import { loadWorldInvariants, InvalidWorldError, InvariantConfigError } from './world-invariants'

export const RUN_USAGE = `usage: npm run htn:run -- <file.domain> [method] [args...] [options]
       npm run htn:run -- [method] [args...] --world <scenario>   (the scenario's own domain)
       npm run htn:run -- --story <station>/<story> [--session <file>] [--json]
       npm run htn:run -- --list [file.domain]
Plans once with the debugger's Domain Runner and prints status, ms, the plan, the decomposition tree,
the failed branches (with --verbose, or when there is no plan), the world diff and diagnostics.
  method            a top-level method; default: the scenario's, else the domain's only one
  args              atom literals: 3  -1.5  sym  "text"  (1 2)
  --world <w>       a .worldstate file, a gallery, lab or canonical scenario id (see --list) or 'empty' (default)
  --story <id>      play a canonical example's story (see --list): print its trace; exit 1 when it differs
                    from the story's expected trace. With --session, the whole story is one session.
  --invariants <f>  condition-only checks; default: <domain stem>.invariants.domain when present.
                    Canonical stories use their stations' sidecars (no override).
  --mode <m>        backtracking mode: ALL (default), FACTS_AND_AXIOMS, BRANCHES, NONE
  --verbose, -v     the Verbose tree: every attempt, failed branches with their failing condition
  --json            one JSON object on stdout (status, ms, plan, rows, failures, diagnostics...)
  --session <file>  also write a DebugSession (the debugger's data model; parseSession loads it)
  --max-passes <n>  planner calls at most: above 1, expand the plan's deferred & steps (default 1)
  --callterms <s>   callterm set: gallery (default for files and 'empty'), none, or a lab set (see --list)
  --repeats <n>     untraced runs for the time (default: 20 and at least 20 ms, as the tab)
  --why <name>      why the plan did not take a branch (method.branch or branch), method or primitive
                    (!name): the failing condition per binding with the rows it needed vs the world's,
                    "never reached" behind an earlier branch, or "not in the domain"; repeatable
exit: 0 plan found, 1 no plan or runtime failure, 2 usage/compile/check error, 3 invalid world`

export interface CliIO {
  out(text: string): void
  err(text: string): void
  /** Where relative paths resolve (npm sets INIT_CWD to the caller's folder). */
  cwd: string
}

export const EXIT_PLAN = 0
export const EXIT_NO_PLAN = 1
export const EXIT_USAGE = 2

class UsageError extends Error {}

interface Options {
  positional: string[]
  world?: string
  invariants?: string
  story?: string
  mode?: string
  verbose: boolean
  json: boolean
  session?: string
  maxPasses: number
  callterms?: string
  /** undefined: the tab's timing (at least 20 runs and 20 ms); given: exactly this many. */
  repeats?: number
  list: boolean
  help: boolean
  /** --why, in order. */
  why: string[]
}

const VALUE_OPTIONS = new Set(['--invariants', '--world', '--story', '--mode', '--session', '--max-passes', '--callterms', '--repeats', '--why'])

function intOption(name: string, text: string, min: number): number {
  if (!/^\d+$/.test(text) || Number(text) < min) throw new UsageError(`${name} takes a whole number >= ${min}, got '${text}'`)
  return Number(text)
}

export function parseOptions(argv: readonly string[]): Options {
  const o: Options = { positional: [], verbose: false, json: false, maxPasses: 1, list: false, help: false, why: [] }
  let rest = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (rest || !a.startsWith('--') || /^--?\d/.test(a)) {
      // A negative number (-3, -1.5) is an argument, not an option.
      if (a === '-v' && !rest) o.verbose = true
      else if (a === '-h' && !rest) o.help = true
      else o.positional.push(a)
      continue
    }
    if (a === '--') {
      rest = true
      continue
    }
    const eq = a.indexOf('=')
    const name = eq > 0 ? a.slice(0, eq) : a
    let value: string | undefined = eq > 0 ? a.slice(eq + 1) : undefined
    if (VALUE_OPTIONS.has(name) && value === undefined) {
      value = argv[++i]
      if (value === undefined) throw new UsageError(`${name} needs a value`)
    }
    switch (name) {
      case '--invariants':
        o.invariants = value
        break
      case '--world':
        o.world = value
        break
      case '--story':
        o.story = value
        break
      case '--mode':
        o.mode = value
        break
      case '--session':
        o.session = value
        break
      case '--callterms':
        o.callterms = value
        break
      case '--max-passes':
        o.maxPasses = intOption(name, value!, 1)
        break
      case '--repeats':
        o.repeats = intOption(name, value!, 0)
        break
      case '--why':
        o.why.push(value!)
        break
      case '--verbose':
        o.verbose = true
        break
      case '--json':
        o.json = true
        break
      case '--list':
        o.list = true
        break
      case '--help':
        o.help = true
        break
      default:
        throw new UsageError(`unknown option '${a}'`)
    }
  }
  return o
}

const CALLTERM_SET_NAMES = ['gallery', 'none', ...Object.keys(CALLTERM_SETS).filter(k => k !== 'empty')]

function calltermSet(name: string): Readonly<Record<string, CallTerm>> | undefined {
  if (name === 'gallery') return { ...listCallterms, ...galleryCallterms }
  if (name === 'none' || name === 'empty') return {}
  const set = CALLTERM_SETS[name]
  if (!set) throw new UsageError(`unknown callterm set '${name}'; sets: ${CALLTERM_SET_NAMES.join(', ')}`)
  return set
}

/** A context every callterm set reads: the gallery's (`world`) and the lab's (HostContext). */
const hostContext = (world: WorldState): HostContext => ({ world, vars: {}, trace: [], counters: {}, errors: [] })

function modeOf(text: string): { name: string; mode: BacktrackingMode } {
  const key = text.toUpperCase().replace(/-/g, '_')
  const found = MODES.find(m => m.name === key)
  if (!found) throw new UsageError(`unknown mode '${text}'; modes: ${MODES.map(m => m.name).join(', ')}`)
  return found
}

const modeName = (mode: BacktrackingMode) =>
  MODES.find(m => m.mode.factsAndAxioms === mode.factsAndAxioms && m.mode.branches === mode.branches)?.name ?? JSON.stringify(mode)

/** `name/arity (name ?a ?b)` for each top-level method. */
function methodList(domain: DomainIR): string[] {
  const graph = domainGraph(domain)
  return topLevelMethods(domain).map(m => {
    const g = graph.methods.find(x => x.topLevel && x.name === m.name && x.params.length === m.arity)
    return `${m.name}/${m.arity} (${[m.name, ...(g?.params ?? [])].join(' ')})`
  })
}

let canonCache: Canon | undefined
/** The canonical examples (src/examples/canon), read from disk once. */
const canon = () => (canonCache ??= loadCanon())

let catalogueCache: RunnerDomain[] | undefined
const catalogue = () =>
  (catalogueCache ??= runnerCatalogue([...GALLERY_STATIONS, ...LAB_STATIONS, ...canon().stations]))

interface Loaded {
  domain: DomainIR
  /** Compile warnings, formatted. */
  warnings: string[]
}

/** Compile a domain file; errors print as `htn:compile --check` does and end the run (exit 2). */
function compile(path: string, io: CliIO, json: boolean): Loaded | number {
  // As given when it means the same file from here, so diagnostics read as `htn:compile --check` prints them.
  const here = nodePath.resolve(path) === nodePath.resolve(io.cwd, path)
  const result = compileDomainFile(here ? path : nodePath.resolve(io.cwd, path))
  const lines = result.diagnostics.map(formatDiagnostic)
  if (!result.ok) {
    const errors = result.diagnostics.filter(d => d.severity === 'error').length
    const summary = `htn:run: compile failed for '${path}' with ${errors} error(s)`
    if (json) io.out(JSON.stringify({ version: 1, status: 'compile_error', diagnostics: lines, error: summary }))
    else {
      for (const l of lines) io.err(l)
      io.err(summary)
    }
    return EXIT_USAGE
  }
  return { domain: result.ir, warnings: lines }
}

function listing(io: CliIO, domains: { file: string; domain: DomainIR }[]): void {
  const out: string[] = []
  for (const d of domains) {
    out.push(`domain: ${d.domain.name} (${d.file})`)
    for (const m of methodList(d.domain)) out.push(`  top-level: ${m}`)
  }
  const names = new Set(domains.map(d => d.domain.name))
  const shown = catalogue().filter(c => names.size === 0 || names.has(c.domain.name))
  const groups = shown.length > 0 ? shown : catalogue()
  const worlds = runnerWorlds(groups)
  const slugs = worldSlugs(catalogue())
  out.push(`world states: ${worlds.length} (--world <id>; also a .worldstate file or 'empty')${shown.length === 0 && names.size ? ' (none for this domain; all listed)' : ''}`)
  for (const g of groups) {
    const own = g.worlds.filter(w => w !== EMPTY_WORLD)
    if (own.length === 0) continue
    out.push(`  domain ${g.domain.name}: top-level ${topLevelMethods(g.domain).map(m => `${m.name}/${m.arity}`).join(', ')}`)
    for (const w of own) {
      const call = w.method ? ` (${[w.method, ...(w.args ?? []).map(formatAtom)].join(' ')})` : ''
      const mode = w.mode ? ` mode ${modeName(w.mode)}` : ''
      const expect = w.status ? ` expects ${w.status}${w.expect && w.expect.length ? ': ' + w.expect.join(', ') : ''}` : ''
      out.push(`    ${slugs.get(w)}${call}${mode}${expect}`)
    }
  }
  const stories = canon().stations.filter(s => names.size === 0 || names.has(s.domain.name)).flatMap(s => s.stories)
  out.push(`stories: ${stories.length} (--story <id>; canonical examples, src/examples/canon)`)
  for (const s of stories) out.push(`    ${storyId(s)}: ${s.blurb}`)
  for (const p of canon().problems) out.push(`problem: ${p}`)
  out.push(`callterm sets: ${CALLTERM_SET_NAMES.join(', ')}`)
  out.push(`modes: ${MODES.map(m => m.name).join(', ')}`)
  for (const l of out) io.out(l)
}

function loadWorld(o: Options, io: CliIO): { world: RunnerWorld; scenarioDomain?: RunnerDomain } {
  const callterms = o.callterms !== undefined ? calltermSet(o.callterms) : undefined
  const id = o.world ?? 'empty'
  if (id === 'empty') return { world: { ...EMPTY_WORLD, callterms: callterms ?? calltermSet('gallery'), context: hostContext } }
  if (id.endsWith('.worldstate')) {
    const path = nodePath.resolve(io.cwd, id)
    const world = new WorldState()
    let text: string
    try {
      text = fs.readFileSync(path, 'utf8')
    } catch {
      throw new UsageError(`cannot read world state '${id}'`)
    }
    try {
      parseWorldState(text, world)
    } catch (e) {
      throw new UsageError(`${id}: ${(e as Error).message}`)
    }
    const w = cloneWorld(id, nodePath.basename(id), world)
    return { world: { ...w, callterms: callterms ?? calltermSet('gallery'), context: hostContext } }
  }
  const found = findRunnerWorld(catalogue(), id)
  if (!found) throw new UsageError(`unknown world state '${id}': a .worldstate file, 'empty', or a scenario id from --list`)
  const world = { ...found.world, id: found.slug }
  return { world: callterms ? { ...world, callterms, unbound: [] } : world, scenarioDomain: found.domain }
}

/** The method and its arguments: given, the scenario's, or the domain's only top-level method. */
function pickMethod(domain: DomainIR, given: string[], world: RunnerWorld): { method: string; args: Atom[] } {
  const methods = topLevelMethods(domain)
  const list = () => methodList(domain).join(', ')
  if (methods.length === 0) throw new UsageError(`domain '${domain.name}' has no top-level method`)
  let method = given[0]
  let args: Atom[] | undefined
  if (given.length > 1) {
    args = given.slice(1).map(text => {
      try {
        return parseAtom(text)
      } catch (e) {
        throw new UsageError(`argument ${(e as Error).message}`)
      }
    })
  }
  if (method === undefined) {
    const scenario = world.method && methods.some(m => m.name === world.method && m.arity === (world.args ?? []).length)
    if (scenario) method = world.method!
    else if (new Set(methods.map(m => m.name)).size === 1) method = methods[0].name
    else throw new UsageError(`pick a top-level method of '${domain.name}': ${list()}`)
  }
  if (args === undefined) args = world.method === method ? (world.args ?? []).slice() : []
  const arity = args.length
  if (!methods.some(m => m.name === method && m.arity === arity)) {
    const named = methods.filter(m => m.name === method)
    const why = named.length ? `takes ${named.map(m => m.arity).join(' or ')} argument(s), got ${arity}` : 'is not a top-level method'
    throw new UsageError(`'${method}' ${why}; top-level methods of '${domain.name}': ${list()}`)
  }
  return { method, args }
}

/** Write a session file (a DebugSession as JSON). */
function writeSession(file: string, session: unknown, io: CliIO): void {
  const path = nodePath.resolve(io.cwd, file)
  try {
    fs.mkdirSync(nodePath.dirname(path), { recursive: true })
    fs.writeFileSync(path, JSON.stringify(session))
  } catch (e) {
    throw new UsageError(`cannot write session '${file}': ${(e as Error).message}`)
  }
}

/** --story: play a canonical story, print its trace; 0 when it is the story's expected trace, else 1. */
function runStory(o: Options, io: CliIO): number {
  if (o.invariants !== undefined) throw new UsageError('--story uses station sidecars; --invariants is for a single domain run')
  const story = findStory(canon(), o.story!)
  if (!story) throw new UsageError(`unknown story '${o.story}': see --list`)
  const id = storyId(story)
  const { trace, session } = playStory(canon(), story, o.session !== undefined)
  if (o.session !== undefined) writeSession(o.session, session, io)
  const at = trace.findIndex((l, i) => l !== story.expect[i])
  const differs = at >= 0 || trace.length !== story.expect.length
  const first = at >= 0 ? at : Math.min(trace.length, story.expect.length)
  if (o.json) {
    io.out(JSON.stringify({ version: 1, story: id, station: story.station, blurb: story.blurb, trace, expect: story.expect, matches: !differs, session: o.session ?? null }))
  } else {
    io.out(`story: ${id} (${story.blurb})`)
    for (const l of trace) io.out(`  ${l}`)
    io.out(differs ? `differs from the expected trace at line ${first + 1}: expected ${JSON.stringify(story.expect[first] ?? '(end)')}` : 'matches the expected trace')
    if (o.session !== undefined) io.out(`session: ${o.session}`)
  }
  return differs ? EXIT_NO_PLAN : EXIT_PLAN
}

function run(o: Options, io: CliIO): number {
  if (o.story !== undefined && !o.list) return runStory(o, io)
  const domainFile = o.positional[0]?.endsWith('.domain') ? o.positional[0] : undefined
  const rest = domainFile ? o.positional.slice(1) : o.positional

  if (o.list) {
    const domains: { file: string; domain: DomainIR }[] = []
    for (const file of o.positional.filter(p => p.endsWith('.domain'))) {
      const loaded = compile(file, io, false)
      if (typeof loaded === 'number') return loaded
      domains.push({ file, domain: loaded.domain })
    }
    listing(io, domains)
    return EXIT_PLAN
  }

  const given = o.mode !== undefined ? modeOf(o.mode) : undefined
  const { world, scenarioDomain } = loadWorld(o, io)
  let domain: DomainIR
  let warnings: string[] = []
  if (domainFile) {
    const loaded = compile(domainFile, io, o.json)
    if (typeof loaded === 'number') return loaded
    domain = loaded.domain
    warnings = loaded.warnings
    if (!o.json) for (const w of warnings) io.err(w)
  } else if (scenarioDomain) domain = scenarioDomain.domain
  else throw new UsageError('give a .domain file, or --world <scenario> to run the scenario’s own domain')

  const canonical = !domainFile ? canon().stations.find(s => s.domain === domain) : undefined
  const checks = domainFile || o.invariants
    ? loadWorldInvariants(nodePath.resolve(io.cwd, domainFile ?? 'explicit.domain'),
        o.invariants === undefined ? undefined : nodePath.resolve(io.cwd, o.invariants))
    : canonical?.invariants
  // Validate every setup the runner uses (including its separate timing runs), before planning.
  const checkedWorld = checks ? { ...world, setup: (w: WorldState) => {
    world.setup(w)
    checks.assert(w, world.id)
  } } : world
  const { method, args } = pickMethod(domain, rest, world)
  const mode = given ?? { name: world.mode ? modeName(world.mode) : MODES[0].name, mode: world.mode ?? MODES[0].mode }
  const view: ViewMode = o.verbose ? 'verbose' : 'normal'
  const timing = o.repeats === undefined ? {} : { repeats: o.repeats, minTotalMs: 0 }
  const result = runDomain({ domain, method, args, world: checkedWorld, mode: mode.mode, maxPasses: o.maxPasses, ...timing })
  const report = runReport({ result, method, world: { id: world.id, label: world.label }, mode: mode.name, view, why: o.why })
  if (scenarioDomain && scenarioDomain.domain.name !== domain.name)
    report.diagnostics.unshift(`note: world state '${world.id}' is a scenario of domain '${scenarioDomain.domain.name}', not '${domain.name}'`)

  if (o.session !== undefined) writeSession(o.session, buildSession({ domain, agents: [{ id: 'domain-runner', recorder: result.recorder, world: result.world }] }), io)
  const failed = result.status !== 'succeeded' || result.expansions.some(e => e.status !== 'succeeded')
  if (o.json) io.out(JSON.stringify({ ...report, domainFile: domainFile ?? null, compile: warnings, session: o.session ?? null, ...(checks ? { worldValidation: { status: 'passed', file: checks.file } } : {}) }))
  else {
    for (const l of formatRunReport(report)) io.out(l)
    if (checks) io.out(`world checks: passed (${checks.file})`)
    if (o.session !== undefined) io.out(`session: ${o.session}`)
  }
  return failed ? EXIT_NO_PLAN : EXIT_PLAN
}

/** Run the CLI; returns the exit code. User errors print one line (JSON with --json), never a stack trace. */
export function runCli(argv: readonly string[], io: CliIO): number {
  let json = argv.includes('--json')
  try {
    const o = parseOptions(argv)
    json = o.json
    if (o.help) {
      io.out(RUN_USAGE)
      return EXIT_PLAN
    }
    return run(o, io)
  } catch (e) {
    if (e instanceof InvalidWorldError || e instanceof InvariantConfigError) {
      const invalid = e instanceof InvalidWorldError
      if (json) io.out(JSON.stringify({ version: 1, status: invalid ? 'invalid_world' : 'invariant_error',
        error: e.message, ...(invalid ? { file: e.file, checks: e.checks, context: e.context } : {}) }))
      else io.err(`htn:run: ${e.message}`)
      return invalid ? 3 : EXIT_USAGE
    }
    const usage = e instanceof UsageError
    const message = usage ? `htn:run: ${e.message}` : `htn:run: internal error: ${(e as Error)?.message ?? String(e)}`
    if (json) io.out(JSON.stringify({ version: 1, status: usage ? 'usage_error' : 'internal_error', error: message }))
    else io.err(usage ? `${message}\n(npm run htn:run -- --help)` : message)
    return usage ? EXIT_USAGE : EXIT_NO_PLAN
  }
}
