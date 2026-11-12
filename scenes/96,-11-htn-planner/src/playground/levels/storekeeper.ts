// Level 10: the storekeeper domain (src/examples/basics/storekeeper.domain): the running step is checked by the domain
// (GuardAgentOptions.activePlan, upstream docs/USE_CASES.md section 1). The level never replans on a fact change
// (facts() returns no key); `active_plan` runs on every tick a step runs and cancels the step it no longer accepts.
// The general ablation no_active_plan (ablation.ts) turns the check off: then facts() returns a key, so the keeper
// replans on every change of them instead (docs/htn-level-metrics.md).
import { storekeeperDomain } from '../../examples/basics/storekeeper.htn'
import { ActionRegistry, atomName, atomNumber, instant, sym, timed, v3, Vec3 } from '../../htn-planner'
import { basicsActions } from '../basics-actions'
import { act, AgentSetup, Control, expect, LevelInfo, LevelSim, Marker, TesterStep, wait, walk } from '../sim'
import { box, GREY, near, WOOD } from './props'

/** A visitor this close to the customer spot is at the counter. */
const COUNTER_RADIUS = 1.5
const CRATE = { r: 0.75, g: 0.55, b: 0.25 }
const HAND_OVER_SECONDS = 1

export class StorekeeperLevel extends LevelSim {
  readonly info: LevelInfo = {
    id: 'storekeeper',
    number: 10,
    title: 'Is the running step still valid?',
    source: 'basics/storekeeper.domain',
    lesson: [
      'No replan on a fact change: a step runs to its end, unless',
      'active_plan, checked every tick, rejects it: (running go_to store)',
      'needs an open door. Shut it mid-walk: cancel, plan behave again.',
      'One branch per action in active_plan, no catch-all.'
    ],
    watch: '"running step checked ... rejected": then History tab, a check row'
  }
  storeOpen = true
  holding = false
  /** Crates handed over. */
  served = 0
  /** Visitors served on this visit: no longer customers until they leave the counter. */
  readonly servedNow = new Set<string>()
  branchColors = { serve: '#7be37b', fetch: '#56d8e6', store_shut: '#ff9a3c', rest: '#8a8a8a' }

