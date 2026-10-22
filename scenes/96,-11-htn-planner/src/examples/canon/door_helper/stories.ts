// RAE's door helper (domain_nav.py), the host and the stories (paper prototype; src/examples/canon/paper.ts). Two
// robots, a hall and two rooms; door d1 between the hall and room_a, an open passage between room_a and room_b. The
// scenarios (worlds/door_helper/) are the world states of one fetch, hop by hop. Sources, licence, emulations and what
// was not ported: door_helper.domain's header. Run a story: npm run htn:run -- --story door_helper/a-spring-door-learned-by-a-failed-pass
import { sym } from '../../../htn-planner'
import type { Atom, WorldState } from '../../../htn-planner'
import { drop, has, story } from '../paper'
import type { PaperHost, Story } from '../paper'

/** The map, the robots and the job every scenario starts from. The route table is the host's path query. */
export const DOOR_MAP = `
self r1
robot r1
robot r2
door d1 hall room_a
door d1 room_a hall
route hall room_a room_a
route hall room_b room_a
route room_a hall hall
route room_a room_b room_b
route room_b room_a room_a
route room_b hall room_a
job fetch box hall
`

const setAt = (w: WorldState, r: Atom, place: Atom) => {
  drop(w, 'at', 2, r)
  w.add('at', r, place)
}
const SPRING = sym('spring')
/** What the door really is: the host knows (`(true_door_type ?d ?type)`), the domain only once it is learned. */
const trueType = (w: WorldState, d: Atom) => w.rows('true_door_type', 2).find(r => r[0].v === d.v)?.[1]
const learn = (w: WorldState, d: Atom) => {
  const t = trueType(w, d)
  if (t === undefined || w.rows('door_type', 2).some(r => r[0].v === d.v)) return
  w.add('door_type', d, t)
}

/**
 * The robots' executors, as world effects (RAE's commands):
 * - `!move ?r ?to`, `!come_to ?h ?place`: `(at ...)`;
 * - `!unlatch ?r ?d`: `(door_open ?d)`; `!hold_door ?r ?d`: needs it open, writes `(door_held ?d ?r)` and
 *   `(holding_door ?r ?d)`; `!release_door`: removes both, and a spring door shuts;
 * - `!pass_door ?r ?d ?to`: needs the door open; a spring door nobody holds shuts in the robot's face: the step fails
 *   and the robot learns `(door_type ?d spring)` (RAE: `passDoor` sets the door type); else the robot is through and
 *   learns the type too;
 * - `!take`, `!put`: `(holding ?r ?obj)` / `(object_at ?obj ?place)`; `!claim ?h ?by` / `!release ?h`: `(claimed ...)`
 *   and `(status ?h busy|free)`; `!help_robot ?h ?r`: the collision is over.
 */
export const DOOR_HOST: PaperHost = {
  effects: {
    '!move': ([r, to], w) => setAt(w, r, to),
    '!come_to': ([h, place], w) => setAt(w, h, place),
    '!unlatch': ([, d], w) => {
      if (!has(w, 'door_open', d)) w.add('door_open', d)
    },
    '!hold_door': ([r, d], w) => {
      if (!has(w, 'door_open', d)) return false
      w.add('door_held', d, r)
      w.add('holding_door', r, d)
    },
    '!release_door': ([r, d], w) => {
      drop(w, 'door_held', 2, d)
      drop(w, 'holding_door', 2, r)
      w.removeWhere('crossing_cleanup', 3, row => row[0].v === r.v && row[1].v === r.v && row[2].v === d.v)
      if (trueType(w, d)?.v === SPRING.v) drop(w, 'door_open', 1, d)
    },
    '!pass_door': ([r, d, to], w) => {
      if (!has(w, 'door_open', d)) return false
      learn(w, d)
      if (trueType(w, d)?.v === SPRING.v && w.rows('door_held', 2).every(row => row[0].v !== d.v)) {
        drop(w, 'door_open', 1, d)
        return false
      }
      setAt(w, r, to)
      for (const [door, holder] of w.rows('door_held', 2)) {
        if (door.v === d.v && (holder.v === r.v || has(w, 'claimed', holder, r))) {
          if (!has(w, 'crossing_cleanup', r, holder, d)) w.add('crossing_cleanup', r, holder, d)
        }
      }
    },
    '!take': ([r, obj], w) => {
      if (w.rows('holding', 2).some(row => row[0].v === r.v)) return false
      drop(w, 'object_at', 2, obj)
      w.add('holding', r, obj)
    },
    '!put': ([r, obj], w) => {
      const place = w.rows('at', 2).find(row => row[0].v === r.v)?.[1]
      drop(w, 'holding', 2, r)
      if (place !== undefined) w.add('object_at', obj, place)
    },
    '!claim': ([h, by], w) => {
      drop(w, 'status', 2, h)
      w.add('status', h, sym('busy'))
      w.add('claimed', h, by)
    },
    '!release': ([h], w) => {
      w.removeWhere('crossing_cleanup', 3, row => row[1].v === h.v && has(w, 'claimed', h, row[0]))
      drop(w, 'claimed', 2, h)
      drop(w, 'status', 2, h)
      w.add('status', h, sym('free'))
    },
    '!help_robot': ([, r], w) => drop(w, 'collided', 1, r)
  }
}

