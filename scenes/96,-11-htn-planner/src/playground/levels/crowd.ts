// Level 9: a crowd, the guard domain on ten NPCs (any number: `new CrowdLevel(n)`). Also the many-NPC load check:
// scripts/bench/crowd.ts runs it headless with 10 / 25 / 50 guards and reads every agent's planning metrics.
// The checks read the agents' modes (blackboard), not the plan trace, so they hold with trace recording off.
// The crew shares a planning budget (CROWD_BUDGET plans per frame, plan-budget.ts): the frame everyone wants to replan
// is spread over the next frames; a control switches it off to compare. `new CrowdLevel(n, null)`: no budget.
// Where on its loop each guard starts is drawn from the level's seed (`rng`), as upstream's demo shuffles its
// wanderers' waypoints with a seed (DemoWanderer.cpp:85-93): another seed, another crowd; the same seed, the same one.
import { GuardAgent, GuardMode, PlanBudget, PlanBudgetOptions, v3, Vec3 } from '../../htn-planner'
import { act, AgentSetup, expect, LevelInfo, Marker, TesterStep, wait, walk } from '../sim'
import { FENCE, GuardLevel, inYard, yardMarkers } from './guard-yard'

const BELL = v3(0, 0, 3)
/** The crew's planning budget in the scene: a few replans per frame, the rest wait their turn. */
export const CROWD_BUDGET: PlanBudgetOptions = { maxPlansPerFrame: 3 }
const CENTRE = v3(-1, 0, 1)

/** Loop `i`: the yard's patrol rectangle, inset by i % 3, every other one the other way round. */
export function crowdRoute(i: number): Vec3[] {
  const inset = i % 3
  const hx = 7 - 2 * inset
  const hz = 5 - 1.5 * inset
  const loop = [v3(-hx, 0, 1 - hz), v3(hx, 0, 1 - hz), v3(hx, 0, 1 + hz), v3(-hx, 0, 1 + hz)]
  return i % 2 === 0 ? loop : loop.reverse()
}

const yawTo = (from: Vec3, to: Vec3) => Math.atan2(to.x - from.x, to.z - from.z)
const lerpXZ = (a: Vec3, b: Vec3, t: number) => v3(a.x + (b.x - a.x) * t, a.y, a.z + (b.z - a.z) * t)

export class CrowdLevel extends GuardLevel {
  constructor(
    readonly size = 10,
    private budget: PlanBudgetOptions | null = CROWD_BUDGET
  ) {
    super()
    this.boardScale = 0.6
    this.planBudget = budget ? new PlanBudget(budget) : null
  }

  get info(): LevelInfo {
    return {
      id: 'crowd',
      number: 9,
      title: `A crowd: ${this.size} guards, one domain`,
      source: 'guard/guard.domain',
      lesson: [
        'Every NPC plans on its own: ten planners, ten worlds.',
        `Walk in: all who see you want to replan in the same frame; a budget of ${CROWD_BUDGET.maxPlansPerFrame} plans per frame spreads them.`,
        'The board: planning ms per NPC, the worst plan, the peak frames.',
        'scripts/bench/crowd.ts measures 10 / 25 / 50 of them headless.'
      ],
      watch: 'the frame you walk in: many replans at once, spread by the budget'
    }
  }

  spots() {
    return { exit: v3(-12.5, 0, -10.5), centre: CENTRE }
  }
  protected agentSetup(): AgentSetup {
    return this.crewSetup()[0]
  }
  protected crewSetup(): AgentSetup[] {
    const guard = this.guardSetup()
    return Array.from({ length: this.size }, (_, i) => {
      const id = `guard-${i + 1}`
      const route = crowdRoute(i)
      const rng = this.rng.fork(id)
      const at = rng.int(route.length)
      const next = (at + 1) % route.length
      const p = lerpXZ(route[at], route[next], rng.next())
      return { ...guard, id, route, routeStart: next, start: { position: p, yaw: yawTo(p, route[next]) } }
    })
  }
  protected testerVisible() {
    return inYard(this.tester.position)
  }
  protected testerStart() {
    return v3(-12.5, 0, -10.5)
  }
  private count(...modes: GuardMode[]): number {
    return this.crew.filter(m => modes.includes(m.agent.mode)).length
  }
  private all(mode: GuardMode): () => boolean {
    return () => this.count(mode) === this.crew.length
  }
  private half(): number {
    return Math.ceil(this.crew.length / 2)
  }
  protected testerScript(): TesterStep[] {
    return [
      expect('nobody in the yard -> all patrol', this.all('patrol'), 40, `${this.size} guards, one domain`),
      walk(v3(-9, 0, -7.8), 'sneaking in'),
      walk('centre', 'right into the middle'),
      expect('at least half of them see me and chase', () => this.count('chase') >= this.half(), 10, 'everyone replans at once'),
      walk('exit', 'run out of the yard!', 7),
      expect('lost me -> all back to patrol', this.all('patrol'), 60, 'safe outside'),
      wait(2, 'now the bell'),
      act('DONG! bell: loud', () => this.ring()),
      expect('the bell -> at least half of them react', () => this.count('alert', 'investigate') >= this.half(), 3),
      expect('-> all back to patrol', this.all('patrol'), 60),
      wait(3, 'again in a moment')
    ]
  }
  private ring() {
    this.noise('bell', BELL, 25)
  }
  /** The NPC with the slowest plan so far (for the board). */
  get slowest(): GuardAgent | undefined {
    let worst: GuardAgent | undefined
    for (const m of this.crew) if (!worst || m.agent.metrics.maxPlanMs > worst.metrics.maxPlanMs) worst = m.agent
    return worst
  }
  controls() {
    return [
      { label: 'Board: next NPC', run: () => (this.focus = (this.focus + 1) % this.crew.length) },
      {
        label: 'Board: slowest NPC',
        run: () => {
          const worst = this.slowest
          this.focus = Math.max(0, this.crew.findIndex(m => m.agent === worst))
        }
      },
      {
        label: this.budget ? 'Budget: off (restarts)' : 'Budget: on (restarts)',
        run: () => {
          this.budget = this.budget ? null : CROWD_BUDGET
          this.planBudget = this.budget ? new PlanBudget(this.budget) : null
          this.reset()
        }
      },
      { label: 'Ring the bell', run: () => this.ring() },
      { label: 'Noise at me (10 m)', run: () => this.player && this.noise('test', this.player, 10) }
    ]
  }
  markers(): Marker[] {
    const out = yardMarkers(true)
    out.push(
      { id: 'bell', shape: 'cylinder', position: v3(BELL.x, 1.5, BELL.z), scale: v3(0.6, 0.6, 0.6), color: { r: 0.9, g: 0.75, b: 0.2 }, glow: 0.5, label: 'bell' },
      { id: 'bell-post', shape: 'box', position: v3(BELL.x, 0.6, BELL.z), scale: v3(0.12, 1.2, 0.12), color: FENCE }
    )
    return out
  }
}