  spots() {
    return {
      counter: v3(-3, 0, -3.6),
      customer: v3(-3, 0, -6.4),
      store: v3(7, 0, 4.4),
      bench: v3(-9, 0, 4),
      away: v3(-9, 0, -9.5)
    }
  }
  protected agentSetup(): AgentSetup {
    return {
      domain: storekeeperDomain,
      activePlan: 'active_plan',
      start: { position: v3(-9, 0, 4), yaw: Math.PI },
      tuning: { walkSpeed: 2.2 }
    }
  }
  protected actions(): ActionRegistry {
    return {
      ...basicsActions({ spot: n => this.spot(n), say: t => this.say('npc', t) }),
      '!take_crate': () =>
        instant(() => {
          if (!this.storeOpen) return 'failed'
          this.holding = true
          return 'done'
        }),
      '!hand_over': args => {
        const who = atomName(args[0])
        if (who === undefined) return null
        this.say('npc', `here you go, ${who}!`)
        return timed(HAND_OVER_SECONDS, (_dt, elapsed) => {
          if (elapsed < HAND_OVER_SECONDS - 1e-6 || !this.holding) return
          this.holding = false
          this.served++
          this.servedNow.add(who)
        })
      },
      '!sit': args => {
        const s = atomNumber(args[0])
        return s === undefined ? null : timed(s)
      }
    }
  }
  /** Visitors at the counter not served on this visit, the tester first. */
  customers(): string[] {
    const out: string[] = []
    for (const who of ['tester', 'you']) {
      const p = this.positionOf(who)
      if (!p || !near(p, this.spot('customer'), COUNTER_RADIUS)) this.servedNow.delete(who)
      else if (!this.servedNow.has(who)) out.push(who)
    }
    return out
  }
  protected facts(): string {
    const w = this.agent.blackboard.world
    w.clear('customer', 1)
    for (const who of this.customers()) w.add('customer', sym(who))
    w.clear('store_open', 0)
    if (this.storeOpen) w.add('store_open')
    w.clear('holding_crate', 0)
    if (this.holding) w.add('holding_crate')
    // Never replan on these: active_plan decides when the running step must stop. Without it (no_active_plan), every change replans.
    if (this.ablated('no_active_plan')) return `${w.rows('customer', 1).length}|${this.storeOpen}|${this.holding}`
    return ''
  }
  /** Crates handed over (metrics: per round). */
  outcomes() {
    return { served: this.served }
  }
  protected resetProps() {
    this.storeOpen = true
    this.holding = false
    this.served = 0
    this.servedNow.clear()
  }
  protected testerStart() {
    return v3(-9, 0, -9.5)
  }
  /** The check rejected `step` since the last forget(). */
  private rejected(step: string): boolean {
    return this.crew[0].lastRejected === step
  }
  private forget() {
    this.crew[0].lastRejected = ''
  }
  protected testerScript(): TesterStep[] {
    let before = 0
    return [
      expect('nobody at the counter -> rest', () => this.doing('rest'), 8, 'the keeper rests'),
      act('', () => this.forget()),
      walk('customer', 'one crate, please'),
      expect('a customer, store open -> fetch', () => this.doing('fetch'), 4),
      wait(1.5, 'the keeper walks to the store...'),
      act('slam! door shut', () => (this.storeOpen = false)),
      expect('door shut mid-walk -> check rejects !go_to store -> store_shut', () => this.rejected('!go_to store') && this.doing('store_shut'), 2),
      wait(2, 'waiting at a shut door'),
      act('door open again', () => (this.storeOpen = true)),
      expect('door open -> check rejects the wait -> fetch', () => this.rejected('!wait 5.0') && this.doing('fetch'), 2),
      expect('crate in hand -> serve', () => this.doing('serve'), 15),
      act('', () => this.forget()),
      walk('away', 'never mind!'),
      expect('customer gone mid-carry -> check rejects !go_to counter -> rest', () => this.rejected('!go_to counter') && this.doing('rest'), 4),
      act('', () => (before = this.served)),
      walk('customer', 'all right, I take it'),
      expect('crate already in hand -> serve, no fetch', () => this.doing('serve'), 4),
      expect('handed over', () => this.served > before && !this.holding, 15),
      walk(this.testerStart(), 'back to my spot')
    ]
  }
  controls(): Control[] {
    return [{ label: 'Store door', run: () => (this.storeOpen = !this.storeOpen) }]
  }
  markers(): Marker[] {
    const store = this.spot('store') as Vec3
    const out: Marker[] = [
      box('counter', v3(-3, 0.5, -5), v3(3, 1, 0.6), WOOD, `counter   served: ${this.served}`, true),
      box('bench', v3(-9, 0.25, 5.2), v3(2, 0.5, 0.6), WOOD, 'bench'),
      box('store-back', v3(store.x, 1.4, store.z + 3.6), v3(4, 2.8, 0.2), GREY, undefined, true),
      box('store-l', v3(store.x - 2, 1.4, store.z + 2.3), v3(0.2, 2.8, 2.8), GREY, undefined, true),
      box('store-r', v3(store.x + 2, 1.4, store.z + 2.3), v3(0.2, 2.8, 2.8), GREY, undefined, true),
      box('store-roof', v3(store.x, 2.9, store.z + 2.3), v3(4.4, 0.2, 3), WOOD, this.storeOpen ? 'store: open' : 'store: SHUT'),
      box('crate-stack', v3(store.x, 0.35, store.z + 2.6), v3(0.7, 0.7, 0.7), CRATE)
    ]
    // The door: a panel across the opening when shut, swung aside when open.
    out.push(
      this.storeOpen
        ? box('store-door', v3(store.x - 1.5, 1.2, store.z + 0.4), v3(1, 2.4, 0.12), { r: 0.3, g: 0.75, b: 0.35 })
        : box('store-door', v3(store.x, 1.2, store.z + 0.9), v3(3.8, 2.4, 0.12), { r: 0.85, g: 0.3, b: 0.2 }, undefined, true)
    )
    if (this.holding) {
      const a = this.agent.kinematic.position
      out.push(box('carried', v3(a.x, 2.2, a.z), v3(0.5, 0.5, 0.5), CRATE))
    }
    return out
  }
}
