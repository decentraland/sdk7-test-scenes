// The classics (textbook and benchmark HTN examples), the hosts and the stories (paper prototype;
// src/examples/canon/paper.ts). The scenarios are the files in worlds/commuter/ and worlds/hunter/.
// - Commuter: GTPyhop's travel example (simple_htn.py, simple_htn_acting_error.py; BSD-3-Clause-Clear, see
//   commuter.domain and ../THIRD_PARTY_NOTICES.md). Stories for its acting examples: the taxi that does not come
//   (run_lazy_lookahead plans the same plan again), the taxi that breaks down mid-ride (the source's methods fail
//   there; our re-entrant `travel` gets out and calls another), and both taxis broken (no plan, not a crash).
// - Hunter: the IPC 2020 Snake domain (MIT, see hunter.domain and ../THIRD_PARTY_NOTICES.md). A host that applies
//   the source's action effects after checking the source's action preconditions (an illegal step fails, so a story
//   with no `fail` line is a legal solution of the source problem) and publishes the path sensor; one story per source
//   problem pb01-pb05 hunts every prey.
// Run a story: npm run htn:run -- --story commuter/the-taxi-breaks-down-get-out-call-another
import { float, int, sym } from '../../../htn-planner'
import type { Atom, WorldState } from '../../../htn-planner'
import { first, story, text } from '../paper'
import type { PaperHost, Story } from '../paper'

// ---- commuter ---------------------------------------------------------------------------------------------------

/** The taxis of the source (rigid); the host dispatches the first one that works. */
export const TAXIS = ['taxi1', 'taxi2']

const fare = (dist: number) => 1.5 + 0.5 * dist

/** The distance between two places, either direction (the source's `distance`). */
function distance(w: WorldState, a: string, b: string): number {
  for (const r of w.rows('road', 3)) {
    if ((text(r[0]) === a && text(r[1]) === b) || (text(r[0]) === b && text(r[1]) === a)) return Number(r[2].v)
  }
  return 0
}

/** Replace the rows of a fact keyed by its first argument. */
function setFor(w: WorldState, name: string, key: string, ...rest: (string | number)[]) {
  const args = [sym(key), ...rest.map(v => (typeof v === 'number' ? (Number.isInteger(v) ? int(v) : float(v)) : sym(v)))]
  w.removeWhere(name, args.length, r => text(r[0]) === key)
  w.add(name, ...args)
}

const taxiOf = (w: WorldState, person: string) => text(w.rows('in_taxi', 2).find(r => text(r[0]) === person)?.[1])
const placeOf = (w: WorldState, name: string, key: string) => text(w.rows(name, 2).find(r => text(r[0]) === key)?.[1])
const amount = (w: WorldState, name: string, person: string) => Number(w.rows(name, 2).find(r => text(r[0]) === person)?.[1].v ?? 0)

/** A person's cash, e.g. after a story (the fare is 1.5 + 0.5 x distance). */
export const cashOf = (w: WorldState, person: string) => amount(w, 'cash', person)

/**
 * The commuter's executors reduced to facts (the source's commands c_walk, c_call_taxi, c_ride_taxi, c_pay_driver);
 * a failed call changes nothing, a failed ride broke the taxi; the sensor publishes the taxis known to work, in the
 * host's dispatch order (`taxi_ready`).
 */
