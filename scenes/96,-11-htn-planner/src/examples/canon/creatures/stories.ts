// The SS14 creature family (mouse, grazer, pet follower, hostile mob), the host and the stories (paper prototype;
// src/examples/canon/paper.ts). The scenarios are the files in worlds/<creature>/. Sources, licence and what was not
// ported: the .domain headers. Run a story: npm run htn:run -- --story mouse/a-hungry-mouse-eats-then-idles
import { float, int, sym } from '../../../htn-planner'
import type { Atom, WorldState } from '../../../htn-planner'
import { addFacts, drop, first, num, story } from '../paper'
import type { PaperHost, Story } from '../paper'

/** `(distance_to ?entity ?metres)`: one row per entity. */
export function setDistance(w: WorldState, entity: Atom, metres: number): void {
  drop(w, 'distance_to', 2, entity)
  w.add('distance_to', entity, float(metres))
}

/** Seconds `!idle_wait` waits in a story: the minimum (the real executor rolls between min and max). */
const idleSeconds = (args: readonly Atom[]) => num(args[0])

/**
 * The creatures' executors, as world effects, on the story clock (`(now ?t)` before every plan):
 * - `!move_near ?e ?range`: the creature ends `?range` metres from ?e; `!move_to ?spot`: at the spot (no fact);
 * - `!idle_wait ?min ?max`: the real executor writes `(idle_until ?t)` when it starts and the host removes it when
 *   the time is up; a story step lasts the whole wait (the minimum), so no plan sees it running (a scenario writes
 *   it to show a replan mid-wait); `!wait_until ?t`: lasts until ?t, then the timer is gone;
 * - `!consume ?item`: the item is gone, the need it served is full (100);
 * - `!melee_attack ?t`: one hit: `(health ?t ?hp)` drops by 1; at 0 the target is no longer hostile;
 * - `!unbuckle`, `!unpull`, `!escape_container`: the body state fact is gone.
 */
export const CREATURE_HOST: PaperHost = {
  clock: true,
  effects: {
    '!move_near': ([e, range], w) => setDistance(w, e, num(range)),
    '!wait_until': (_args, w) => drop(w, 'idle_until', 1),
    '!consume': ([item], w) => {
      const need = w.rows('food', 1).some(r => r[0].v === item.v) ? 'hunger' : 'thirst'
      drop(w, 'food', 1, item)
      drop(w, 'drink', 1, item)
      drop(w, 'distance_to', 2, item)
      drop(w, 'satiation', 2, sym(need))
      w.add('satiation', sym(need), int(100))
    },
    '!melee_attack': ([target], w) => {
      const hp = num(w.rows('health', 2).find(r => r[0].v === target.v)?.[1]) - 1
      drop(w, 'health', 2, target)
      if (hp > 0) w.add('health', target, float(hp))
      else {
        drop(w, 'hostile', 1, target)
        drop(w, 'distance_to', 2, target)
      }
    },
    '!unbuckle': (_args, w) => drop(w, 'buckled', 0),
    '!unpull': (_args, w) => drop(w, 'pulled', 0),
    '!escape_container': (_args, w) => drop(w, 'in_container', 0)
  },
  duration: (name, args, now) => (name === '!idle_wait' ? idleSeconds(args) : name === '!wait_until' ? Math.max(0, num(args[0]) - now) : 1),
  sense: (w, now) => {
    if (num(first(w, 'idle_until', 1)?.[0]) <= now) drop(w, 'idle_until', 1)
  }
}

