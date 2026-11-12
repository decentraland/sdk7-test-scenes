// RAE's fetch robot (domain_fetch.py), the host and the stories (paper prototype; src/examples/canon/paper.ts). Four
// places in a line, l1 - l2 - l3 - l4, one step apart; the charger starts at l1; a full battery is 4 and a move costs
// its distance (nothing while the robot carries the charger). The scenarios (worlds/fetcher/) are world states along
// a search, a recharge and an emergency. Sources, licence, emulations and what was not ported: fetcher.domain's
// header. Run a story: npm run htn:run -- --story fetcher/search-place-by-place
import { int, sym } from '../../../htn-planner'
import type { Atom, WorldState } from '../../../htn-planner'
import { drop, first, has, num, story } from '../paper'
import type { PaperHost, SimpleStory, Story } from '../paper'

const PLACES = ['l1', 'l2', 'l3', 'l4']

/** The host's distance table (every pair, both ways, zeros included) and the job. */
export const FETCH_MAP =
  PLACES.flatMap((a, i) => PLACES.map((b, j) => `distance ${a} ${b} ${Math.abs(i - j)}`)).join('\n') + '\njob fetch o1\n'

const CHARGER = sym('charger')
const here = (w: WorldState) => first(w, 'at', 1)?.[0]
const battery = (w: WorldState) => num(first(w, 'battery', 1)?.[0])
const setBattery = (w: WorldState, units: number) => {
  w.clear('battery', 1)
  w.add('battery', int(units))
}
const distance = (w: WorldState, a: Atom, b: Atom) => num(w.rows('distance', 3).find(r => r[0].v === a.v && r[1].v === b.v)?.[2])

/**
 * The robot's executors, as world effects (RAE's commands):
 * - `!move_to ?place`: costs the distance in battery unless the robot holds the charger; fails without the charge;
 * - `!perceive ?place`: the place is seen; what the host knows is there (`(true_object_at ?obj ?place)`) becomes
 *   `(object_at ?obj ?place)`;
 * - `!take ?thing` / `!put ?thing`: the one hand (`(holding ?thing)`); the charger is `(charger_at ?place)` when down;
 * - `!charge`: the battery is full (4);
 * - `!ask_for_charger ?r`: robot ?r puts the charger down where it is (`(robot_at ?r ?place)`) and lends it
 *   (`(borrowed_charger ?r)`); `!hand_back_charger ?r`: ?r takes it back;
 * - `!address_emergency ?place ?id`: the emergency is over.
 */
export const FETCH_HOST: PaperHost = {
  effects: {
    '!move_to': ([to], w) => {
      const from = here(w)
      if (from === undefined) return false
      if (!has(w, 'holding', CHARGER)) {
        const cost = distance(w, from, to)
        if (!(battery(w) >= cost)) return false
        setBattery(w, battery(w) - cost)
      }
      w.clear('at', 1)
      w.add('at', to)
    },
    '!perceive': ([place], w) => {
      drop(w, 'unviewed', 1, place)
      for (const [obj, at] of w.rows('true_object_at', 2)) if (at.v === place.v && !has(w, 'object_at', obj, place)) w.add('object_at', obj, place)
    },
    '!take': ([thing], w) => {
      if (w.rows('holding', 1).length > 0) return false
      if (thing.v === CHARGER.v) w.clear('charger_at', 1)
      else drop(w, 'object_at', 2, thing)
      w.add('holding', thing)
    },
    '!put': ([thing], w) => {
      const place = here(w)
      w.clear('holding', 1)
      if (place === undefined) return
      if (thing.v === CHARGER.v) w.add('charger_at', place)
      else w.add('object_at', thing, place)
    },
    '!charge': (args, w) => setBattery(w, 4),
    '!ask_for_charger': ([r], w) => {
      const place = w.rows('robot_at', 2).find(row => row[0].v === r.v)?.[1]
      if (place === undefined) return false
      drop(w, 'charger_with', 1, r)
      w.add('charger_at', place)
      w.add('borrowed_charger', r)
    },
    '!hand_back_charger': ([r], w) => {
      w.clear('borrowed_charger', 1)
      w.clear('charger_at', 1)
      w.add('charger_with', r)
    },
    '!address_emergency': ([, id], w) => void w.removeWhere('emergency', 2, row => row[1].v === id.v)
  }
}