export const COMMUTER_HOST: PaperHost = {
  effects: {
    '!walk': ([p, , to], w) => setFor(w, 'at', text(p), text(to)),
    '!call_taxi': ([p, from], w) => {
      const taxi = text(first(w, 'taxi_ready', 1)?.[0])
      setFor(w, 'taxi_at', taxi, text(from))
      w.removeWhere('at', 2, r => text(r[0]) === text(p))
      setFor(w, 'in_taxi', text(p), taxi)
    },
    '!ride_taxi': ([p, to], w) => {
      const taxi = taxiOf(w, text(p))
      const from = placeOf(w, 'taxi_at', taxi)
      setFor(w, 'taxi_at', taxi, text(to))
      setFor(w, 'owe', text(p), fare(distance(w, from, text(to))))
    },
    '!pay_driver': ([p, to], w) => {
      const person = text(p)
      setFor(w, 'cash', person, amount(w, 'cash', person) - amount(w, 'owe', person))
      setFor(w, 'owe', person, 0)
      w.removeWhere('in_taxi', 2, r => text(r[0]) === person)
      setFor(w, 'at', person, text(to))
    },
    '!leave_taxi': ([p, place], w) => {
      w.removeWhere('in_taxi', 2, r => text(r[0]) === text(p))
      setFor(w, 'at', text(p), text(place))
    }
  },
  failures: {
    '!call_taxi': () => {},
    '!ride_taxi': ([p], w) => void w.add('taxi_broken', sym(taxiOf(w, text(p))))
  },
  sense: w => {
    w.clear('taxi_ready', 1)
    const broken = new Set(w.rows('taxi_broken', 1).map(r => text(r[0])))
    for (const t of TAXIS) if (!broken.has(t)) w.add('taxi_ready', sym(t))
  }
}

/** A ride fails when the person's taxi is one of `bad` (the source's `taxi_condition`, known to the world only). */
const badTaxis = (...bad: string[]) => (step: string, w: WorldState) => step.startsWith('!ride_taxi ') && bad.includes(taxiOf(w, step.split(' ')[1]))

const ALICE_TO_PARK = [sym('alice'), sym('park')]

const COMMUTER_STORIES: Story[] = [
  story({
    station: 'commuter',
    name: 'two trips: the source plan',
    blurb: 'GTPyhop plans both trips with simulated effects; here the second trip is deferred and the run gives the same steps',
    from: '1_alice_to_the_park',
    method: 'two_trips',
    args: [sym('alice'), sym('park'), sym('bob'), sym('park')],
    host: COMMUTER_HOST,
    maxSteps: 10,
    show: ['cash'],
    expect: [
      'plan: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park, &travel bob park',
      'run !call_taxi alice home_a',
      'run !ride_taxi alice park',
      'run !pay_driver alice park',
      'expand &travel bob park: !walk bob home_b park',
      'run !walk bob home_b park',
      'plan: &travel bob park',
      'expand &travel bob park: (empty)',
      'cash: bob 15, alice 14.5'
    ]
  }),
  story({
    station: 'commuter',
    name: 'the taxi does not come',
    blurb: 'simple_htn.py with run_lazy_lookahead: the call fails, the replan gives the same plan, then nothing is left',
    from: '1_alice_to_the_park',
    method: 'travel',
    args: ALICE_TO_PARK,
    host: COMMUTER_HOST,
    fails: (step, _w, attempt) => step === '!call_taxi alice home_a' && attempt === 1,
    maxSteps: 10,
    show: ['at'],
    expect: [
      'plan: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park',
      'fail !call_taxi alice home_a',
      'plan: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park',
      'run !call_taxi alice home_a',
      'run !ride_taxi alice park',
      'run !pay_driver alice park',
      'plan: (empty)',
      'at: bob home_b, alice park'
    ]
  }),
  story({
    station: 'commuter',
    name: 'the taxi breaks down: get out, call another',
    blurb: 'simple_htn_acting_error.py with taxi1 bad: the replan from inside the broken taxi picks get_out, then a new trip',
    from: '1_alice_to_the_park',
    method: 'travel',
    args: ALICE_TO_PARK,
    host: COMMUTER_HOST,
    fails: badTaxis('taxi1'),
    maxSteps: 10,
    expect: [
      'plan: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park',
      'run !call_taxi alice home_a',
      'fail !ride_taxi alice park',
      'plan: !leave_taxi alice home_a, &travel alice park',
      'run !leave_taxi alice home_a',
      'expand &travel alice park: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park',
      'run !call_taxi alice home_a',
      'run !ride_taxi alice park',
      'run !pay_driver alice park',
      'plan: (empty)'
    ]
  }),
  story({
    station: 'commuter',
    name: 'both taxis bad: no plan, not a crash',
    blurb: 'simple_htn_acting_error.py state0b: the source raises an error in its methods; ours gets out and ends with no plan',
    from: '1_alice_to_the_park',
    method: 'travel',
    args: ALICE_TO_PARK,
    host: COMMUTER_HOST,
    fails: badTaxis('taxi1', 'taxi2'),
    maxSteps: 10,
    expect: [
      'plan: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park',
      'run !call_taxi alice home_a',
      'fail !ride_taxi alice park',
      'plan: !leave_taxi alice home_a, &travel alice park',
      'run !leave_taxi alice home_a',
      'expand &travel alice park: !call_taxi alice home_a, !ride_taxi alice park, !pay_driver alice park',
      'run !call_taxi alice home_a',
      'fail !ride_taxi alice park',
      'plan: !leave_taxi alice home_a, &travel alice park',
      'run !leave_taxi alice home_a',
      'expand &travel alice park: no plan',
      'no plan (no_plan)'
    ]
  })
]