export const CREATURE_STORIES: Story[] = [
  story({
    station: 'mouse',
    name: 'a hungry mouse eats, then idles',
    blurb: 'it walks to the cheese and eats; a replan right after the walk plans the rest of the running plan (mid-plan resume)',
    facts: 'satiation hunger 30\nsatiation thirst 80\nfood cheese\ndistance_to cheese 4.0\nidle_spot spot_a',
    method: 'behave',
    host: CREATURE_HOST,
    maxSteps: 4,
    events: [{ afterStep: 1, note: 'perception tick', replan: true }],
    expect: [
      'plan: !move_near cheese 1.0, !consume cheese',
      'run !move_near cheese 1.0',
      'event: perception tick',
      'keep: !consume cheese',
      'run !consume cheese',
      'plan: !move_to spot_a, !idle_wait 2.0 7.0',
      'run !move_to spot_a',
      'run !idle_wait 2.0 7.0',
      'stop: 4 steps'
    ]
  }),
  story({
    station: 'pet_follower',
    name: 'the leader walks off, the pet catches up',
    blurb: 'a pet loiters by its leader; the leader walks 10 m away and the replan follows',
    facts: 'leader owner\ndistance_to owner 2.0\nfollow_spot owner spot_near',
    method: 'behave',
    host: CREATURE_HOST,
    maxSteps: 4,
    events: [{ afterStep: 1, note: 'owner walks 10 m away', edit: w => setDistance(w, sym('owner'), 10), replan: true }],
    expect: [
      'plan: !move_to spot_near, !idle_wait 2.0 7.0',
      'run !move_to spot_near',
      'event: owner walks 10 m away',
      'switch: !move_near owner 3.0',
      'run !move_near owner 3.0',
      'plan: !move_to spot_near, !idle_wait 2.0 7.0',
      'run !move_to spot_near',
      'run !idle_wait 2.0 7.0',
      'stop: 4 steps'
    ]
  }),
  story({
    station: 'pet_follower',
    name: 'a replan mid-wait keeps waiting',
    blurb: 'a pet replanned in the middle of an idle wait keeps waiting until the timer ends',
    facts: 'leader owner\ndistance_to owner 2.0\nfollow_spot owner spot_near\nidle_until 4.5',
    method: 'behave',
    host: CREATURE_HOST,
    start: 2,
    maxSteps: 2,
    expect: [
      'plan: !wait_until 4.5',
      'run !wait_until 4.5',
      'plan: !move_to spot_near, !idle_wait 2.0 7.0',
      'run !move_to spot_near',
      'stop: 2 steps'
    ]
  }),
  story({
    station: 'hostile_mob',
    name: 'the melee ladder, one rung per plan',
    blurb: 'buckled, pulled and shut in: the mob frees itself one rung per plan, then fights until the target is down',
    facts: 'buckled\npulled\nin_container\nhostile player\ndistance_to player 5.0\nhealth player 2.0\nidle_spot spot_a',
    method: 'behave',
    host: CREATURE_HOST,
    until: w => w.rows('hostile', 1).length === 0,
    expect: [
      'plan: !unbuckle',
      'run !unbuckle',
      'plan: !unpull',
      'run !unpull',
      'plan: !escape_container',
      'run !escape_container',
      'plan: !move_near player 1.0, !juke_away player, !melee_attack player',
      'run !move_near player 1.0',
      'run !juke_away player',
      'run !melee_attack player',
      'plan: !juke_away player, !melee_attack player',
      'run !juke_away player',
      'run !melee_attack player',
      'until: done'
    ]
  }),
  story({
    station: 'grazer',
    name: 'a grazer turns on its attacker',
    blurb: 'a wolf bites before the first plan: fight back, then back to grazing',
    facts: 'satiation hunger 30\nfood grass\ndistance_to grass 2.0\nidle_spot spot_a',
    method: 'behave',
    host: CREATURE_HOST,
    maxSteps: 5,
    events: [{ afterStep: 0, note: 'a wolf bites', edit: w => void addFacts(w, 'hostile wolf\ndistance_to wolf 0.5'), replan: true }],
    expect: [
      'event: a wolf bites',
      'plan: !juke_away wolf, !melee_attack wolf',
      'run !juke_away wolf',
      'run !melee_attack wolf',
      'plan: !move_near grass 1.0, !consume grass',
      'run !move_near grass 1.0',
      'run !consume grass',
      'plan: !move_to spot_a, !idle_wait 2.0 7.0',
      'run !move_to spot_a',
      'stop: 5 steps'
    ]
  })
]
