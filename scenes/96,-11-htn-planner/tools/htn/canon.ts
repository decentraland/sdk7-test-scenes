// The canonical examples' catalogue (src/examples/canon), read from disk: one station per `worlds/<stem>/` folder of
// an example, whose domain is `<example>/<stem>.domain` and whose scenarios are the .worldstate files in it (sorted;
// the file stem is the scenario's name). A scenario's header says how to plan it and what it must give:
//   // <what it shows>
//   // method: <top-level method> [args...]
//   // expect: succeeded              (or no_plan; succeeded with no steps: the empty plan)
//   //   1. !first_step arg
//   //   2. &deferred_step arg
// The stories (src/examples/canon/index.ts, CANON_STORIES) belong to stations by name. Used by `npm run htn:run`
// (--list, --world <station>/<scenario>, --story <station>/<story>) and the tests (test/examples/canon/). Problems
// (a missing domain, a compile error, a bad header) are returned, not thrown. Node only.
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import type { Atom } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import type { DecompositionStatus } from '../../src/htn-planner/htn/planner'
import type { DebugSession } from '../../src/htn-planner/debug/session'
import type { GalleryScenario, GalleryStation } from '../../src/examples/upstream/stations'
import { worldSlug } from '../../src/debugger/runner'
import { CANON_STORIES } from '../../src/examples/canon'
import { Stage, type Story } from '../../src/examples/canon/paper'
import { compileDomainFile, formatDiagnostic, parseWorldState } from './compiler'
import { loadWorldInvariants, type WorldInvariants } from './world-invariants'

export const CANON_DIR = 'src/examples/canon'

export interface CanonScenario extends GalleryScenario {
  /** Scene-relative path of the .worldstate file. */
  file: string
  args: Atom[]
  expect: string[]
  status: DecompositionStatus
}

export interface CanonStation extends GalleryStation {
  /** The example folder (`bridge_troll`). */
  example: string
  /** Scene-relative path of the .domain file. */
  file: string
  /** Compile warnings, formatted (a clean example has none). */
  warnings: string[]
  scenarios: CanonScenario[]
  stories: Story[]
  invariants?: WorldInvariants
}

export interface Canon {
  stations: CanonStation[]
  problems: string[]
}

const repoRoot = () => process.env.HTN_REPO_ROOT ?? process.cwd()
const slashes = (p: string) => p.split(nodePath.sep).join('/')
const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
const STATUSES = ['succeeded', 'no_plan', 'depth_exceeded', 'invalid_call']

/** The header of a scenario file: method, arguments, expected status and plan; problems as text. */
export function readScenarioHeader(text: string): { method?: string; args: Atom[]; status?: DecompositionStatus; plan: string[]; problems: string[] } {
  const problems: string[] = []
  let method: string | undefined
  let args: Atom[] = []
  let status: DecompositionStatus | undefined
  const plan: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\/\/ method: (.+)$/.exec(line)
    if (m) {
      const w = new WorldState()
      try {
        parseWorldState(m[1], w)
        const key = w.tableKeys()[0]
        method = key?.slice(0, key.lastIndexOf('/'))
        args = key ? [...w.rows(method!, Number(key.slice(key.lastIndexOf('/') + 1)))[0]] : []
      } catch (e) {
        problems.push(`method line: ${(e as Error).message}`)
      }
    }
    const e = /^\/\/ expect: (\S+)\s*$/.exec(line)
    if (e) {
      if (STATUSES.includes(e[1])) status = e[1] as DecompositionStatus
      else problems.push(`unknown status '${e[1]}' (${STATUSES.join(', ')})`)
    }
    const s = /^\/\/ {3}(\d+)\. (.+?)\s*$/.exec(line)
    if (s && status !== undefined) {
      if (Number(s[1]) !== plan.length + 1) problems.push(`expected steps are numbered 1, 2, ...: got ${s[1]}`)
      plan.push(s[2])
    }
  }
  if (method === undefined) problems.push(`no '// method: <name> [args...]' line`)
  if (status === undefined) problems.push(`no '// expect: <status>' line`)
  return { method, args, status, plan, problems }
}

function loadScenario(root: string, file: string, problems: string[]): CanonScenario | undefined {
  const text = fs.readFileSync(nodePath.join(root, file), 'utf8')
  const header = readScenarioHeader(text)
  for (const p of header.problems) problems.push(`${file}: ${p}`)
  const world = new WorldState()
  try {
    parseWorldState(text, world)
  } catch (e) {
    problems.push(`${file}: ${(e as Error).message}`)
    return undefined
  }
  if (header.method === undefined || header.status === undefined) return undefined
  const rows: [string, readonly Atom[]][] = []
  for (const key of world.tableKeys()) {
    const at = key.lastIndexOf('/')
    for (const r of world.rows(key.slice(0, at), Number(key.slice(at + 1)))) rows.push([key.slice(0, at), r])
  }
  return {
    name: nodePath.basename(file, '.worldstate'),
    file,
    method: header.method,
    args: header.args,
    expect: header.plan,
    status: header.status,
    setup: w => {
      for (const [name, args] of rows) w.add(name, ...args)
    }
  }
}