// ---- hunter -----------------------------------------------------------------------------------------------------

const has = (w: WorldState, name: string, ...args: string[]) => w.rows(name, args.length).some(r => r.every((a, i) => text(a) === args[i]))
const drop = (w: WorldState, name: string, ...args: string[]) => w.removeWhere(name, args.length, r => r.every((a, i) => text(a) === args[i]))
const add = (w: WorldState, name: string, ...args: string[]) => w.add(name, ...args.map(a => sym(a)))

/**
 * Why a step is not legal in this world under the source's action preconditions (domain.hddl), or undefined when
 * it is. The planner does not check step preconditions; the hunter's host does before every step.
 */
export function snakeStepError(step: string, args: readonly Atom[], w: WorldState): string | undefined {
  const a = args.map(text)
  const need = (ok: boolean, what: string) => (ok ? undefined : `${step} ${a.join(' ')}: ${what}`)
  if (step === '!strike') {
    const [snake, headpos, foodpos] = a
    return (
      need(has(w, 'head', snake, headpos), 'head') ??
      need(has(w, 'prey_at', foodpos), 'mouse-at') ??
      need(has(w, 'adjacent', foodpos, headpos), 'adjacent') ??
      need(headpos !== foodpos, 'not =')
    )
  }
  if (step === '!move_short') {
    const [snake, nextpos, snakepos] = a
    return (
      need(has(w, 'head', snake, snakepos), 'head') ??
      need(has(w, 'tail', snake, snakepos), 'tail') ??
      need(has(w, 'adjacent', nextpos, snakepos), 'adjacent') ??
      need(!has(w, 'occupied', nextpos), 'not occupied')
    )
  }
  if (step === '!move_long') {
    const [snake, nextpos, headpos, bodypos, tailpos] = a
    return (
      need(has(w, 'head', snake, headpos), 'head') ??
      need(has(w, 'connected', snake, bodypos, tailpos), 'connected') ??
      need(has(w, 'tail', snake, tailpos), 'tail') ??
      need(has(w, 'adjacent', nextpos, headpos), 'adjacent next') ??
      need(has(w, 'adjacent', bodypos, tailpos), 'adjacent body') ??
      need(!has(w, 'occupied', nextpos), 'not occupied') ??
      need(bodypos !== nextpos && tailpos !== nextpos && headpos !== tailpos, 'not =')
    )
  }
  return `${step}: not a Snake action`
}

/** The source's action effects (domain.hddl: strike, move-short, move-long), applied when the step is legal. */
const SNAKE_EFFECTS: Record<string, (a: string[], w: WorldState) => void> = {
  '!strike': ([snake, headpos, foodpos], w) => {
    drop(w, 'prey_at', foodpos)
    drop(w, 'head', snake, headpos)
    add(w, 'connected', snake, foodpos, headpos)
    add(w, 'head', snake, foodpos)
  },
  '!move_short': ([snake, nextpos, snakepos], w) => {
    drop(w, 'head', snake, snakepos)
    drop(w, 'tail', snake, snakepos)
    add(w, 'occupied', nextpos)
    add(w, 'head', snake, nextpos)
    add(w, 'tail', snake, nextpos)
    drop(w, 'occupied', snakepos)
  },
  '!move_long': ([snake, nextpos, headpos, bodypos, tailpos], w) => {
    drop(w, 'head', snake, headpos)
    add(w, 'head', snake, nextpos)
    drop(w, 'tail', snake, tailpos)
    add(w, 'tail', snake, bodypos)
    drop(w, 'connected', snake, bodypos, tailpos)
    add(w, 'connected', snake, nextpos, headpos)
    add(w, 'occupied', nextpos)
    drop(w, 'occupied', tailpos)
  }
}

