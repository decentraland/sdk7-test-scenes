// Upstream golden plans (E4): which gallery and lab scenarios are planned by upstream urosidoki/htn_planner too, with
// what inputs, and how the checked-in reference plans are written and read. Shared by the generator
// (tools/upstream-golden/main.ts, npm run htn:golden) and the test (test/examples/upstream-golden.test.ts).
//
// One rule for every scenario: the world the scenario plans on (its setup, then its host, as the station tests do) is
// written as a .worldstate; when that world is exactly an upstream world state file, the upstream file itself is the
// input. The domain is the upstream file our generated module was compiled from. Callterms: the upstream host code of
// that domain (HTNTest's BindTestCallTerms, or the HTNDemo Wanderer agent with its Pathfinder). A scenario that cannot
// be expressed that way (a callterm set or depth the driver does not have, an atom with no .worldstate syntax) is
// listed with the reason instead.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { Atom, decompose, DecompositionStatus, DomainIR, formatTask, WorldState } from '../../src/htn-planner'
import { DEFAULT_MAX_DEPTH } from '../../src/htn-planner/htn/engine'
import { CALLTERM_SETS } from '../../src/examples/upstream/conformance-callterms'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../src/examples/upstream/lab'
import { galleryCallterms, GalleryScenario, GalleryStation, MODES } from '../../src/examples/upstream/stations'
import { emitDomainModule } from '../htn/emit'
import { parseWorldStateText } from '../htn/worldstate'

export const UPSTREAM_COMMIT = 'aec08fa36f2c521c4da00c045bf23b8aed7bfa92'
/** Fixtures, relative to the scene root. */
export const GOLDEN_DIR = 'test/fixtures/upstream-golden'
const FIXTURES = 'test/htn/fixtures/upstream/'

export type ModeName = 'ALL' | 'FACTS_AND_AXIOMS' | 'BRANCHES' | 'NONE'

export interface GoldenCase {
  /** Unique, file-name safe: `<station>__<scenario>[__<mode>]`. */
  id: string
  station: string
  scenario: string
  /** `upstream:<path in the upstream checkout>` or `scene:<path in the scene>`. */
  domain: string
  /** As `domain`, or `-` for an empty world. A `scene:` world is written from `worldText`. */
  worldstate: string
  worldText: string
  method: string
  /** Atoms in .worldstate syntax, `-` for none. */
  args: string
  mode: ModeName
  /** The driver's set: test (HTNTest), wanderer (HTNDemo), empty. */
  callterms: 'test' | 'wanderer' | 'empty'
  /** Our planner on the same input. */
  ours(): Plan
}

export interface Plan {
  status: DecompositionStatus | string
  steps: string[]
  /** One `<callterm> <reason>` per failed invocation, in order (upstream's Report policy). */
  calltermErrors: string[]
}

export interface Uncovered {
  station: string
  scenario: string
  reason: string
}

export interface GoldenPlan extends Plan {
  /** The header lines (inputs), `key: value`. */
  inputs: Record<string, string>
}

// ---- atoms and worlds in .worldstate syntax ---------------------------------------------------------------------

const IDENT = /^[A-Za-z_][A-Za-z0-9_\-]*$/

/** An atom as .worldstate text, or an error: bools have no literal, lists must be non-empty, strings unescaped. */
export function atomText(a: Atom): string | Error {
  switch (a.t) {
    case 'int':
      return String(a.v)
    case 'float': {
      const text = String(a.v)
      return /[.eE]/.test(text) ? text : `${text}.0`
    }
    case 'str':
      return /["\n\r\\]/.test(a.v) ? new Error(`string ${JSON.stringify(a.v)} has no .worldstate syntax`) : `"${a.v}"`
    case 'sym':
      return IDENT.test(a.v) ? a.v : new Error(`symbol '${a.v}' has no .worldstate syntax`)
    case 'bool':
      return new Error('a bool atom has no .worldstate syntax')
    case 'list': {
      if (a.v.length === 0) return new Error('an empty list has no .worldstate syntax')
      const items = a.v.map(atomText)
      const bad = items.find(i => i instanceof Error)
      return bad ?? `(${items.join(' ')})`
    }
  }
}

export function atomsText(atoms: readonly Atom[]): string | Error {
  const items = atoms.map(atomText)
  return items.find(i => i instanceof Error) ?? items.join(' ')
}

/** Every row of the world, table by table in creation order, rows in insertion order (upstream appends rows). */
export function worldText(world: WorldState): string | Error {
  const lines: string[] = []
  for (const key of world.tableKeys()) {
    const slash = key.lastIndexOf('/')
    const name = key.slice(0, slash)
    for (const row of world.rows(name, Number(key.slice(slash + 1)))) {
      const args = atomsText(row)
      if (args instanceof Error) return new Error(`${name}: ${args.message}`)
      lines.push(row.length === 0 ? name : `${name} ${args}`)
    }
  }
  return lines.map(l => l + '\n').join('')
}

// ---- inputs -----------------------------------------------------------------------------------------------------

const toPosix = (p: string) => p.split(sep).join('/')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  )
}