/** The first comment line of a domain file, without its `<stem>:` prefix: the station's blurb. */
function blurbOf(text: string): string {
  const line = /^\/\/ ?(.*)$/m.exec(text)?.[1] ?? ''
  return line.replace(/^[\w-]+: /, '')
}

/** Read every example under src/examples/canon: stations, scenarios, and the stories by station. */
export function loadCanon(root = repoRoot()): Canon {
  const problems: string[] = []
  const stations: CanonStation[] = []
  const dir = nodePath.join(root, CANON_DIR)
  for (const example of fs.readdirSync(dir).sort(byName)) {
    const worlds = nodePath.join(dir, example, 'worlds')
    if (!fs.statSync(nodePath.join(dir, example)).isDirectory() || !fs.existsSync(worlds)) continue
    for (const stem of fs.readdirSync(worlds).sort(byName)) {
      const folder = nodePath.join(worlds, stem)
      if (!fs.statSync(folder).isDirectory()) {
        problems.push(`${slashes(nodePath.relative(root, folder))}: scenarios go in worlds/<domain stem>/`)
        continue
      }
      const file = `${CANON_DIR}/${example}/${stem}.domain`
      if (!fs.existsSync(nodePath.join(root, file))) {
        problems.push(`${CANON_DIR}/${example}/worlds/${stem}/: no ${file} for these scenarios`)
        continue
      }
      const compiled = compileDomainFile(nodePath.join(root, file))
      const diagnostics = compiled.diagnostics.map(formatDiagnostic)
      if (!compiled.ok) {
        problems.push(`${file}: does not compile: ${diagnostics.join(' | ')}`)
        continue
      }
      let invariants: WorldInvariants | undefined
      try { invariants = loadWorldInvariants(nodePath.join(root, file)) }
      catch (e) { problems.push(`${file}: ${(e as Error).message}`); continue }
      const scenarios: CanonScenario[] = []
      for (const name of fs.readdirSync(folder).sort(byName)) {
        if (!name.endsWith('.worldstate')) continue
        const s = loadScenario(root, `${CANON_DIR}/${example}/worlds/${stem}/${name}`, problems)
        if (s) {
          try {
            const w = new WorldState()
            s.setup(w)
            invariants?.assert(w, s.file)
            scenarios.push(s)
          } catch (e) { problems.push((e as Error).message) }
        }
      }
      stations.push({
        id: stem,
        example,
        file,
        title: `${example}/${stem}`,
        blurb: blurbOf(fs.readFileSync(nodePath.join(root, file), 'utf8')),
        domain: compiled.ir,
        warnings: diagnostics,
        scenarios,
        stories: [],
        invariants
      })
    }
  }
  const ids = new Set<string>()
  for (const s of stations) {
    if (ids.has(s.id)) problems.push(`two stations named '${s.id}' (domain stems must be unique across the examples)`)
    ids.add(s.id)
  }
  const storyIds = new Set<string>()
  for (const story of CANON_STORIES) {
    const station = stations.find(s => s.id === story.station)
    if (!station) {
      problems.push(`story '${story.name}': no station '${story.station}'`)
      continue
    }
    const id = storyId(story)
    if (storyIds.has(id)) problems.push(`two stories with the id '${id}'`)
    storyIds.add(id)
    station.stories.push(story)
  }
  return { stations, problems }
}

/** A story's id for `--story`: `<station>/<name>` as a shell takes it unquoted. */
export const storyId = (story: Story): string => worldSlug(`${story.station}/${story.name}`)

/** A story by its id (or `<station>/<name>` as written). */
export function findStory(canon: Canon, id: string): Story | undefined {
  const all = canon.stations.flatMap(s => s.stories)
  return all.find(s => storyId(s) === id) ?? all.find(s => storyId(s) === worldSlug(id))
}

/** A fresh copy of a scenario's world. */
export function scenarioWorld(canon: Canon, station: string, name: string): WorldState | undefined {
  const s = canon.stations.find(x => x.id === station)?.scenarios.find(x => x.name === name)
  if (s === undefined) return undefined
  const w = new WorldState()
  s.setup(w)
  return w
}

export interface StoryRun {
  trace: string[]
  stage: Stage
  /** With `record`: the story as a DebugSession (htn:view). */
  session?: DebugSession
}

/** Play a story on a fresh stage. */
export function playStory(canon: Canon, story: Story, record = false): StoryRun {
  const domains = new Map<string, DomainIR>(canon.stations.map(s => [s.id, s.domain]))
  const stage = new Stage(story, {
    domain: id => domains.get(id),
    scenario: (station, name) => scenarioWorld(canon, station, name),
    record,
    validate: (station, world, agent) => canon.stations.find(s => s.id === station)?.invariants?.assert(world, `${storyId(story)} / ${agent}`)
  })
  story.play(stage)
  for (const agent of stage.agents) agent.validateWorld()
  return { trace: stage.trace, stage, session: stage.session() }
}
