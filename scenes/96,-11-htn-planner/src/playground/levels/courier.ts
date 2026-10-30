// Level 4: the courier domain (src/examples/basics/courier.domain): methods call methods; & decides later.
import { courierDomain } from '../../examples/basics/courier.htn'
import { int, sym, v3, Vec3 } from '../../htn-planner'
import { basicsActions } from '../basics-actions'
import { act, AgentSetup, Control, expect, LevelInfo, LevelSim, Marker, TesterStep, walk } from '../sim'
import { box, GREY, WOOD } from './props'

const SHELVES = ['shelf_a', 'shelf_b'] as const
const SHELF_SIZE = 2

export class CourierLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'courier',
    number: 4,
    title: 'Methods call methods; & decides later',
    source: 'basics/courier.domain',
    lesson: [
      'deliver tries shelf rows in order and skips full ones,',
      'then calls the carry_box method: 4 steps.',
      'The last step, &behave, is planned only when reached.'
    ],
    watch: 'nested carry_box in the tree, and "&behave" expanding'
  }
  pile = 0
  shelves: Record<string, number> = { shelf_a: 0, shelf_b: 0 }
  carrying = false

  spots() {
    return { pile: v3(-8, 0, 0), shelf_a: v3(6.5, 0, 4), shelf_b: v3(6.5, 0, -2), bench: v3(-1, 0, 6), drop: v3(-10.5, 0, -3), unload: v3(9.5, 0, 1) }
  }
  protected agentSetup(): AgentSetup {
    return { domain: courierDomain, start: { position: v3(-1, 0, 6), yaw: Math.PI }, tuning: { walkSpeed: 3.2 } }
  }
  protected actions() {
    return basicsActions({
      spot: n => this.spot(n),
      say: t => this.say('npc', t),
      pickUp: () => {
        if (this.pile <= 0 || this.carrying) return false
        this.pile--
        this.carrying = true
        return true
      },
      putOn: shelf => {
        if (!this.carrying || !(shelf in this.shelves)) return false
        this.shelves[shelf]++
        this.carrying = false
        return true
      }
    })
  }
  protected facts(): string {
    const w = this.agent.blackboard.world
    w.set('pile_boxes', int(this.pile))
    w.clear('shelf', 2)
    for (const s of SHELVES) w.add('shelf', sym(s), int(this.shelves[s]))
    return '' // no replan on box counts: the deferred &behave reads them when the courier gets there
  }
  protected resetProps() {
    this.pile = 0
    this.shelves = { shelf_a: 0, shelf_b: 0 }
    this.carrying = false
  }
  protected testerStart() {
    return v3(-11, 0, -8)
  }
  protected testerScript(): TesterStep[] {
    const delivering = (shelf: string) => () => this.doing('deliver') && this.binding('?shelf') === shelf
    return [
      expect('pile empty -> wait_for_work', () => this.doing('wait_for_work'), 6, 'nothing to do yet'),
      walk('drop', 'bringing 5 boxes'),
      act('5 boxes on the pile', () => (this.pile += 5)),
      expect('boxes -> deliver, first row with room: shelf_a', delivering('shelf_a'), 6),
      expect('shelf_a full -> row skipped, ?shelf=shelf_b', delivering('shelf_b'), 50, 'watch it fill shelf_a'),
      expect('both full, 1 left -> shelves_full', () => this.doing('shelves_full'), 50),
      walk('unload', 'I take shelf_a off'),
      act('shelf_a emptied', () => (this.shelves.shelf_a = 0)),
      expect('room again -> deliver to shelf_a', delivering('shelf_a'), 6),
      expect('pile empty -> wait_for_work', () => this.doing('wait_for_work'), 30),
      act('unloading everything', () => (this.shelves = { shelf_a: 0, shelf_b: 0 })),
      walk(this.testerStart(), 'back to my spot')
    ]
  }
  controls(): Control[] {
    return [
      { label: 'Add a box', run: () => this.pile++ },
      { label: 'Empty shelves', run: () => (this.shelves = { shelf_a: 0, shelf_b: 0 }) }
    ]
  }
  markers(): Marker[] {
    const crate = { r: 0.75, g: 0.55, b: 0.25 }
    const out: Marker[] = [box('pile-base', v3(-9.3, 0.05, 0), v3(1.6, 0.1, 1.6), GREY, `pile: ${this.pile}`)]
    for (let i = 0; i < Math.min(this.pile, 8); i++) out.push(box(`pile${i}`, v3(-9.3 + (i % 2) * 0.6 - 0.3, 0.3 + Math.floor(i / 2) * 0.55, 0), v3(0.5, 0.5, 0.5), crate))
    SHELVES.forEach(s => {
      const p = this.spot(s) as Vec3
      const count = this.shelves[s]
      out.push(box(`${s}-frame`, v3(p.x + 1.4, 0.6, p.z), v3(0.8, 1.2, 2.2), WOOD, `${s}: ${count}/${SHELF_SIZE}`, true))
      for (let i = 0; i < count; i++) out.push(box(`${s}-box${i}`, v3(p.x + 1.4, 1.5, p.z - 0.55 + i * 1.1), v3(0.5, 0.5, 0.5), crate))
    })
    if (this.carrying) {
      const a = this.agent.kinematic.position
      out.push(box('carried', v3(a.x, 2.2, a.z), v3(0.5, 0.5, 0.5), crate))
    }
    out.push(box('bench', v3(-1, 0.25, 7.1), v3(2, 0.5, 0.6), WOOD, 'bench'))
    return out
  }
}
