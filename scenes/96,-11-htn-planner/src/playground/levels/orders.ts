// Level 11: a squad planner gives the orders (GuardSquadOptions.squad, upstream docs/USE_CASES.md section 4). One
// planner (src/examples/squad/yard_squad.domain) reads a shared snapshot and hands each guard a role; each guard's own
// planner (yard_guard.domain) carries its role out. The guards run in a real GuardSquad without its own ECS system
// (`system: false`): the level ticks it with squad.update(dt), in the scene and headless alike. The station draws the
// bodies (capsules on the pad), so GuardSquad gets bodies that draw nothing.
// Its own ablation (docs/htn-level-metrics.md), `no_squad`: no squad planner; each guard orders itself (CALM_ROLES
// when calm, chase while it sees or remembers the intruder), so nobody takes a role over and nobody flanks.
import type { Entity } from '@dcl/sdk/ecs'
import { yardGuardDomain } from '../../examples/squad/yard_guard.htn'
import { yardSquadDomain } from '../../examples/squad/yard_squad.htn'
import {
  AgentHistory,
  agentHistory,
  formatAtom,
  GeometricLineOfSight,
  GuardAgent,
  GuardBody,
  GuardHandle,
  GuardSquad,
  list,
  NoiseEvent,
  plannerFor,
  PlanTraceRecorder,
  ReplanEvent,
  SquadDecision,
  sym,
  TargetSample,
  v3,
  vec3,
  Vec3,
  WorldState
} from '../../htn-planner'
import type { Ablation } from '../ablation'
import { act, AgentSetup, CrewMember, expect, LevelInfo, LevelPlanner, LevelSim, Marker, Post, TesterStep, unbuiltMember, wait, walk } from '../sim'
import { FENCE, GATE_POST, inYard, ROUTE, YARD_GATE, yardMarkers } from './guard-yard'
import { box, WOOD } from './props'

const REVERSED = [...ROUTE].reverse()
export { GATE_POST }
/** The point outside the gate the holder faces. */
const GATE_OUTSIDE = v3(-8, 0, -11)
export const BENCH = v3(8.5, 0, -6.5)
export const FLANK_POSTS: Record<string, Vec3> = { a: v3(-8, 0, -2), b: v3(-4, 0, -6), c: v3(-3.5, 0, -2.5) }
const PERCEPTION = { range: 14, fovDeg: 120, detectTime: 0.8 }

/** A guard as GuardSquad spawns it; the level's crew list follows this order (the squad's roster). */
const GUARDS: (Pick<AgentSetup, 'start' | 'route' | 'routeStart'> & { id: string })[] = [
  { id: 'a', route: ROUTE, start: { position: { ...GATE_POST }, yaw: Math.PI } },
  { id: 'b', route: ROUTE, start: { position: { ...ROUTE[0] }, yaw: Math.PI / 2 } },
  { id: 'c', route: REVERSED, routeStart: 1, start: { position: { ...REVERSED[1] }, yaw: Math.PI } }
]

/** The station draws the guards; GuardSquad writes their poses into nothing. */
function noBody(): GuardBody {
  return { entity: 0 as Entity, ownEntities: [], write() {}, setMode() {}, dispose() {} }
}

export type Role = 'chase' | 'hold' | 'flank' | 'patrol' | 'none'

/** The roles the squad gives when calm and everyone is available: what each guard keeps without one (no_squad). */
export const CALM_ROLES: Record<string, Role> = { a: 'hold', b: 'patrol', c: 'patrol' }

/** The guard branch that carries a role out. */
const ROLE_BRANCHES: Record<Role, string[]> = {
  chase: ['chase', 'search'],
  hold: ['hold'],
  flank: ['flank'],
  patrol: ['patrol'],
  none: ['off_duty']
}

