// arrest_team, the squad's host and the story (paper prototype; src/examples/canon/paper.ts). The scenarios are the
// files in worlds/arrest_team/. Run the story: npm run htn:run -- --story arrest_team/reservations-survive-replans
import { formatTask, sym } from '../../../htn-planner'
import type { Atom, PlanStep } from '../../../htn-planner'
import type { Agent, Stage, Story } from '../paper'

/** How long each action keeps its member busy, in ticks (combat: until the host ends it). */
const DURATION: Record<string, number> = { '!restrain': 2, '!cover_target': 2, '!bandage_self': 1, '!open_combat': Infinity }
const BOOKKEEPING = new Set(['!reserve', '!free', '!wait_until_done'])

/**
 * The squad's execution semantics (SquadSmart): the planner runs once per tick, every non-empty plan starts beside
 * the ones already running, bookkeeping steps run at once, an action makes its member busy for a while, a step that
 * needs a busy member (or `!wait_until_done` on one) holds its plan. A finished restrain is sensed as `(restrained ?t)`; completed bandaging clears that member's wound.
 */
export class SquadHost {
  t = 0
  private readonly busy = new Map<string, { left: number; step: string; args: readonly Atom[] }>()
  private readonly plans: { id: number; steps: PlanStep[]; cursor: number }[] = []
  private next = 1

  constructor(
    private readonly stage: Stage,
    readonly squad: Agent
  ) {}

  get running(): number {
    return this.plans.length
  }

  /** One tick: the members' actions advance, the planner runs once, every plan goes as far as it can. */
  tick(): void {
    this.stage.at(this.t)
    const w = this.squad.world
    for (const [member, action] of this.busy) {
      if (--action.left > 0) continue
      this.busy.delete(member)
      if (action.step === '!restrain') w.add('restrained', action.args[1])
      if (action.step === '!bandage_self') w.removeWhere('wounded', 1, row => row[0].v === action.args[0].v)
      this.squad.log(`t${this.t} ${member} done`)
    }
    const r = this.squad.propose(`tick ${this.t}`)
    if (r.status === 'succeeded' && r.steps.length > 0) this.plans.push({ id: this.next++, steps: r.steps, cursor: 0 })
    for (const p of [...this.plans]) {
      while (p.cursor < p.steps.length) {
        const step = p.steps[p.cursor]
        const member = String(step.args[0]?.v)
        if (step.name === '!wait_until_done' && this.busy.has(member)) break
        if (!BOOKKEEPING.has(step.name) && this.busy.has(member)) break
        if (step.name === '!reserve') w.add('reserved', step.args[0])
        if (step.name === '!free') w.removeWhere('reserved', 1, row => row[0].v === step.args[0].v)
        if (step.name in DURATION) this.busy.set(member, { left: DURATION[step.name], step: step.name, args: step.args })
        if (step.name === '!open_combat') w.add('fighting', step.args[0], step.args[1])
        this.squad.record(step, `t${this.t} plan ${p.id}: ${formatTask(step.name, step.args)}`)
        p.cursor++
      }
      if (p.cursor >= p.steps.length) this.plans.splice(this.plans.indexOf(p), 1)
    }
    this.t++
  }
}

export const ARREST_STORIES: Story[] = [
  {
    station: 'arrest_team',
    name: 'reservations survive replans',
    blurb: 'plans run side by side, a second suspect is left to a free member, the barrier frees nobody early',
    play: stage => {
      const squad = stage.agent({ world: stage.scenario('1_restrain_with_complement'), method: 'squad_tick' })
      const host = new SquadHost(stage, squad)
      const w = squad.world
      // t0: s1 has surrendered; a restrains, b covers. The reservations run at once, both actions start side by
      // side and the plan waits at the barrier.
      host.tick()
      squad.show('reserved')
      // t1: s2 surrenders too, closest to b. The planner leaves s1, a and b alone: c restrains s2 alone.
      stage.event('s2 surrenders too', () => w.add('surrendered', sym('s2')))
      squad.matches('3_reserved_parties_left_alone')
      host.tick()
      squad.log(`plans running: ${host.running}`)
      // t2: the restrain of s1 and the cover end. Everyone is still reserved when the planner runs: nothing new.
      // Then the first plan passes its barrier and frees a, b and s1.
      squad.show('restrained')
      host.tick()
      squad.show('reserved')
      // t3: an armed suspect shows up. a and b are free and open fire; c stays on its restrain (reserved).
      stage.event('an armed suspect shows up', () => {
        w.add('enemy', sym('e1'))
        w.add('hostile', sym('e1'))
      })
      host.tick()
      // t4: the restrain of s2 ended at t3 and its plan freed c and s2: c joins the fight.
      host.tick()
      squad.show('reserved')
      squad.show('restrained')
    },
    expect: [
      'plan: !reserve a, !reserve b, !reserve s1, !restrain a s1, !cover_target b s1, !wait_until_done a, !free a, !free b, !free s1',
      't0 plan 1: !reserve a',
      't0 plan 1: !reserve b',
      't0 plan 1: !reserve s1',
      't0 plan 1: !restrain a s1',
      't0 plan 1: !cover_target b s1',
      'reserved: a, b, s1',
      'event: s2 surrenders too',
      'world is 3_reserved_parties_left_alone',
      'plan: !reserve c, !reserve s2, !restrain c s2, !wait_until_done c, !free c, !free s2',
      't1 plan 2: !reserve c',
      't1 plan 2: !reserve s2',
      't1 plan 2: !restrain c s2',
      'plans running: 2',
      'restrained: (none)',
      't2 a done',
      't2 b done',
      'plan: (empty)',
      't2 plan 1: !wait_until_done a',
      't2 plan 1: !free a',
      't2 plan 1: !free b',
      't2 plan 1: !free s1',
      'reserved: c, s2',
      'event: an armed suspect shows up',
      't3 c done',
      'plan: !open_combat a e1, !open_combat b e1',
      't3 plan 2: !wait_until_done c',
      't3 plan 2: !free c',
      't3 plan 2: !free s2',
      't3 plan 3: !open_combat a e1',
      't3 plan 3: !open_combat b e1',
      'plan: !open_combat c e1',
      't4 plan 4: !open_combat c e1',
      'reserved: (none)',
      'restrained: s1, s2'
    ]
  }
]
