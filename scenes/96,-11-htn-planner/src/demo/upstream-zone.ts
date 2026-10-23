// The reference zones, each a spawnable playground (zonePlayground): the upstream gallery, one pad per upstream
// example domain (src/examples/upstream/gallery), and the language lab, one pad per language topic
// (src/examples/upstream/lab.ts). A capsule runs the plan with
// generic executors: a timed step, or a walk to a named waypoint when the primitive moves. The plan repeats after
// a pause; Scenario > swaps the world state, Domain > jumps to the next domain, Mode > the backtracking mode.
// By default every station plays itself: after two runs of a plan it moves on to the next scenario (Auto button).
// A station host may time the steps and hear them finish (the Wanderer's world, after upstream's demo agent); a host
// that keeps its NPC going counts journeys, and Auto waits for two of them.
// A hot reload station (GalleryStation.reloads) has Reload > instead: it swaps the domain on the same world and host,
// and by itself does so in the middle of a walk.
// Every station is a host of the HTN debugger (src/debugger/registry.ts): it keeps its planning metrics and an event
// history, and plans with a trace recorder while the debugger is open (debugRegistry.tracing).
import { engine, Entity, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { expectedStatus, galleryCallterms, GalleryStation, MODES, reported, StationHost } from '../examples/upstream/stations'
import { agentHistory, Atom, DecompositionStatus, DomainIR, formatTask, PlanRunner, PlanTraceRecorder, Vec3, WorldState } from '../htn-planner'
import { newPlanningMetrics } from '../htn-planner'
import type { AgentHistory, PlanningMetrics } from '../htn-planner'
import type { Built, Playground } from '../spawn/spawner'
import { Frame, toLocal, toScene } from '../spawn/frame'
import { debugRegistry, DebugHost, MapActor, MapProp } from '../debugger/registry'
import { pickable } from '../debugger/pick'
import { button, floor, paint, Rgb, setText, sign } from './world'

const STEP_SECONDS = 1
const PAUSE_SECONDS = 1.5
const SPEED = 2.5 // m/s
const MOVES = /move|follow|retreat|advance|sprint|walk/
const AUTO_RUNS = 2 // runs of a plan (or journeys) before the station moves on by itself
const AUTO_LOOP_PLANS = 8 // a host counting journeys moves on after this many plans without them (e.g. a failed path)
/** The station's NPC: a cylinder torso to 1.3 m and a head on it (top at 1.78 m); its own label is the pad's sign, at
 *  4.2 m over the pad's centre, not on the NPC. */
const TORSO = { y: 0.65, height: 1.3 }
const HEAD = { y: 1.55, size: 0.45 }
/** The in-world overlay's label: just above the head, under the pad's sign when the NPC stands at its centre. */
const OVERLAY_HEIGHT = HEAD.y + HEAD.size / 2 + 0.25
const COLORS: Record<'idle' | 'step' | 'move' | 'none', Rgb> = {
  idle: { r: 0.3, g: 0.6, b: 0.4 },
  step: { r: 0.95, g: 0.65, b: 0.1 },
  move: { r: 0.2, g: 0.55, b: 0.95 },
  none: { r: 0.85, g: 0.15, b: 0.1 }
}

interface Step {
  name: string
  args: readonly Atom[]
  left: number
  target?: Vec3
  /** Timed by the host: its seconds and where the walk started. */
  total?: number
  from?: Vec3
}

export class StationRunner {
  private scenario = 0
  private mode = 0
  private world = new WorldState()
  private host: StationHost = { world: this.world }
  private runner!: PlanRunner
  private status: DecompositionStatus | '' = ''
  private planLength = 0
  private step: Step | null = null
  private pause = 0
  private runs = 0
  /** The first plan of the scenario against its expectation (later runs see the world the steps changed). Read by tests. */
  verdict = ''
  /** The running step, formatted; empty between steps. Read by tests. */
  running = ''
  /** Move on to the next scenario after AUTO_RUNS runs. */
  auto = true
  /** Hot reload: domain swaps so far, the active revision, what the last swap said. Read by tests. */
  reloads = 0
  active = ''
  reloadNote = ''
  private reloadIndex = 0
  private reloadMarker: string | null = null
  /** The debugger's: a recorder while it is open, the station's clock, history and planner metrics. */
  private trace: PlanTraceRecorder | null = null
  private time = 0
  private reason = 'scenario'
  readonly history: AgentHistory = agentHistory(128)
  readonly metrics: PlanningMetrics = newPlanningMetrics()
  private readonly doneSteps: string[] = []
  readonly debug: DebugHost
  private position: Vec3
  private yaw = Math.PI
  private readonly root: Entity
  private readonly torso: Entity
  private readonly label: Entity
  private readonly waypoints = new Map<string, Vec3>()
  private color = ''

  constructor(readonly station: GalleryStation, private readonly center: Vec3, private readonly parent: Entity, zone = 'zone', frame?: Frame) {
    this.position = { ...center }
    this.root = engine.addEntity()
    Transform.create(this.root, { parent })
    this.torso = engine.addEntity()
    Transform.create(this.torso, { parent: this.root, position: { x: 0, y: TORSO.y, z: 0 }, scale: { x: 0.6, y: TORSO.height, z: 0.6 } })
    MeshRenderer.setCylinder(this.torso)
    const head = engine.addEntity()
    Transform.create(head, { parent: this.root, position: { x: 0, y: HEAD.y, z: 0 }, scale: { x: HEAD.size, y: HEAD.size, z: HEAD.size } })
    MeshRenderer.setSphere(head)
    paint(head, { r: 0.85, g: 0.85, b: 0.8 })
    const nose = engine.addEntity()
    Transform.create(nose, { parent: this.root, position: { x: 0, y: HEAD.y, z: 0.25 }, scale: { x: 0.12, y: 0.12, z: 0.2 } })
    MeshRenderer.setBox(nose)
    this.label = sign(Vector3.create(center.x, 4.2, center.z + 0.3), '', { size: 1.2, billboard: true, parent })
    this.debug = this.debugHost(`${zone}:${station.id}`, frame)
    pickable(this.torso, this.debug.id, station.title)
    this.load()
  }

  private debugHost(id: string, frame: Frame | undefined): DebugHost {
    const self = this
    return {
      id,
      label: this.station.title,
      group: id.split(':')[0],
      get domain() {
        return self.runner.domain
      },
      get recorder() {
        return self.trace
      },
      get world() {
        return self.world
      },
      history: this.history,
      metrics: this.metrics,
      entity: this.torso,
      overlayHeight: OVERLAY_HEIGHT,
      position: () => (frame ? toScene(frame, this.position) : this.position),
      pose: () => ({ position: this.position, yaw: this.yaw, target: this.step?.target, route: this.route() }),
      // Drop the running step and plan the scenario again from here.
      replan: reason => {
        this.step = null
        this.running = ''
        this.reason = reason
        this.replan()
      },
      status: () => ({
        state: this.status !== 'succeeded' ? 'no plan' : !this.step ? 'idle' : this.step.target ? 'walk' : 'step',
        lastStatus: this.status,
        reason: this.reason,
        current: this.running,
        steps: this.runner.steps.map(p => formatTask(p.name, p.args)),
        done: this.doneSteps
      })
    }
  }

  /** Attach a recorder while the debugger is open, drop it when it closes (planning costs x5-9 with one). */
  private syncTracing() {
    const domain = this.runner.domain
    const want = debugRegistry.tracing
    if (want && this.trace?.domain !== domain) {
      this.trace = new PlanTraceRecorder(domain, { keep: 32, time: () => this.time })
      this.runner = this.makeRunner(domain)
    } else if (!want && this.trace) {
      this.trace = null
      this.runner = this.makeRunner(domain)
    }
  }

  nextScenario() {
    this.scenario = (this.scenario + 1) % this.station.scenarios.length
    this.reason = 'next scenario'
    this.load()
  }

  /** The first scenario of the next group (domain). */
  nextGroup() {
    const all = this.station.scenarios
    const group = all[this.scenario].group
    let i = this.scenario
    do i = (i + 1) % all.length
    while (i !== this.scenario && all[i].group === group)
    this.scenario = i
    this.reason = 'next domain'
    this.load()
  }

  nextMode() {
    this.mode = (this.mode + 1) % MODES.length
    this.reason = `mode ${MODES[this.mode].name}`
    this.load()
  }

  private load() {
    const s = this.station.scenarios[this.scenario]
    this.world = new WorldState()
    s.setup(this.world)
    this.host = s.context?.(this.world) ?? this.station.host?.(this.world) ?? { world: this.world }
    const domain = s.domain ?? this.station.domain
    this.trace = null // a new world: its revisions start again, so must the recorder's snapshot per revision
    this.runner = this.makeRunner(domain)
    this.active = this.station.reloads?.find(r => r.domain === domain)?.name ?? domain.name
    this.reloads = this.reloadIndex = 0
    this.reloadNote = ''
    this.reloadMarker = null
    this.position = { ...this.center }
    this.step = null
    this.running = ''
    this.runs = 0
    this.replan()
  }

  private makeRunner(domain: DomainIR): PlanRunner {
    const s = this.station.scenarios[this.scenario]
    return new PlanRunner(domain, this.world, {
      callterms: s.callterms ?? galleryCallterms,
      calltermErrorPolicy: 'report', // as upstream's demo host (AIHTNDemoWandererAgent.cpp:136)
      context: this.host,
      mode: s.mode ?? MODES[this.mode].mode,
      maxDepth: s.maxDepth,
      trace: this.trace ?? undefined,
      onDiagnostic: d => {
        if (reported(s, d)) console.log(`[htn ${this.station.id}] ${d.code}: ${d.message}`)
      }
    })
  }

  /**
   * Hot reload: the next of the station's reloads. A compiled one replaces the planner on the same world and host,
   * drops the running step and plans again; a broken one leaves the active domain running.
   */
  reload() {
    const all = this.station.reloads
    if (!all?.length) return
    const r = all[this.reloadIndex++ % all.length]
    this.reloads++
    this.runs = 0
    if (!r.domain) {
      this.reloadNote = `${r.name}: compile failed, rev ${this.active} stays\n${r.error ?? ''}`
      return
    }
    this.trace = null
    this.runner = this.makeRunner(r.domain)
    this.step = null
    this.running = ''
    this.active = r.name
    this.reason = `reload ${r.name}`
    this.reloadMarker = r.marker ?? null
    this.reloadNote = `rev ${r.name} loaded; world kept: ${this.station.keeps?.(this.world) ?? 'yes'}`
    this.replan()
  }

  private replan() {
    const s = this.station.scenarios[this.scenario]
    this.syncTracing()
    const started = Date.now()
    this.status = this.runner.plan(s.method, s.args ?? [])
    const ms = Date.now() - started
    const m = this.metrics
    m.lastPlanMs = ms
    m.totalPlanMs += ms
    m.maxPlanMs = Math.max(m.maxPlanMs, ms)
    m.plansMade++
    this.planLength = this.runner.steps.length
    const plan = this.runner.steps.map(p => formatTask(p.name, p.args))
    this.history.push({
      t: this.time,
      event: { type: 'replan', guard: this.debug.id, reason: this.reason, status: this.status, plan, kept: false, passes: 1 }
    })
    this.reason = 'plan ended'
    ++this.runs
    if (this.reloadMarker) {
      // Right after a reload: the plan must come from the new domain.
      this.verdict = this.status === 'succeeded' && plan.includes(this.reloadMarker) ? 'as expected' : 'NOT AS EXPECTED'
      this.reloadMarker = null
    } else if (this.runs === 1) {
      const same = this.status === expectedStatus(s) && (s.expect === null || JSON.stringify(plan) === JSON.stringify(s.expect))
      this.verdict = same ? 'as expected' : 'NOT AS EXPECTED'
    }
    this.pause = 0
  }

  update(dt: number) {
    this.time += dt
    this.host.update?.(dt)
    // A hot reload station reloads by itself while walking, as the upstream self-test does.
    if (this.auto && this.station.reloads && this.runs >= AUTO_RUNS && this.step?.target) this.reload()
    if (this.step) this.advance(dt)
    else if (this.pause > 0) {
      this.pause -= dt
      if (this.pause <= 0) {
        if (this.auto && this.done() && this.station.scenarios.length > 1) this.nextScenario()
        else this.replan()
      }
    } else {
      const r = this.runner.resolve()
      if (r === 'ready') this.start()
      else this.pause = PAUSE_SECONDS
    }
    this.render()
  }

  /** Enough runs (or journeys) of this scenario for Auto. */
  private done(): boolean {
    const journeys = this.host.journeys
    return journeys === undefined ? this.runs >= AUTO_RUNS : journeys >= AUTO_RUNS || this.runs >= AUTO_LOOP_PLANS
  }

  private start() {
    const step = this.runner.current()!
    const target = this.targetOf(step.name, step.args)
    const total = this.host.duration?.(step.name, step.args)
    this.step = { name: step.name, args: step.args, left: total ?? STEP_SECONDS, target, total, from: { ...this.position } }
    this.running = formatTask(step.name, step.args)
    this.history.push({ t: this.time, event: { type: 'step', guard: this.debug.id, name: step.name, args: step.args } })
  }

  private advance(dt: number) {
    const step = this.step!
    if (step.total !== undefined) {
      // Timed by the host: the walk spreads over the step's seconds.
      step.left -= dt
      const { from, target: to } = step
      if (to && from) {
        const k = step.total > 0 ? Math.min(1, Math.max(0, 1 - step.left / step.total)) : 1
        this.position = { x: from.x + (to.x - from.x) * k, y: 0, z: from.z + (to.z - from.z) * k }
        if (to.x !== from.x || to.z !== from.z) this.yaw = Math.atan2(to.x - from.x, to.z - from.z)
      }
      if (step.left > 0) return
      this.finish(step)
      return
    }
    if (step.target) {
      const dx = step.target.x - this.position.x
      const dz = step.target.z - this.position.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d > 0.05) {
        const k = Math.min(1, (SPEED * dt) / d)
        this.position = { x: this.position.x + dx * k, y: 0, z: this.position.z + dz * k }
        this.yaw = Math.atan2(dx, dz)
        return
      }
      step.target = undefined
      step.left = 0.3
    }
    step.left -= dt
    if (step.left > 0) return
    this.finish(step)
  }

  private finish(step: Step) {
    this.station.effects?.[step.name]?.(step.args, this.world)
    this.host.complete?.(step.name, step.args)
    this.runner.complete()
    this.metrics.tasksCompleted++
    this.history.push({ t: this.time, event: { type: 'step_end', guard: this.debug.id, name: step.name, status: 'done' } })
    this.doneSteps.push(this.running)
    if (this.doneSteps.length > 6) this.doneSteps.shift()
    this.step = null
    this.running = ''
  }

  /** Where the rest of the plan goes, for the debugger's map: the steps whose target is known (none is created). */
  private route(): Vec3[] {
    const out: Vec3[] = []
    for (const s of this.runner.steps) {
      const p = this.targetOf(s.name, s.args, false)
      if (p) out.push(p)
    }
    return out
  }

  /** The waypoints placed so far, as props on the debugger's map. */
  mapProps(): MapProp[] {
    return [...this.waypoints].map(([name, p]) => ({ id: `${this.debug.id}:${name}`, x: p.x, z: p.z, w: 0.4, d: 0.4, color: '#E6E64D', label: name }))
  }

  /**
   * Where a moving primitive goes: Wanderer's (x z) cells, else a waypoint named by its last string argument.
   * `place` false: an unplaced waypoint stays unplaced (undefined).
   */
  private targetOf(name: string, args: readonly Atom[], place = true): Vec3 | undefined {
    if (!MOVES.test(name)) return undefined
    const cell = args.find(a => a.t === 'list' && a.v.length === 2)
    if (cell && cell.t === 'list') {
      const x = Number(cell.v[0].v)
      const z = Number(cell.v[1].v)
      return { x: this.center.x - 4 + x * 0.5, y: 0, z: this.center.z - 2.5 + z * 0.4 }
    }
    const names = args.filter(a => a.t === 'str' || (a.t === 'sym' && name !== '!switch_weapon'))
    const last = names[names.length - 1]
    if (!last) return undefined
    return place ? this.waypoint(String(last.v)) : this.waypoints.get(String(last.v))
  }

  private waypoint(name: string): Vec3 {
    const known = this.waypoints.get(name)
    if (known) return known
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    const angle = ((h % 360) * Math.PI) / 180
    const p = { x: this.center.x + Math.sin(angle) * 4, y: 0, z: this.center.z + Math.cos(angle) * 2.5 }
    this.waypoints.set(name, p)
    floor(Vector3.create(p.x, 0, p.z), 0.4, 0.4, { r: 0.9, g: 0.9, b: 0.3 }, this.parent)
    sign(Vector3.create(p.x, 0.5, p.z), name, { size: 1, billboard: true, parent: this.parent })
    return p
  }

  private render() {
    const t = Transform.getMutable(this.root)
    t.position = { x: this.position.x, y: 0, z: this.position.z }
    t.rotation = Quaternion.fromEulerDegrees(0, (this.yaw * 180) / Math.PI, 0)
    const kind = this.status !== 'succeeded' ? 'none' : !this.step ? 'idle' : this.step.target ? 'move' : 'step'
    if (kind !== this.color) {
      this.color = kind
      paint(this.torso, COLORS[kind], 0.6)
    }
    setText(this.label, this.describe())
  }

  private describe(): string {
    const s = this.station.scenarios[this.scenario]
    const n = this.station.scenarios.length
    const name = s.name.length > 56 ? s.name.slice(0, 55) + '…' : s.name
    const head = [
      `${name}  (${this.scenario + 1}/${n})${this.station.modes ? `  mode ${MODES[this.mode].name}` : ''}`,
      `${s.method}: ${this.status} (${this.planLength} steps, run ${this.runs})  ${this.verdict === 'as expected' ? '<color=#7be37b>✓ as expected</color>' : '<color=#ff6b5e>× NOT AS EXPECTED</color>'}`
    ]
    const steps = this.runner.steps
    const lines = steps.slice(0, 5).map((p, i) => `${i === 0 && this.step ? '> ' : '  '}${formatTask(p.name, p.args)}`)
    if (steps.length > 5) lines.push(`  ... +${steps.length - 5}`)
    if (steps.length === 0) lines.push(this.pause > 0 ? '  (done, replanning)' : '  (empty)')
    if (this.station.reloads) {
      head.push(`<color=#c78bff>rev ${this.active} active, ${this.reloads} reloads</color>`)
      if (this.reloadNote) head.push(`<color=#c78bff>${this.reloadNote}</color>`)
    }
    return [...head, ...lines].join('\n')
  }
}

