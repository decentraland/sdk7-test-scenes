// Level 1: the hello domain (src/examples/basics/hello.domain): a plan is a list of steps.
import { helloDomain } from '../../examples/basics/hello.htn'
import { v3 } from '../../htn-planner'
import { basicsActions } from '../basics-actions'
import { act, AgentSetup, expect, LevelInfo, LevelSim, Marker, TesterStep, walk } from '../sim'
import { box, LEAF, near, WOOD } from './props'

export class HelloLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'hello',
    number: 1,
    title: 'A plan is a list of steps',
    source: 'basics/hello.domain',
    lesson: [
      'One method, one branch, no conditions.',
      'The planner returns the same 6 steps every time;',
      'the NPC does them one by one, then asks again.'
    ],
    watch: 'the PLAN list: the ▶ step moves down as the NPC works'
  }
  private replansAtMark = 0

  spots() {
    return { well: v3(-7, 0, 2), tree: v3(7, 0, 5), bench: v3(0, 0, -3) }
  }
  protected agentSetup(): AgentSetup {
    return { domain: helloDomain, start: { position: v3(0, 0, -3), yaw: 0 }, tuning: { walkSpeed: 2 } }
  }
  protected actions() {
    return basicsActions({ spot: n => this.spot(n), say: t => this.say('npc', t) })
  }
  protected testerStart() {
    return v3(-10, 0, -8)
  }
  protected testerScript(): TesterStep[] {
    const at = (spot: string) => () => near(this.agent.kinematic.position, this.spot(spot))
    return [
      act('new round: I note the replan count', () => (this.replansAtMark = this.replans)),
      expect('a plan: morning_round, 6 steps', () => this.doing('morning_round') && (this.trace.lastPlan?.plan.length ?? 0) === 6, 3),
      expect('step 1: walks to the well', at('well'), 20, 'is it going to the well?'),
      walk(v3(-2, 0, -7), 'following along'),
      expect('step 3: then to the tree', at('tree'), 20, 'now the tree?'),
      expect('step 5: then to the bench', at('bench'), 20, 'and back to the bench?'),
      expect('done: asks the planner again', () => this.replans > this.replansAtMark, 15, 'plan finished: a new one?'),
      walk(this.testerStart(), 'back to my spot')
    ]
  }
  markers(): Marker[] {
    return [
      { id: 'well', shape: 'cylinder', position: v3(-7, 0.45, 3.4), scale: v3(1.8, 0.9, 1.8), color: { r: 0.3, g: 0.45, b: 0.7 }, label: 'well', solid: true },
      { id: 'trunk', shape: 'cylinder', position: v3(7, 1, 6.4), scale: v3(0.4, 2, 0.4), color: WOOD, solid: true },
      { id: 'crown', shape: 'sphere', position: v3(7, 2.6, 6.4), scale: v3(2.2, 2, 2.2), color: LEAF, label: 'tree' },
      box('bench', v3(0, 0.25, -1.9), v3(2, 0.5, 0.6), WOOD, 'bench')
    ]
  }
}
