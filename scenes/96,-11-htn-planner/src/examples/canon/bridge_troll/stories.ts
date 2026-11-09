// Bridge troll v1-v6, the host and the stories (paper prototype; src/examples/canon/paper.ts): stories that replay each
// step's lesson with a simulated host. The scenarios are the files in worlds/<step>/; the .domain headers say what
// each step teaches and what changed. Source: Humphreys, Game AI Pro ch. 12 (re-expressed) and bevy_htn troll.htn
// (MIT); see the domain headers and ../THIRD_PARTY_NOTICES.md.
// Run a story: npm run htn:run -- --story v3_rearm/the-trunk-breaks-and-the-troll-rearms
import { int, sym } from '../../../htn-planner'
import type { WorldState } from '../../../htn-planner'
import { count, drop, story, text } from '../paper'
import type { PaperHost, StoryEvent, Story } from '../paper'

/** The patrol route the host walks the troll along; !check_bridge moves `next_bridge` to the following one. */
export const TROLL_ROUTE = ['north_bridge', 'south_bridge']

/** Slams a fresh trunk has (the chapter's "breaks after three attacks"). */
export const TRUNK_HITS = 3

interface TrollRules {
  /** v5+: slams charge `power_up`, the whirlwind spends it. */
  power?: boolean
  /** v5_tired+: attacks write `tired`, !recover clears it. */
  tired?: boolean
  /** v6: walking to a visible enemy puts it `enemy_in_reach`. */
  reach?: boolean
}

/** The troll's executors reduced to the facts they write (only the facts its version's domain reads). */
export function trollHost(rules: TrollRules = {}): PaperHost {
  const add = (w: WorldState, name: string, delta: number) => {
    if (w.rows(name, 1).length > 0) w.set(name, int(count(w, name) + delta))
  }
  return {
    effects: {
      '!navigate_to': ([target], w) => {
        const enemy = w.rows('enemy_visible', 1).some(r => text(r[0]) === text(target))
        if (rules.reach && enemy && !w.rows('enemy_in_reach', 1).some(r => text(r[0]) === text(target))) w.add('enemy_in_reach', target)
      },
      '!trunk_slam': (_args, w) => {
        add(w, 'trunk_health', -1)
        if (rules.power) add(w, 'power_up', 1)
        if (rules.tired) w.set('tired')
      },
      '!whirlwind': (_args, w) => {
        if (rules.power) w.set('power_up', int(0))
        if (rules.tired) w.set('tired')
      },
      '!recover': (_args, w) => {
        if (rules.tired) w.clear('tired', 0)
      },
      '!uproot_trunk': ([tree], w) => {
        w.set('trunk_health', int(TRUNK_HITS))
        drop(w, 'trunk_nearby', 1, tree)
      },
      '!check_bridge': ([bridge], w) => {
        const at = TROLL_ROUTE.indexOf(text(bridge))
        w.set('next_bridge', sym(TROLL_ROUTE[(at + 1) % TROLL_ROUTE.length]))
      }
    }
  }
}

/** World pieces the stories share. */
const PATROL = 'next_bridge north_bridge'
const KNIGHT = 'enemy_visible knight'

const enemyAppears = (w: WorldState) => w.add('enemy_visible', sym('knight'))

/** The combo story's world and event, the same for the bug and the fix. */
const COMBO_WORLD = `${KNIGHT}\ntrunk_health 3\npower_up 2\n${PATROL}`
const STAGGER: StoryEvent = { afterStep: 2, note: 'the knight staggers (a sensor update; the host replans)', replan: true }

const V1 = trollHost()
const V3 = trollHost()
const V4 = trollHost()
const V5_BUG = trollHost({ power: true })
const V5_TIRED = trollHost({ power: true, tired: true })
const V6 = trollHost({ power: true, tired: true, reach: true })