/**
 * Host sensor: for each prey, the first cell of a shortest path of free cells from the snake's head to a free cell
 * next to the prey (breadth-first, neighbours in `adjacent` order), as `path_step ?snake ?prey ?next`, nearest prey
 * first. A prey already next to the head, or out of reach, gets no row.
 */
function sensePath(w: WorldState) {
  w.clear('path_step', 3)
  const headRow = w.rows('head', 2)[0]
  if (headRow === undefined) return
  const snake = text(headRow[0])
  const head = text(headRow[1])
  const neighbours = new Map<string, string[]>()
  for (const r of w.rows('adjacent', 2)) {
    const from = text(r[0])
    const list = neighbours.get(from) ?? []
    list.push(text(r[1]))
    neighbours.set(from, list)
  }
  const free = (c: string) => !has(w, 'occupied', c)
  const parent = new Map<string, string>([[head, '']])
  const order: string[] = []
  const queue = [head]
  while (queue.length > 0) {
    const at = queue.shift()!
    for (const n of neighbours.get(at) ?? []) {
      if (parent.has(n) || !free(n)) continue
      parent.set(n, at)
      order.push(n)
      queue.push(n)
    }
  }
  const firstStep = (goal: string) => {
    let c = goal
    while (parent.get(c) !== head) c = parent.get(c)!
    return c
  }
  const found: { prey: string; rank: number; next: string }[] = []
  for (const r of w.rows('prey_at', 1)) {
    const prey = text(r[0])
    if ((neighbours.get(prey) ?? []).includes(head)) continue
    const rank = order.findIndex(c => (neighbours.get(c) ?? []).includes(prey))
    if (rank >= 0) found.push({ prey, rank, next: firstStep(order[rank]) })
  }
  found.sort((x, y) => x.rank - y.rank)
  for (const f of found) add(w, 'path_step', snake, f.prey, f.next)
}

/** The hunter's host: a step the source would not allow fails; a legal one applies the source's effects. */
export const HUNTER_HOST: PaperHost = {
  effects: Object.fromEntries(
    Object.entries(SNAKE_EFFECTS).map(([name, effect]) => [
      name,
      (args: readonly Atom[], w: WorldState) => {
        if (snakeStepError(name, args, w) !== undefined) return false
        effect(args.map(text), w)
      }
    ])
  ),
  sense: sensePath
}

/** The source problems' scenarios (worlds/hunter/), each the start of a story. */
const PROBLEMS: [string, string][] = [
  ['pb01', '1_pb01_start'],
  ['pb02', '3_pb02_long_snake_drags_its_tail'],
  ['pb03', '4_pb03_two_mice_the_nearer_first'],
  ['pb04', '5_pb04_start_around_the_body'],
  ['pb05', '6_pb05_start_four_mice']
]