/** The job is done: the robot holds the object. */
export const fetched = (w: WorldState) => has(w, 'holding', sym('o1'))

/** A fetch story: the map plus `extra`, until the robot holds the object. */
const fetch = (s: Pick<SimpleStory, 'name' | 'blurb' | 'events' | 'expect'> & { extra: string }): Story =>
  story({ station: 'fetcher', facts: FETCH_MAP + s.extra, method: 'behave', host: FETCH_HOST, until: fetched, ...s })

export const FETCHER_STORIES: Story[] = [
  fetch({
    name: 'search place by place',
    blurb: 'short of battery, recharge and take the charger along; found at the last place',
    extra: `at l1
battery 4
charger_at l1
unviewed l2
unviewed l3
unviewed l4
true_object_at o1 l4`,
    expect: [
      'plan: !move_to l2, !perceive l2, &fetch o1',
      'run !move_to l2',
      'run !perceive l2',
      'expand &fetch o1: !move_to l3, !perceive l3, &fetch o1',
      'run !move_to l3',
      'run !perceive l3',
      'expand &fetch o1: !move_to l1, &recharge l4, &travel_to l4, !perceive l4, &fetch o1',
      'run !move_to l1',
      'expand &recharge l4: !charge, !take charger',
      'run !charge',
      'run !take charger',
      'expand &travel_to l4: !move_to l4',
      'run !move_to l4',
      'run !perceive l4',
      'expand &fetch o1: !put charger, !take o1',
      'run !put charger',
      'run !take o1',
      'until: done'
    ]
  }),
  fetch({
    name: 'an emergency pre-empts the search',
    blurb: 'afterwards the search resumes with the places already seen',
    extra: `at l1
battery 4
charger_at l1
unviewed l2
unviewed l3
unviewed l4
true_object_at o1 l3`,
    events: [{ afterStep: 2, note: 'emergency e7 at l1', edit: w => void w.add('emergency', sym('l1'), sym('e7')), replan: true }],
    expect: [
      'plan: !move_to l2, !perceive l2, &fetch o1',
      'run !move_to l2',
      'run !perceive l2',
      'event: emergency e7 at l1',
      'switch: !move_to l1, !address_emergency l1 e7',
      'run !move_to l1',
      'run !address_emergency l1 e7',
      'plan: !charge, !take charger, &travel_to l3, !perceive l3, &fetch o1',
      'run !charge',
      'run !take charger',
      'expand &travel_to l3: !move_to l3',
      'run !move_to l3',
      'run !perceive l3',
      'expand &fetch o1: !put charger, !take o1',
      'run !put charger',
      'run !take o1',
      'until: done'
    ]
  }),
  fetch({
    name: 'a borrowed charger',
    blurb: 'the charger is with another robot: it puts it down, the robot charges there and hands it back',
    extra: `at l1
battery 1
charger_with r2
robot_at r2 l2
object_at o1 l4`,
    expect: [
      'plan: !ask_for_charger r2, &recharge l4, &travel_to l4, &fetch o1',
      'run !ask_for_charger r2',
      'expand &recharge l4: !move_to l2, &recharge l4',
      'run !move_to l2',
      'expand &recharge l4: !charge, !hand_back_charger r2',
      'run !charge',
      'run !hand_back_charger r2',
      'expand &travel_to l4: !move_to l4',
      'run !move_to l4',
      'expand &fetch o1: !take o1',
      'run !take o1',
      'until: done'
    ]
  })
]
