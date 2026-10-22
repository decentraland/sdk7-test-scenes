// Stalker hearing of src/examples/stalker/stalker.domain, the domain on its own (no actor, no ECS). A decision is
// the agent's: the belief upkeep (`reasoning`) to its fixpoint, applied to the board, then `behave` (./decide.ts).
// What the frozen flat domain did as a whole bookkeeping plan (e.g. [!forget_noise 9.0]) is upkeep here, and the
// decision after it comes in the same replan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GuardBlackboard } from '../../src/htn-planner/npc/blackboard'
import { stalkerFacts } from '../../src/examples/stalker/stalker-actions'
import { stalkerDomain } from '../../src/examples/stalker/stalker.htn'
import { v3 } from '../../src/htn-planner/npc/vec'
import { decide } from './decide'

// ---- the domain on its own -------------------------------------------------------------------

function board(setup: (b: GuardBlackboard) => void): GuardBlackboard {
  const b = new GuardBlackboard()
  b.setTime(10)
  b.setSelfPosition(v3(0, 0, 0))
  b.setVisible([])
  setup(b)
  return b
}
const decision = (b: GuardBlackboard) => decide(stalkerDomain, b)
const plan = (b: GuardBlackboard) => decision(b).plan
const seen = (b: GuardBlackboard, p = v3(0, 0, 12)) => b.setVisible([{ id: 'player', position: p, distance: 12 }])
const heard = (b: GuardBlackboard, time = 9, position = v3(8, 0, 0)) => {
  b.hear({ kind: 'impact', position, time, loudness: 0.5 })
  b.setAlert('alarmed')
}

const heardStep = (b: GuardBlackboard, time = 9, position = v3(8, 0, 0), loudness = 0.3) => {
  b.hear({ kind: 'steps', position, time, loudness })
  b.setAlert('wary')
}
const playerKinds = (b: GuardBlackboard) => stalkerFacts.setPlayerNoiseKinds(b.world, ['steps', 'run', 'land'])

const START = ['!hear (8.0 0.0 0.0) 9.0', '!stand 0.5', '!face (8.0 0.0 0.0)', '!stand 1.2', '!watch']
const GO_LOOK = ['!watch', '!face (8.0 0.0 0.0)', '!move_to (8.0 0.0 0.0) walk', '!look_around 4.0', '!forget_noise 9.0', '!unfocus']

test('stalker hearing domain: a new noise → start, turn to it, listen, watch; focused on it → walk there, look, resume', () => {
  const b = board(b => heard(b))
  assert.deepEqual(plan(b), START)
  stalkerFacts.setFocus(b.world, 9)
  assert.deepEqual(plan(b), GO_LOOK, 'a replan mid-investigation goes on without the start again')
  heard(b, 11, v3(8, 0, 0)) // a second stone (focus still on the first)
  assert.equal(plan(b)[0], '!hear (8.0 0.0 0.0) 11.0', 'a new noise gets its own start')
  b.forgetNoise()
  assert.deepEqual(decision(b), { upkeep: ['!unfocus'], plan: ['!stand 1.0'] }, 'focus without a noise is dropped')
})

test('stalker hearing domain: on his route (before watching, an unnoticed target in sight) a noise pulls him off it', () => {
  const b = board(b => {
    b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
    stalkerFacts.setWatchPoint(b.world, 0)
    seen(b)
    heard(b)
  })
  assert.deepEqual(plan(b), START)
  b.forgetNoise()
  assert.deepEqual(plan(b), ['!move_to (0.0 0.0 4.0) walk', '&after_waypoint 0'], 'then the route again')
})

test('stalker hearing domain: seeing the target he hunts, a noise is dropped and the chase goes on', () => {
  const b = board(b => {
    stalkerFacts.setNoticed(b.world, 'player')
    seen(b)
    heard(b)
  })
  assert.deepEqual(decision(b), { upkeep: ['!forget_noise 9.0'], plan: ['!chase player', '!catch player', '!stand 2.0'] })
})

test('stalker hearing domain: watching and seeing an unnoticed target, he notices it, not the noise', () => {
  const b = board(b => {
    stalkerFacts.setWatching(b.world)
    seen(b)
    heard(b)
  })
  assert.equal(plan(b)[0], '!notice player')
})