/** The job is done: the box is in the hall. */
export const delivered = (w: WorldState) => has(w, 'object_at', sym('box'), sym('hall'))

export const DOOR_HELPER_STORIES: Story[] = [
  story({
    station: 'door_helper',
    name: 'a spring door learned by a failed pass',
    blurb: 'an unknown door turns out to be a spring door; carrying, the robot needs a teammate to hold it',
    facts: DOOR_MAP + `true_door_type d1 spring
status r1 free
status r2 free
at r1 hall
at r2 room_b
object_at box room_b
holding r2 crate`,
    method: 'behave',
    host: DOOR_HOST,
    until: delivered,
    show: ['status'],
    expect: [
      'plan: !unlatch r1 d1, !pass_door r1 d1 room_a, &fetch r1 box hall',
      'run !unlatch r1 d1',
      'fail !pass_door r1 d1 room_a',
      'plan: !unlatch r1 d1, !hold_door r1 d1, !pass_door r1 d1 room_a, !release_door r1 d1, &fetch r1 box hall',
      'run !unlatch r1 d1',
      'run !hold_door r1 d1',
      'run !pass_door r1 d1 room_a',
      'run !release_door r1 d1',
      'expand &fetch r1 box hall: !move r1 room_b, &fetch r1 box hall',
      'run !move r1 room_b',
      'expand &fetch r1 box hall: !take r1 box, &fetch r1 box hall',
      'run !take r1 box',
      'expand &fetch r1 box hall: !move r1 room_a, &fetch r1 box hall',
      'run !move r1 room_a',
      'expand &fetch r1 box hall: !claim r2 r1, !put r2 crate, !come_to r2 room_a, &cross_doorway r1 d1 hall, &fetch r1 box hall',
      'run !claim r2 r1',
      'run !put r2 crate',
      'run !come_to r2 room_a',
      'expand &cross_doorway r1 d1 hall: !unlatch r2 d1, !hold_door r2 d1, !pass_door r1 d1 hall, !release_door r2 d1, !release r2',
      'run !unlatch r2 d1',
      'run !hold_door r2 d1',
      'run !pass_door r1 d1 hall',
      'run !release_door r2 d1',
      'run !release r2',
      'expand &fetch r1 box hall: !put r1 box',
      'run !put r1 box',
      'until: done',
      'status: r1 free, r2 free'
    ]
  }),
  story({
    station: 'door_helper',
    name: 'a collision pre-empts the job',
    blurb: 'the helper is released after the collision and the job resumes where it was',
    facts: DOOR_MAP + `true_door_type d1 ordinary
status r1 free
status r2 free
at r1 room_b
at r2 room_b
object_at box room_b`,
    method: 'behave',
    host: DOOR_HOST,
    until: delivered,
    events: [{ afterStep: 2, note: 'r1 bumps into a wall', edit: w => void w.add('collided', sym('r1')), replan: true }],
    expect: [
      'plan: !take r1 box, &fetch r1 box hall',
      'run !take r1 box',
      'expand &fetch r1 box hall: !move r1 room_a, &fetch r1 box hall',
      'run !move r1 room_a',
      'event: r1 bumps into a wall',
      'switch: !claim r2 r1, !come_to r2 room_a, &recover r1 r2',
      'run !claim r2 r1',
      'run !come_to r2 room_a',
      'expand &recover r1 r2: !help_robot r2 r1, !release r2',
      'run !help_robot r2 r1',
      'run !release r2',
      'plan: !put r1 box, !unlatch r1 d1, !take r1 box, !pass_door r1 d1 hall, &fetch r1 box hall',
      'run !put r1 box',
      'run !unlatch r1 d1',
      'run !take r1 box',
      'run !pass_door r1 d1 hall',
      'expand &fetch r1 box hall: !put r1 box',
      'run !put r1 box',
      'until: done'
    ]
  }),
  story({
    station: 'door_helper',
    name: 'nobody free: wait for a teammate',
    blurb: 'loaded at a spring door with nobody free, the robot waits until a teammate is free',
    facts: DOOR_MAP + `true_door_type d1 spring
door_type d1 spring
status r1 free
status r2 busy
at r1 room_a
at r2 room_b
holding r1 box`,
    method: 'behave',
    host: DOOR_HOST,
    until: delivered,
    events: [{ afterStep: 2, note: 'r2 finished its own job', edit: w => {
      drop(w, 'status', 2, sym('r2'))
      w.add('status', sym('r2'), sym('free'))
    }, replan: true }],
    expect: [
      'plan: !wait 1.0, &fetch r1 box hall',
      'run !wait 1.0',
      'expand &fetch r1 box hall: !wait 1.0, &fetch r1 box hall',
      'run !wait 1.0',
      'event: r2 finished its own job',
      'switch: !claim r2 r1, !come_to r2 room_a, &cross_doorway r1 d1 hall, &fetch r1 box hall',
      'run !claim r2 r1',
      'run !come_to r2 room_a',
      'expand &cross_doorway r1 d1 hall: !unlatch r2 d1, !hold_door r2 d1, !pass_door r1 d1 hall, !release_door r2 d1, !release r2',
      'run !unlatch r2 d1',
      'run !hold_door r2 d1',
      'run !pass_door r1 d1 hall',
      'run !release_door r2 d1',
      'run !release r2',
      'expand &fetch r1 box hall: !put r1 box',
      'run !put r1 box',
      'until: done'
    ]
  })
]