const COLUMNS = 5
const COLUMN_SPACING = 13 // m
const ROW_SPACING = 12 // m
const PAD = { x: 11.5, z: 9 }
const TITLE_DEPTH = 2.5 // m in front of the first row: the title and the Auto button

/** The zone's half extents for `n` stations. */
function footprint(n: number) {
  const columns = Math.min(n, COLUMNS)
  const rows = Math.ceil(n / COLUMNS)
  return { x: ((columns - 1) * COLUMN_SPACING + PAD.x) / 2, z: (TITLE_DEPTH + (rows - 1) * ROW_SPACING + PAD.z) / 2 }
}

export interface Zone extends Built {
  runners: StationRunner[]
}

/** The pads in rows of COLUMNS from the front, under `root` (local coordinates, the zone centre at 0). */
function buildZone(root: Entity, stations: GalleryStation[], title: string, id = 'zone', frame?: Frame): Zone {
  const half = footprint(stations.length)
  const columns = Math.min(stations.length, COLUMNS)
  const front = -half.z
  sign(Vector3.create(0, 3.4, front + 1), title, { size: 3, parent: root })
  const runners = stations.map((station, i) => {
    const cx = ((i % COLUMNS) - (columns - 1) / 2) * COLUMN_SPACING
    const cz = front + TITLE_DEPTH + PAD.z / 2 + Math.floor(i / COLUMNS) * ROW_SPACING
    floor(Vector3.create(cx, 0, cz), PAD.x, PAD.z, i % 2 ? { r: 0.17, g: 0.17, b: 0.24 } : { r: 0.2, g: 0.2, b: 0.28 }, root)
    sign(Vector3.create(cx, 6.2, cz + PAD.z / 2), `<b>${station.title}</b>
${station.blurb}`, { size: 2, parent: root })
    const runner = new StationRunner(station, { x: cx, y: 0, z: cz }, root, id, frame)
    const groups = new Set(station.scenarios.map(s => s.group)).size
    const second = station.reloads
      ? { label: 'Reload >', click: () => runner.reload() }
      : station.modes
      ? { label: 'Mode >', click: () => runner.nextMode() }
      : groups > 1
        ? { label: 'Domain >', click: () => runner.nextGroup() }
        : null
    const z = cz - PAD.z / 2 + 0.6
    if (second) {
      button(Vector3.create(cx - 2.2, 0, z), 'Scenario >', () => runner.nextScenario(), { r: 0.5, g: 0.3, b: 0.8 }, root)
      button(Vector3.create(cx + 2.2, 0, z), second.label, second.click, { r: 0.3, g: 0.6, b: 0.6 }, root)
    } else button(Vector3.create(cx, 0, z), 'Scenario >', () => runner.nextScenario(), { r: 0.5, g: 0.3, b: 0.8 }, root)
    return runner
  })
  button(Vector3.create(-half.x + 1, 0, front + 1), 'Auto: on/off', () => {
    const on = !runners[0].auto
    for (const r of runners) r.auto = on
  }, { r: 0.6, g: 0.6, b: 0.6 }, root)
  // The zone on the debugger's map: the pads with their titles, the waypoints placed so far, the player.
  const pads: MapProp[] = runners.map((r, i) => {
    const cx = ((i % COLUMNS) - (columns - 1) / 2) * COLUMN_SPACING
    const cz = front + TITLE_DEPTH + PAD.z / 2 + Math.floor(i / COLUMNS) * ROW_SPACING
    return { id: `pad-${i}`, x: cx, z: cz, w: PAD.x, d: PAD.z, color: i % 2 ? '#2B2B3D' : '#333347', label: r.station.title }
  })
  const actors = (): MapActor[] => {
    const t = Transform.getOrNull(engine.PlayerEntity)
    if (!t) return []
    const p = frame ? toLocal(frame, t.position) : t.position
    return Math.abs(p.x) <= half.x + 2 && Math.abs(p.z) <= half.z + 2 ? [{ id: 'you', label: 'you', kind: 'player', position: p }] : []
  }
  const area = { label: id, half, props: () => [...pads, ...runners.flatMap(r => r.mapProps())], actors, toScene: (p: Vec3) => (frame ? toScene(frame, p) : p) }
  const release = debugRegistry.add(() => runners.map(r => r.debug), area)
  return {
    runners,
    update: dt => {
      for (const r of runners) r.update(dt)
    },
    dispose: release
  }
}

/** A reference zone as a spawnable playground. */
export function zonePlayground(id: string, label: string, stations: GalleryStation[], title: string): Playground {
  return { id, label, half: footprint(stations.length), build: (root, frame) => buildZone(root, stations, title, id, frame) }
}