export const TROLL_STORIES: Story[] = [
  story({
    station: 'v1_priority',
    name: 'an enemy interrupts the patrol',
    blurb: 'the host replans when the knight comes into sight; the higher branch wins',
    method: 'be_troll',
    facts: PATROL,
    host: V1,
    events: [{ afterStep: 1, note: 'a knight comes into sight', edit: enemyAppears, replan: true }],
    maxSteps: 3,
    expect: [
      'plan: !navigate_to north_bridge, !check_bridge north_bridge',
      'run !navigate_to north_bridge',
      'event: a knight comes into sight',
      'switch: !navigate_to knight, !trunk_slam knight',
      'run !navigate_to knight',
      'run !trunk_slam knight',
      'stop: 3 steps'
    ]
  }),
  story({
    station: 'v1_priority',
    name: 'the patrol walks the route',
    blurb: 'the host moves next_bridge on after each check',
    method: 'be_troll',
    facts: PATROL,
    host: V1,
    maxSteps: 4,
    expect: [
      'plan: !navigate_to north_bridge, !check_bridge north_bridge',
      'run !navigate_to north_bridge',
      'run !check_bridge north_bridge',
      'plan: !navigate_to south_bridge, !check_bridge south_bridge',
      'run !navigate_to south_bridge',
      'run !check_bridge south_bridge',
      'stop: 4 steps'
    ]
  }),
  story({
    station: 'v3_rearm',
    name: 'the trunk breaks and the troll rearms',
    blurb: 'the last slam spends the trunk; the next plan rearms, and the deferred attack reads the fresh trunk',
    method: 'be_troll',
    facts: `${KNIGHT}\ntrunk_health 1\ntrunk_nearby old_oak`,
    host: V3,
    maxSteps: 6,
    expect: [
      'plan: !navigate_to knight, !trunk_slam knight',
      'run !navigate_to knight',
      'run !trunk_slam knight',
      'plan: !navigate_to old_oak, !uproot_trunk old_oak, &attack_enemy knight',
      'run !navigate_to old_oak',
      'run !uproot_trunk old_oak',
      'expand &attack_enemy knight: !navigate_to knight, !trunk_slam knight',
      'run !navigate_to knight',
      'run !trunk_slam knight',
      'stop: 6 steps'
    ]
  }),
  story({
    station: 'v4_last_seen',
    name: 'found again: roar, then fight',
    blurb: 'the knight is back in sight on arrival; the deferred step roars',
    method: 'be_troll',
    facts: `enemy_last_seen knight ford\ntrunk_health 3\n${PATROL}`,
    host: V4,
    events: [
      {
        afterStep: 1,
        note: 'the knight is in sight again',
        edit: w => {
          drop(w, 'enemy_last_seen', 2, sym('knight'))
          enemyAppears(w)
        }
      }
    ],
    maxSteps: 3,
    expect: [
      'plan: !navigate_to ford, &regain_sight knight',
      'run !navigate_to ford',
      'event: the knight is in sight again',
      'expand &regain_sight knight: !roar knight',
      'run !roar knight',
      'plan: !navigate_to knight, !trunk_slam knight',
      'run !navigate_to knight',
      'stop: 3 steps'
    ]
  }),
  story({
    station: 'v4_last_seen',
    name: 'gone: catch breath, then patrol',
    blurb: 'nobody at the ford; the troll catches its breath until the host forgets the sighting',
    method: 'be_troll',
    facts: `enemy_last_seen knight ford\ntrunk_health 3\n${PATROL}`,
    host: V4,
    events: [{ afterStep: 2, note: 'the sighting is too old (the host drops it)', edit: w => drop(w, 'enemy_last_seen', 2, sym('knight')) }],
    maxSteps: 3,
    expect: [
      'plan: !navigate_to ford, &regain_sight knight',
      'run !navigate_to ford',
      'expand &regain_sight knight: !catch_breath',
      'run !catch_breath',
      'event: the sighting is too old (the host drops it)',
      'plan: !navigate_to north_bridge, !check_bridge north_bridge',
      'run !navigate_to north_bridge',
      'stop: 3 steps'
    ]
  }),
  story({
    station: 'v5_combo_bug',
    name: 'combo skips the recovery',
    blurb: 'the bug: after the third slam a replan picks the whirlwind and cuts the running !recover',
    method: 'be_troll',
    facts: COMBO_WORLD,
    host: V5_BUG,
    events: [STAGGER],
    maxSteps: 4,
    expect: [
      'plan: !navigate_to knight, !trunk_slam knight, !recover',
      'run !navigate_to knight',
      'run !trunk_slam knight',
      'event: the knight staggers (a sensor update; the host replans)',
      'switch: !navigate_to knight, !whirlwind knight, !recover',
      'run !navigate_to knight',
      'run !whirlwind knight',
      'stop: 4 steps'
    ]
  }),
  story({
    station: 'v5_tired',
    name: 'the recovery survives the replan',
    blurb: 'the fix: the same replan plans [!recover], the rest of the running plan, so the host keeps it',
    method: 'be_troll',
    facts: COMBO_WORLD,
    host: V5_TIRED,
    events: [STAGGER],
    maxSteps: 5,
    expect: [
      'plan: !navigate_to knight, !trunk_slam knight, !recover',
      'run !navigate_to knight',
      'run !trunk_slam knight',
      'event: the knight staggers (a sensor update; the host replans)',
      'keep: !recover',
      'run !recover',
      'plan: !navigate_to knight, !whirlwind knight, !recover',
      'run !navigate_to knight',
      'run !whirlwind knight',
      'stop: 5 steps'
    ]
  }),
  story({
    station: 'v6_partial_plans',
    name: 'walk, then swing',
    blurb: 'the walk is a plan of its own; on arrival the next plan swings; when the knight steps back, it walks again',
    method: 'be_troll',
    facts: `${KNIGHT}\ntrunk_health 3\npower_up 0\n${PATROL}`,
    host: V6,
    events: [{ afterStep: 3, note: 'the knight steps back out of reach', edit: w => drop(w, 'enemy_in_reach', 1, sym('knight')) }],
    maxSteps: 5,
    expect: [
      'plan: !navigate_to knight',
      'run !navigate_to knight',
      'plan: !trunk_slam knight, !recover',
      'run !trunk_slam knight',
      'run !recover',
      'event: the knight steps back out of reach',
      'plan: !navigate_to knight',
      'run !navigate_to knight',
      'plan: !trunk_slam knight, !recover',
      'run !trunk_slam knight',
      'stop: 5 steps'
    ]
  }),
  story({
    station: 'v6_partial_plans',
    name: 'the knight flees: chase',
    blurb: 'sight lost on the way; the root falls to the chase branch',
    method: 'be_troll',
    facts: `${KNIGHT}\ntrunk_health 3\npower_up 0\n${PATROL}`,
    host: V6,
    events: [
      {
        afterStep: 1,
        note: 'the knight runs out of sight at the ford',
        edit: w => {
          drop(w, 'enemy_visible', 1, sym('knight'))
          drop(w, 'enemy_in_reach', 1, sym('knight'))
          w.add('enemy_last_seen', sym('knight'), sym('ford'))
        }
      }
    ],
    maxSteps: 3,
    expect: [
      'plan: !navigate_to knight',
      'run !navigate_to knight',
      'event: the knight runs out of sight at the ford',
      'plan: !navigate_to ford, &regain_sight knight',
      'run !navigate_to ford',
      'expand &regain_sight knight: !catch_breath',
      'run !catch_breath',
      'stop: 3 steps'
    ]
  })
]