/** The stories' traces, one per source problem: no `fail` line, so every step was legal in the source. */
const HUNTS: Record<string, string[]> = {
  pb01: [
    'plan: !move_short viper px1y2 px2y2, &hunt',
    'run !move_short viper px1y2 px2y2',
    'expand &hunt: !move_short viper px0y2 px1y2, &hunt',
    'run !move_short viper px0y2 px1y2',
    'expand &hunt: !move_short viper px0y1 px0y2, &hunt',
    'run !move_short viper px0y1 px0y2',
    'expand &hunt: !strike viper px0y1 px0y0, &hunt',
    'run !strike viper px0y1 px0y0',
    'expand &hunt: (empty)',
    'plan: (empty)',
    'prey_at: (none)'
  ],
  pb02: [
    'plan: !move_long viper px1y2 px2y2 px2y2 px2y1, &hunt',
    'run !move_long viper px1y2 px2y2 px2y2 px2y1',
    'expand &hunt: !move_long viper px0y2 px1y2 px1y2 px2y2, &hunt',
    'run !move_long viper px0y2 px1y2 px1y2 px2y2',
    'expand &hunt: !move_long viper px0y1 px0y2 px0y2 px1y2, &hunt',
    'run !move_long viper px0y1 px0y2 px0y2 px1y2',
    'expand &hunt: !strike viper px0y1 px0y0, &hunt',
    'run !strike viper px0y1 px0y0',
    'expand &hunt: (empty)',
    'plan: (empty)',
    'prey_at: (none)'
  ],
  pb03: [
    'plan: !move_short viper px2y1 px2y2, &hunt',
    'run !move_short viper px2y1 px2y2',
    'expand &hunt: !strike viper px2y1 px2y0, &hunt',
    'run !strike viper px2y1 px2y0',
    'expand &hunt: !move_long viper px1y0 px2y0 px2y0 px2y1, &hunt',
    'run !move_long viper px1y0 px2y0 px2y0 px2y1',
    'expand &hunt: !strike viper px1y0 px0y0, &hunt',
    'run !strike viper px1y0 px0y0',
    'expand &hunt: (empty)',
    'plan: (empty)',
    'prey_at: (none)'
  ],
  pb04: [
    'plan: !move_long viper px2y1 px1y1 px1y2 px1y3, &hunt',
    'run !move_long viper px2y1 px1y1 px1y2 px1y3',
    'expand &hunt: !strike viper px2y1 px3y1, &hunt',
    'run !strike viper px2y1 px3y1',
    'expand &hunt: (empty)',
    'plan: (empty)',
    'prey_at: (none)'
  ],
  pb05: [
    'plan: !move_long viper px1y0 px2y0 px2y2 px3y2, &hunt',
    'run !move_long viper px1y0 px2y0 px2y2 px3y2',
    'expand &hunt: !strike viper px1y0 px0y0, &hunt',
    'run !strike viper px1y0 px0y0',
    'expand &hunt: !move_long viper px0y1 px0y0 px2y1 px2y2, &hunt',
    'run !move_long viper px0y1 px0y0 px2y1 px2y2',
    'expand &hunt: !strike viper px0y1 px0y2, &hunt',
    'run !strike viper px0y1 px0y2',
    'expand &hunt: !move_long viper px1y2 px0y2 px2y0 px2y1, &hunt',
    'run !move_long viper px1y2 px0y2 px2y0 px2y1',
    'expand &hunt: !move_long viper px2y2 px1y2 px1y0 px2y0, &hunt',
    'run !move_long viper px2y2 px1y2 px1y0 px2y0',
    'expand &hunt: !move_long viper px3y2 px2y2 px0y0 px1y0, &hunt',
    'run !move_long viper px3y2 px2y2 px0y0 px1y0',
    'expand &hunt: !strike viper px3y2 px4y2, &hunt',
    'run !strike viper px3y2 px4y2',
    'expand &hunt: !move_long viper px4y1 px4y2 px0y1 px0y0, &hunt',
    'run !move_long viper px4y1 px4y2 px0y1 px0y0',
    'expand &hunt: !strike viper px4y1 px4y0, &hunt',
    'run !strike viper px4y1 px4y0',
    'expand &hunt: (empty)',
    'plan: (empty)',
    'prey_at: (none)'
  ]
}

const HUNTER_STORIES: Story[] = PROBLEMS.map(([pb, scenario]) =>
  story({
    station: 'hunter',
    name: `${pb}: hunt every mouse`,
    blurb: `the source problem ${pb}, run to the end: one step per plan, &hunt after each; every step legal in the source`,
    from: scenario,
    method: 'hunt',
    host: HUNTER_HOST,
    maxSteps: 40,
    show: ['prey_at'],
    expect: HUNTS[pb]
  })
)

export const CLASSIC_STORIES: Story[] = [...COMMUTER_STORIES, ...HUNTER_STORIES]
