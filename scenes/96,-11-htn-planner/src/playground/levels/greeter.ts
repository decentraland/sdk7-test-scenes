// Level 3: the greeter domain (src/examples/basics/greeter.domain): facts, and a condition that binds who to greet.
import { greeterDomain } from '../../examples/basics/greeter.htn'
import { distanceXZ, float, sym, v3, Vec3 } from '../../htn-planner'
import { basicsActions } from '../basics-actions'
import { AgentSetup, expect, LevelInfo, LevelSim, Marker, TesterStep, wait, walk } from '../sim'
import { box, near, WOOD } from './props'

const VISIT_RADIUS = 9

export class GreeterLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'greeter',
    number: 3,
    title: 'Facts and variables',
    source: 'basics/greeter.domain',
    lesson: [
      'The host writes a (visitor ?who ?distance) fact per visitor.',
      'The condition binds ?who from a row and filters it:',
      '(< ?distance 4) and (not (greeted ?who)). Walk up yourself!'
    ],
    watch: 'the bound values next to the chosen branch: ?who=tester'
  }
  greeted = new Set<string>()
  private readonly home = v3(0, 0, 2)

  spots() {
    return { porch_left: v3(-5, 0, 2), porch_right: v3(5, 0, 2) }
  }
  protected agentSetup(): AgentSetup {
    return { domain: greeterDomain, start: { position: this.home, yaw: Math.PI }, tuning: { walkSpeed: 1.2 } }
  }
  protected actions() {
    return basicsActions({
      spot: n => this.spot(n),
      say: t => this.say('npc', t),
      positionOf: who => this.positionOf(who),
      remember: who => this.greeted.add(who)
    })
  }
  private visitors(): { who: string; distance: number }[] {
    const me = this.agent.kinematic.position
    const out: { who: string; distance: number }[] = []
    for (const who of ['tester', 'you']) {
      const p = this.positionOf(who)
      if (!p) continue
      const distance = distanceXZ(me, p)
      if (distance <= VISIT_RADIUS) out.push({ who, distance })
      else this.greeted.delete(who) // walked away: next time is a new visit
    }
    return out
  }
  protected facts(): string {
    const w = this.agent.blackboard.world
    w.clear('visitor', 2)
    w.clear('greeted', 1)
    const key: string[] = []
    for (const v of this.visitors()) {
      w.add('visitor', sym(v.who), float(Math.round(v.distance * 10) / 10))
      key.push(`${v.who}:${v.distance < 4 ? 'near' : 'far'}`)
    }
    for (const who of this.greeted) {
      w.add('greeted', sym(who))
      key.push(`greeted:${who}`)
    }
    return key.join(' ')
  }
  protected resetProps() {
    this.greeted.clear()
  }
  /** 2 m from the greeter, on the tester's side (it may be anywhere on the porch). */
  private closeTo(): Vec3 {
    const g = this.agent.kinematic.position
    const t = this.tester.position
    const d = distanceXZ(g, t) || 1
    return v3(g.x + ((t.x - g.x) / d) * 2, 0, g.z + ((t.z - g.z) / d) * 2)
  }
  protected testerStart() {
    return v3(12, 0, -11)
  }
  protected testerScript(): TesterStep[] {
    return [
      expect('nobody around -> sweep_the_porch', () => this.doing('sweep_the_porch'), 6, 'is anybody home?'),
      walk(v3(2, 0, -5.5), 'walking up'),
      expect('visitor at ~8 m -> watch_visitor, ?who=tester', () => this.doing('watch_visitor') && this.binding('?who') === 'tester', 3),
      walk(() => this.closeTo(), 'stepping close'),
      expect('close and new -> greet_new_visitor', () => this.doing('greet_new_visitor') && this.binding('?who') === 'tester', 3),
      expect('it said hi and remembered me', () => this.greeted.has('tester'), 6),
      wait(3, 'still here: no second hello?'),
      expect('greeted already -> watch_visitor', () => this.doing('watch_visitor'), 1),
      walk(this.testerStart(), 'leaving'),
      expect('visitor gone -> sweep_the_porch', () => this.doing('sweep_the_porch'), 4),
      expect('it forgot me (next visit = new hello)', () => !this.greeted.has('tester'), 1)
    ]
  }
  markers(): Marker[] {
    return [
      box('house', v3(0, 1.6, 6), v3(12, 3.2, 3), { r: 0.6, g: 0.45, b: 0.35 }, 'house', true),
      box('porch', v3(0, 0.05, 2.5), v3(12, 0.1, 3), WOOD),
      { id: 'ring4', shape: 'cylinder', position: v3(this.agent.kinematic.position.x, 0.02, this.agent.kinematic.position.z), scale: v3(8, 0.02, 8), color: { r: 0.3, g: 0.5, b: 0.3 }, label: undefined }
    ]
  }
}