export class OrdersLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'orders',
    number: 11,
    title: 'A squad planner gives the orders',
    source: 'squad/yard_squad.domain',
    lesson: [
      'One squad planner reads a snapshot and orders each guard a role;',
      'calm: one holds the gate, the others patrol. You are seen: the',
      'spotter chases, the next holds the gate, the third flanks.',
      'A guard on a break gets no order: the next one takes its role.'
    ],
    watch: 'the SQUAD line on the board; each guard\'s branch over its head'
  }
  boardScale = 0.7
  branchColors: Record<string, string> = {
    chase: '#ff6b5e',
    search: '#c78bff',
    hold: '#ffb14a',
    flank: '#56d8e6',
    patrol: '#7be37b',
    off_duty: '#8a8a8a'
  }
  squad: GuardSquad | null = null
  /** Guards on a break: not available in the snapshot. */
  readonly onBreak = new Set<string>()
  /** Squad decisions since the level was built, the newest last. */
  decisions: SquadDecision[] = []
  private squadTrace: PlanTraceRecorder | null = null
  /** The squad's decisions as `replan` events of agent 'squad' on the level's clock (a timeline reads them). */
  private squadHistory: AgentHistory = agentHistory(this.historySize)
  /** Without a squad planner (no_squad): the order each guard gave itself last. */
  private readonly selfOrders = new Map<string, Role>()

  spots() {
    return { exit: v3(-12.5, 0, -10.5), gate: v3(-8, 0, -10), inside: v3(-5, 0, -3) }
  }
  /** Unused: the guards are built by buildAgent (a GuardSquad). */
  protected agentSetup(): AgentSetup {
    return { domain: yardGuardDomain, start: GUARDS[0].start }
  }
  protected playerVisible(p: Vec3) {
    return inYard(p)
  }
  protected testerVisible() {
    return inYard(this.tester.position)
  }
  protected testerStart() {
    return v3(-12.5, 0, -10.5)
  }

  /** The guards as one GuardSquad with a squad planner; each keeps its own trace and history for the board. */
  protected buildAgent(): void {
    this.retire()
    this.squad?.despawn()
    this.decisions = []
    const squadTrace = new PlanTraceRecorder(yardSquadDomain, { keep: this.traceKeep, time: () => this.time })
    this.squadTrace = squadTrace
    this.squadHistory = agentHistory(this.historySize)
    this.selfOrders.clear()
    const commander = !this.ablated('no_squad')
    const members = new Map<string, ReturnType<typeof unbuiltMember>>()
    for (const g of GUARDS) {
      const trace: PlanTraceRecorder = new PlanTraceRecorder(yardGuardDomain, { keep: this.traceKeep, time: () => member.agent?.time ?? 0 })
      const member = unbuiltMember(g.id, 'capsule', trace, agentHistory(this.historySize))
      member.spawnedAt = this.time
      // yard_guard.domain's behaviour branch names (ROLE_BRANCHES) are one level below its root (the pursue tier, the
      // shared walk_patrol).
      member.chosenDepth = 2
      members.set(g.id, member)
    }
    const squad = new GuardSquad({
      // The factory is told which guard it builds for: each guard records into its own trace.
      planner: (world, guard) => plannerFor(yardGuardDomain, this.plannerOptions(members.get(guard.id)!.trace))(world),
      lineOfSight: new GeometricLineOfSight([]),
      targets: () => this.targetsNow,
      noise: null,
      perception: PERCEPTION,
      // The level's own loop ticks the squad (tickCrew), so the squad adds no ECS system.
      system: false,
      history: guard => members.get(guard.id)?.history,
      onEvent: e => {
        const m = members.get(e.guard)
        if (m?.agent !== undefined) this.onEvent(e, m as CrewMember)
      },
      // An ablation's facts: no_memory forgets (after the orders), no_squad gives each guard its own order.
      syncFacts: !commander ? a => this.selfOrder(a) : this.ablation === 'no_memory' ? a => this.sensed(a) : undefined,
      squad: commander
        ? {
            planner: plannerFor(yardSquadDomain, this.plannerOptions(squadTrace)),
            topLevel: 'assign_roles',
            snapshot: (world, guards) => this.snapshot(world, guards),
            onDecision: d => this.decided(d)
          }
        : undefined
    })
    squad.spawn(GUARDS.map(g => ({ id: g.id, route: g.route ?? [], routeStart: g.routeStart, start: g.start, body: noBody })))
    for (const h of squad.guards) {
      const member = members.get(h.spec.id)!
      member.agent = h.agent
      this.postFacts(h.agent)
    }
    this.squad = squad
    this.crew = [...members.values()] as CrewMember[]
    this.focus = Math.min(this.focus, this.crew.length - 1)
    this.afterInit()
  }

  private decided(d: SquadDecision): void {
    const previous = this.decisions[this.decisions.length - 1]
    this.decisions.push(d)
    const event: ReplanEvent = { type: 'replan', guard: 'squad', reason: d.reason, status: d.status, plan: d.plan, kept: false, passes: 1 }
    if (previous) {
      event.previous = previous.plan
      event.changed = previous.plan.length !== d.plan.length || previous.plan.some((step, i) => step !== d.plan[i])
    }
    this.squadHistory.push({ t: this.time, event })
  }

  /** Each guard's posts, in its own world (they do not change). */
  private postFacts(agent: GuardAgent) {
    const w = agent.blackboard.world
    const at = (p: Vec3) => vec3(p.x, p.y, p.z)
    w.set('gate_post', at(GATE_POST), at(GATE_OUTSIDE))
    w.set('flank_post', at(FLANK_POSTS[agent.id]))
    w.set('bench', at(BENCH))
  }

  /**
   * The squad's snapshot: the roster, who is available, who spotted the intruder. The key has what should decide
   * again (who is available, the spotter), not positions, so walking guards do not make the squad replan.
   */
  private snapshot(world: WorldState, guards: readonly GuardHandle[]): string {
    world.add('roster', list(...guards.map(g => sym(g.spec.id))))
    const available = guards.filter(g => !this.onBreak.has(g.spec.id))
    for (const g of available) world.add('available', sym(g.spec.id))
    const spotter = this.spotter(available)
    if (spotter !== undefined) world.add('spotter', sym(spotter))
    return `${available.map(g => g.spec.id).join(',')}|${spotter ?? '-'}`
  }

  /** The guard chasing keeps the chase while it sees or remembers the intruder; else the first one that sees it. */
  private spotter(available: readonly GuardHandle[]): string | undefined {
    const sees = (g: GuardHandle) => g.agent.blackboard.world.rows('target_visible', 2).length > 0
    const remembers = (g: GuardHandle) => g.agent.blackboard.world.rows('last_seen', 3).length > 0
    const chaser = available.find(g => this.roleOf(g.spec.id) === 'chase')
    if (chaser && (sees(chaser) || remembers(chaser))) return chaser.spec.id
    return available.find(sees)?.spec.id
  }

  /**
   * no_squad: the order a guard gives itself, as the fact (order <role>): none on a break, chase while it sees or
   * remembers the intruder, else its calm role. The key is the order: a new one replans the guard.
   */
  private selfOrder(agent: GuardAgent): string {
    this.sensed(agent)
    const w = agent.blackboard.world
    const role: Role = this.onBreak.has(agent.id)
      ? 'none'
      : w.rows('target_visible', 2).length > 0 || w.rows('last_seen', 3).length > 0
        ? 'chase'
        : (CALM_ROLES[agent.id] ?? 'patrol')
    w.clear('order', 1)
    if (role !== 'none') w.add('order', sym(role))
    this.selfOrders.set(agent.id, role)
    return role
  }

  /** The role the squad gave a guard ('none': no order); without a squad planner (no_squad), the one it gave itself. */
  roleOf(id: string): Role {
    if (this.ablated('no_squad')) return this.selfOrders.get(id) ?? 'none'
    const rows = this.squad?.orders.get(id)
    return rows && rows.length > 0 ? (formatAtom(rows[0][0]) as Role) : 'none'
  }

  /** Every guard has the role given and runs the branch that carries it out. */
  private rolesAre(roles: Record<string, Role>): boolean {
    return this.crew.every(m => this.roleOf(m.id) === roles[m.id] && ROLE_BRANCHES[roles[m.id]].some(b => this.doingOf(m, b)))
  }

  /** One guard chases (the one that spotted the intruder), one holds the gate, the third flanks. */
  private intruderRoles(): boolean {
    const roles = this.crew.map(m => this.roleOf(m.id)).sort()
    if (roles.join(' ') !== 'chase flank hold') return false
    return this.crew.every(m => ROLE_BRANCHES[this.roleOf(m.id)].some(b => this.doingOf(m, b)))
  }

  /** The squad reads `targetsNow` (set by update) through its `targets` option. */
  protected tickCrew(dt: number, _targets: TargetSample[], _noises: readonly NoiseEvent[]): void {
    this.squad?.update(dt)
  }

  // ---- metrics and ablations (docs/htn-level-metrics.md) ----

  protected levelAblations(): Ablation[] {
    return [{ name: 'no_squad', change: 'no squad planner: each guard orders itself, its calm role (a hold, b and c patrol) or chase while it sees or remembers the intruder' }]
  }
  /** The guards hear nothing (the squad has no noise source). */
  protected hearsNoises(): boolean {
    return false
  }
  roles(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const m of this.crew) out[m.id] = this.roleOf(m.id)
    return out
  }
  posts(): Post[] {
    return [YARD_GATE]
  }

  dispose(): void {
    this.squad?.despawn()
    this.squad = null
  }

  planners(): LevelPlanner[] {
    const level = this
    return [
      {
        id: 'squad',
        label: 'squad planner',
        domain: yardSquadDomain,
        recorder: this.squadTrace,
        history: this.squadHistory,
        get world() {
          return level.squad?.squadWorld ?? new WorldState()
        },
        status: () => {
          const d = level.squad?.lastDecision
          return { lastStatus: d?.status ?? '', reason: d?.reason ?? '', steps: d?.plan ?? [] }
        }
      }
    ]
  }

  boardNotes(): string[] {
    const d = this.squad?.lastDecision
    const roles = this.crew.map(m => `${m.id}: <b>${this.roleOf(m.id)}</b>`).join('   ')
    const why = d ? `decision ${this.decisions.length}: ${d.reason}` : 'no decision yet'
    return [`<color=#ffb14a>SQUAD (assign_roles)  ${roles}</color>`, `<color=#8a8a8a>${why}</color>`]
  }

  protected testerScript(): TesterStep[] {
    return [
      expect('calm -> a holds the gate, b and c patrol', () => this.rolesAre({ a: 'hold', b: 'patrol', c: 'patrol' }), 15, 'one squad, one planner'),
      walk('gate', 'at the gate...'),
      walk('inside', 'sneaking in'),
      expect('seen -> the spotter chases, the next holds the gate, the third flanks', () => this.intruderRoles(), 10, 'who sees me?'),
      walk('exit', 'run out of the yard!', 7),
      expect('lost -> calm again: a holds, b and c patrol', () => this.rolesAre({ a: 'hold', b: 'patrol', c: 'patrol' }), 45, 'safe outside'),
      wait(3, 'calm again'),
      act('a goes on a break', () => this.onBreak.add('a')),
      expect('a on a break -> b holds the gate, c patrols, a has no order', () => this.rolesAre({ a: 'none', b: 'hold', c: 'patrol' }), 12),
      wait(3, 'b took the gate over'),
      act('a is back', () => this.onBreak.delete('a')),
      expect('a back -> a holds the gate, b patrols again', () => this.rolesAre({ a: 'hold', b: 'patrol', c: 'patrol' }), 12),
      wait(3, 'again in a moment')
    ]
  }

  controls() {
    return [
      { label: 'Board: next NPC', run: () => (this.focus = (this.focus + 1) % this.crew.length) },
      {
        label: 'a: break / back',
        run: () => {
          if (!this.onBreak.delete('a')) this.onBreak.add('a')
        }
      },
      {
        label: 'b: break / back',
        run: () => {
          if (!this.onBreak.delete('b')) this.onBreak.add('b')
        }
      }
    ]
  }

  protected resetProps(): void {
    this.onBreak.clear()
  }

  markers(): Marker[] {
    const out = yardMarkers(true)
    out.push(
      { id: 'gate-post', shape: 'cylinder', position: v3(GATE_POST.x - 1.3, 0.7, GATE_POST.z - 1.4), scale: v3(0.25, 1.4, 0.25), color: FENCE, label: 'gate' },
      box('bench', v3(BENCH.x, 0.25, BENCH.z - 0.9), v3(2, 0.5, 0.6), WOOD, this.onBreak.size > 0 ? `on a break: ${[...this.onBreak].join(', ')}` : 'bench')
    )
    for (const [id, p] of Object.entries(FLANK_POSTS)) {
      out.push({ id: `flank-${id}`, shape: 'box', position: v3(p.x, 0.03, p.z), scale: v3(0.5, 0.05, 0.5), color: { r: 0.34, g: 0.85, b: 0.9 }, label: `flank ${id}` })
    }
    return out
  }
}