test('stalker hearing domain: a noise heard before he lost sight is stale; one heard after it wins over the search', () => {
  const before = board(b => {
    stalkerFacts.setNoticed(b.world, 'player')
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 9.5 })
    heard(b, 9)
  })
  assert.deepEqual(decision(before), { upkeep: ['!forget_noise 9.0'], plan: ['!move_to (5.0 0.0 6.0) hurry', '!look_around 3.0', '!forget player', '!give_up player (5.0 0.0 6.0)'] })
  const after = board(b => {
    stalkerFacts.setNoticed(b.world, 'player')
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 8 })
    heard(b, 9)
  })
  assert.deepEqual(plan(after), START)
  after.forgetNoise()
  assert.equal(plan(after)[0], '!move_to (5.0 0.0 6.0) hurry', 'then the search of the last seen spot')
})

test('stalker hearing domain: an old noise is forgotten; after giving up he ignores noises', () => {
  const stale = board(b => {
    heard(b, 9)
    b.setTime(40)
  })
  assert.deepEqual(decision(stale), { upkeep: ['!forget_noise 9.0'], plan: ['!stand 1.0'] })
  const leaving = board(b => {
    stalkerFacts.setGaveUp(b.world, 'player', v3(30, 0, 30))
    heard(b)
  })
  assert.deepEqual(plan(leaving), ['!move_to (30.0 0.0 30.0) walk', '!despawn'])
  assert.equal(leaving.world.rows('focus', 1).length, 0)
})

test("stalker hearing domain: the player's footstep → the same start; the next one while investigating re-targets without a start", () => {
  const b = board(b => {
    playerKinds(b)
    heardStep(b)
  })
  assert.deepEqual(plan(b), START, 'a footstep starts the same investigation as the stone')
  stalkerFacts.setFocus(b.world, 9)
  heardStep(b, 9.5, v3(8, 0, 2))
  assert.deepEqual(plan(b), [
    '!refocus 9.5', '!watch', '!face (8.0 0.0 2.0)', '!move_to (8.0 0.0 2.0) walk', '!look_around 4.0', '!forget_noise 9.5', '!unfocus'
  ])
  heard(b, 10, v3(8, 0, 0)) // a stone while investigating: its own start, as before
  assert.equal(plan(b)[0], '!hear (8.0 0.0 0.0) 10.0')
})

test('stalker hearing domain: a loud noise close by → spin round at once; hunting a lost target, footsteps → hurry after them', () => {
  const loud = board(b => {
    playerKinds(b)
    heardStep(b, 9, v3(-3, 0, 0), 0.7)
  })
  assert.deepEqual(plan(loud), ['!hear (-3.0 0.0 0.0) 9.0', '!face (-3.0 0.0 0.0) quick', '!watch'])
  const hunting = board(b => {
    playerKinds(b)
    stalkerFacts.setNoticed(b.world, 'player')
    b.remember({ id: 'player', position: v3(5, 0, 6), time: 8 })
    heardStep(b, 9, v3(8, 0, 0))
  })
  assert.deepEqual(plan(hunting), [
    '!refocus 9.0', '!face (8.0 0.0 0.0) quick', '!move_to (8.0 0.0 0.0) hurry', '!look_around 4.0', '!forget_noise 9.0', '!unfocus'
  ])
})

test("stalker hearing domain: on the crossing before it watches, the player's noise does not cut the reveal short", () => {
  const crossing = (b: GuardBlackboard) => {
    playerKinds(b)
    b.setRoute([v3(0, 0, 4), v3(0, 0, 16)])
    stalkerFacts.setWatchPoint(b.world, 0)
    heardStep(b, 9, v3(8, 0, 0), 0.8)
  }
  assert.deepEqual(decision(board(crossing)), { upkeep: ['!forget_noise 9.0'], plan: ['!move_to (0.0 0.0 4.0) walk', '&after_waypoint 0'] })
  const watching = board(crossing)
  stalkerFacts.setWatching(watching.world)
  assert.equal(plan(watching)[0], '!hear (8.0 0.0 0.0) 9.0', 'once he watches, he hears it')
})