/** `upstream:`/`scene:` path of a scene file (fixtures are verbatim upstream copies). */
const sourceRef = (scenePath: string) =>
  scenePath.startsWith(FIXTURES) ? `upstream:${scenePath.slice(FIXTURES.length)}` : `scene:${scenePath}`

/**
 * The file a domain's generated module was compiled from (its `// Source:` header): the module whose object literal is
 * exactly this domain, as tools/htn/emit.ts writes it. Undefined when no module matches or its source is not a file
 * (e.g. the hot reload revisions, a template with @REVISION@ replaced).
 */
function domainSources(root: string): (ir: DomainIR) => string | undefined {
  const modules = walk(join(root, 'src/examples/upstream/generated'))
    .filter(f => f.endsWith('.htn.ts'))
    .map(f => {
      const text = readFileSync(f, 'utf8')
      return { body: literal(text), source: /^\/\/ Source: (.+)$/m.exec(text)?.[1].trim() }
    })
  const cache = new Map<DomainIR, string | undefined>()
  return ir => {
    if (!cache.has(ir)) {
      const body = literal(emitDomainModule(ir, 'domain'))
      const source = modules.find(m => m.body === body)?.source
      cache.set(ir, source && existsSync(join(root, source)) ? source : undefined)
    }
    return cache.get(ir)
  }
}

const literal = (module: string) => module.slice(module.indexOf(': DomainIR = ')).replace(/\r\n/g, '\n')

/** World text of every upstream world state file → their `upstream:` paths. */
function upstreamWorlds(root: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const file of walk(join(root, FIXTURES, 'WorldStates')).filter(f => f.endsWith('.worldstate')).sort()) {
    const world = new WorldState()
    parseWorldStateText(readFileSync(file, 'utf8'), world)
    const text = worldText(world)
    if (!(text instanceof Error)) out.set(text, [...(out.get(text) ?? []), sourceRef(toPosix(relative(root, file)))])
  }
  return out
}

/** Of several identical world state files, the one named most like the domain file (e.g. its own test's). */
function closest(files: string[], domain: string): string {
  const stem = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.[a-z]+$/, '').toLowerCase()
  const common = (a: string, b: string) => {
    let n = 0
    while (n < a.length && a[n] === b[n]) n++
    return n
  }
  return files.reduce((best, f) => (common(stem(f), stem(domain)) > common(stem(best), stem(domain)) ? f : best))
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const modeName = (mode: GalleryScenario['mode']): ModeName =>
  !mode ? 'ALL' : (MODES.find(m => m.mode.factsAndAxioms === mode.factsAndAxioms && m.mode.branches === mode.branches)!.name as ModeName)

/** The driver's callterm set for a scenario, or why there is none. */
function calltermSet(station: GalleryStation, s: GalleryScenario): GoldenCase['callterms'] | Error {
  const set = s.callterms ?? galleryCallterms
  if (set === galleryCallterms) return station.id === 'wanderer' ? 'wanderer' : 'test'
  if (set === CALLTERM_SETS.test) return 'test'
  if (set === CALLTERM_SETS.empty) return 'empty'
  const name = Object.entries(CALLTERM_SETS).find(([, v]) => v === set)?.[0] ?? '?'
  return new Error(`callterm set '${name}' is not in the driver`)
}

/** Every gallery and lab scenario as golden cases (stations with a Mode switch: one per mode), and the rest. */
export function goldenCases(root: string): { cases: GoldenCase[]; uncovered: Uncovered[] } {
  const sources = domainSources(root)
  const worlds = upstreamWorlds(root)
  const cases: GoldenCase[] = []
  const uncovered: Uncovered[] = []
  for (const station of [...GALLERY_STATIONS, ...LAB_STATIONS]) {
    for (const s of station.scenarios) {
      const skip = (reason: string) => void uncovered.push({ station: station.id, scenario: s.name, reason })
      const domain: DomainIR = s.domain ?? station.domain
      const source = sources(domain)
      if (!source) {
        skip(`no upstream source for domain ${domain.name}`)
        continue
      }
      const callterms = calltermSet(station, s)
      if (callterms instanceof Error) {
        skip(callterms.message)
        continue
      }
      if ((s.maxDepth ?? DEFAULT_MAX_DEPTH) !== DEFAULT_MAX_DEPTH) {
        skip(`maxDepth ${s.maxDepth} needs a domain translated with --call-frame-capacity`)
        continue
      }
      const args = atomsText(s.args ?? [])
      if (args instanceof Error) {
        skip(`arguments: ${args.message}`)
        continue
      }
      const prepare = () => {
        const world = new WorldState()
        s.setup(world)
        const host = s.context?.(world) ?? station.host?.(world) ?? { world }
        return { world, host }
      }
      const { world, host } = prepare()
      // Host values a lab case gives its callterms (HostContext.vars): the driver binds upstream's defaults only.
      const vars = (host as { vars?: Record<string, unknown> }).vars
      if (vars && Object.keys(vars).length > 0) {
        skip(`host values ${Object.keys(vars).join(", ")} are not in the driver`)
        continue
      }
      const text = worldText(world)
      if (text instanceof Error) {
        skip(`world: ${text.message}`)
        continue
      }
      const modes = station.modes ? MODES.map(m => m.name as ModeName) : [modeName(s.mode)]
      for (const mode of modes) {
        const base = [station.id, slug(s.name), ...(station.modes || mode !== 'ALL' ? [mode] : [])].join('__')
        // Lab cases may share a name (one per upstream assertion): number the repeats.
        let id = base
        for (let n = 2; cases.some(c => c.id === id); n++) id = `${base}__${n}`
        cases.push({
          id,
          station: station.id,
          scenario: s.name,
          domain: sourceRef(source),
          worldstate:
            text === '' ? '-' : worlds.has(text) ? closest(worlds.get(text)!, source) : `scene:${GOLDEN_DIR}/worlds/${id}.worldstate`,
          worldText: text,
          method: s.method,
          args: args === '' ? '-' : args,
          mode,
          callterms,
          ours: () => {
            const { world, host } = prepare()
            const calltermErrors: string[] = []
            const r = decompose(domain, world, s.method, s.args ?? [], {
              callterms: s.callterms ?? galleryCallterms,
              calltermErrorPolicy: 'report',
              onDiagnostic: d => void (d.calltermError && calltermErrors.push(`${d.calltermError.name} ${d.calltermError.reason}`)),
              context: host,
              mode: MODES.find(m => m.name === mode)!.mode,
              maxDepth: s.maxDepth
            })
            return { status: r.status, steps: r.plan.map(p => formatTask(p.name, p.args)), calltermErrors }
          }
        })
      }
    }
  }
  return { cases, uncovered }
}

// ---- manifest and golden files ------------------------------------------------------------------------------------

export const MANIFEST_COLUMNS = ['id', 'domain', 'worldstate', 'method', 'args', 'mode', 'callterms'] as const

export const manifestLine = (c: GoldenCase) => MANIFEST_COLUMNS.map(k => c[k]).join('\t')

/** The golden file of a station: one block per case, inputs then upstream's status and plan. */
export const goldenFile = (station: string) => `${GOLDEN_DIR}/${station}.golden.txt`

export function goldenHeader(station: string): string {
  return [
    `# Upstream reference plans for the ${station} station: urosidoki/htn_planner@${UPSTREAM_COMMIT},`,
    '# its generated planner (HTNTranslator --runtime-backtracking-support=enabled, Debug build) through HTNPlanningUnit.',
    '# Generated by npm run htn:golden (tools/upstream-golden/). Do not edit by hand.',
    ''
  ].join('\n')
}

export function goldenBlock(c: GoldenCase, driverLines: string[]): string {
  const inputs = MANIFEST_COLUMNS.filter(k => k !== 'id').map(k => `${k}: ${c[k]}`)
  return [`=== ${c.id}`, `scenario: ${c.scenario}`, ...inputs, ...driverLines, ''].join('\n')
}

/** Blocks of a golden file by case id. */
export function parseGolden(text: string): Map<string, GoldenPlan> {
  const out = new Map<string, GoldenPlan>()
  let current: GoldenPlan | null = null
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('=== ')) {
      current = { inputs: {}, status: '', steps: [], calltermErrors: [] }
      out.set(line.slice(4), current)
    } else if (!current || line === '') continue
    else if (line.startsWith('# callterm error: ')) current.calltermErrors.push(line.slice(18))
    else if (line.startsWith('#')) continue
    else if (line.startsWith('status: ')) current.status = line.slice(8)
    else if (!current.status && /^[a-z]+: /.test(line)) {
      const colon = line.indexOf(': ')
      current.inputs[line.slice(0, colon)] = line.slice(colon + 2)
    } else if (current.status) current.steps.push(line)
  }
  return out
}
