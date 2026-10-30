// Level 12, the ambush, headless: each rule of the encounter as a scenario on the level's simulation (the real agent
// and planner over stalker.domain, sim time only). The tester stands where a test puts it (its script paused); it is
// the target the stalker sees, smells, hears and catches.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, decomposeDeferred, formatTask, GuardBlackboard, PlanStep, sightRange, v3, Vec3 } from '../../src/htn-planner'
import { stalkerFacts } from '../../src/examples/stalker/stalker-actions'
import { stalkerDomain } from '../../src/examples/stalker/stalker.htn'
import { AMBUSH, AmbushLevel, LIGHT_FACTORS, lureRange } from '../../src/playground/levels/ambush'

const DT = 1 / 30
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z)
const ROUND = [AMBUSH.a, AMBUSH.mid, AMBUSH.b]

function level(): AmbushLevel {
  const l = new AmbushLevel().init()
  l.testerPaused = true
  l.teleportTester(AMBUSH.start)
  return l
}

/** Run until `stop` (checked every frame) or `seconds`; the seconds it ran. */
function run(l: AmbushLevel, seconds: number, stop: () => boolean = () => false, each: () => void = () => {}): number {
  let t = 0
  while (t < seconds) {
    each()
    l.update(DT)
    t += DT
    if (stop()) break
  }
  return t
}

const npc = (l: AmbushLevel) => l.agent.kinematic.position
const noticed = (l: AmbushLevel) => l.noticedAt > -Infinity

test('sight follows the light: lit far, shielded nearer, dark only close; the lure ring only with a light', () => {
  const cfg = { ...new AmbushLevel().init().agent.perception.cfg }
  const at = (light: keyof typeof LIGHT_FACTORS) => sightRange(cfg, { id: 't', position: v3(0, 0, 0), visibility: LIGHT_FACTORS[light] })
  assert.equal(at('lit'), AMBUSH.sight.lit)
  assert.ok(Math.abs(at('shielded') - AMBUSH.sight.shielded) < 1e-9)
  assert.ok(Math.abs(at('dark') - AMBUSH.sight.dark) < 1e-9)
  assert.ok(AMBUSH.sight.lit > AMBUSH.sight.shielded && AMBUSH.sight.shielded > AMBUSH.sight.dark && AMBUSH.sight.dark > AMBUSH.smell)
  assert.ok(lureRange('lit') > AMBUSH.sight.lit && lureRange('shielded') > AMBUSH.sight.shielded)
  assert.equal(lureRange('dark'), 0, 'no light, nothing to glimpse')
  // On the level: a shielded light 8 m in front of it as it peers at the crossing goes unseen, a lit one is seen.
  for (const [light, seen] of [['shielded', false], ['lit', true]] as const) {
    const l = level()
    l.stepOut()
    run(l, 40, () => l.peering())
    l.teleportTester(v3(0, 0, AMBUSH.mid.z - 8))
    l.testerLight = light
    run(l, 2.5, () => noticed(l))
    assert.equal(noticed(l), seen, light)
  }
})

test('the round loops and looks at each waypoint; at the crossing it peers toward the start (the domain)', () => {
  const b = new GuardBlackboard()
  b.setTime(1)
  b.setSelfPosition(v3(0, 0, 0))
  b.setVisible([])
  b.setRoute([AMBUSH.mid, AMBUSH.a, AMBUSH.mid, AMBUSH.b])
  stalkerFacts.setWatching(b.world)
  stalkerFacts.setPatrol(b.world, [3, 3, 3, 3], [AMBUSH.start, null, AMBUSH.start, null])
  const fmt = (plan: readonly PlanStep[]) => plan.map(s => formatTask(s.name, s.args))
  const after = (i: number) => {
    b.setWaypoint(i)
    const plan = decompose(stalkerDomain, b.world, 'behave', []).plan
    assert.equal(fmt(plan)[1], `&after_waypoint ${i}`)
    return fmt(decomposeDeferred(stalkerDomain, b.world, plan[1] as Extract<PlanStep, { kind: 'deferred' }>).plan)
  }
  assert.deepEqual(after(0), ['!peer (0.0 0.0 -12.0) 3.0', '!set_waypoint 1'])
  assert.deepEqual(after(1), ['!look_around 3.0', '!set_waypoint 2'])
  assert.deepEqual(after(2), ['!peer (0.0 0.0 -12.0) 3.0', '!set_waypoint 3'])
  assert.deepEqual(after(3), ['!look_around 3.0', '!set_waypoint 0'], 'round again, never walked off')
})

test('ambush: armed until someone nears the crossing; it steps out at the east end, crosses soon, walks the whole round, never seeing a light outside its ring', () => {
  const l = level()
  run(l, 2)
  assert.equal(l.status, 'armed')
  assert.equal(l.out, false)
  const edge = v3(0, 0, AMBUSH.mid.z - 12.5) // inside the trigger, outside the lure ring
  assert.ok(dist(edge, AMBUSH.mid) < AMBUSH.trigger && dist(edge, AMBUSH.mid) > AMBUSH.lure.lit)
  for (const w of ROUND) assert.ok(dist(edge, w) > AMBUSH.lure.lit, 'outside the ring from every stop')
  l.teleportTester(edge)
  l.testerLight = 'lit'
  run(l, 0.2)
  assert.equal(l.status, 'active')
  assert.ok(dist(npc(l), AMBUSH.entry) < 1, 'out of the dark at the east end')
  const toCrossing = run(l, 40, () => dist(npc(l), AMBUSH.mid) < 1)
  assert.ok(toCrossing < 25, `at the crossing in ${toCrossing.toFixed(0)} s`)
  const visited = new Set<string>()
  run(l, 120, () => false, () => {
    for (const [k, w] of [['A', AMBUSH.a], ['MID', AMBUSH.mid], ['B', AMBUSH.b]] as const) if (dist(npc(l), w) < 1) visited.add(k)
  })
  assert.deepEqual([...visited].sort(), ['A', 'B', 'MID'], 'the whole round')
  assert.equal(noticed(l), false, 'a light out of its reach is not noticed')
  assert.equal(l.lures, 0)
  assert.equal(l.out, true, 'still on the lane')
})

test('noticed = caught: a light in front of the crossing is noticed, the chase outruns a run, the run fails', () => {
  assert.ok(AMBUSH.chase.speed > AMBUSH.playerRun)
  const l = level()
  l.stepOut()
  run(l, 40, () => l.peering())
  l.teleportTester(v3(0, 0, AMBUSH.mid.z - 6))
  l.testerLight = 'lit'
  run(l, 30, () => l.fails > 0)
  assert.ok(noticed(l))
  assert.equal(l.fails, 1, 'caught: the run failed')
  assert.ok(l.lastChaseSpeed > AMBUSH.playerRun, `chased at ${l.lastChaseSpeed.toFixed(1)} m/s`)
  assert.equal(l.status, 'armed')
  assert.equal(l.out, false, 'gone')
  assert.ok(dist(l.tester.position, AMBUSH.start) < 0.01, 'back at the start')
  assert.equal(l.testerLight, 'dark')
})

test('smell: in the dark, right on its heels it senses the target and turns', () => {
  const l = level()
  l.stepOut()
  run(l, 40, () => dist(npc(l), AMBUSH.mid) < 1)
  run(l, 4, () => l.agent.currentAction === '!move_to' && dist(npc(l), AMBUSH.mid) > 1) // on toward A
  assert.equal(l.testerLight, 'dark')
  run(l, 6, () => noticed(l), () => {
    const k = l.agent.kinematic
    l.teleportTester(v3(k.position.x - Math.sin(k.yaw) * 1.5, 0, k.position.z - Math.cos(k.yaw) * 1.5))
  })
  assert.ok(noticed(l), 'smelled')
  assert.ok(l.agent.perception.senses().some(s => s.id === 'tester' && s.by === 'presence'), 'by its nose, not its eyes')
})

test('a stone knocking near it draws it off to look; then it goes on with its round', () => {
  const l = level()
  l.stepOut()
  run(l, 20)
  const at = npc(l)
  l.noise('impact', v3(at.x + 3, 0.2, at.z - 3), 8) // ~4.2 m off, radius 8: heard at ~0.47, not a startle
  run(l, 4, () => l.doing('investigate_noise'))
  assert.ok(l.doing('investigate_noise'), l.chosen)
  run(l, 40, () => l.doing('walk_route'))
  assert.ok(l.doing('walk_route'), 'back on its round')
  assert.equal(noticed(l), false)
})

test('a new run puts it away and arms the trigger again', () => {
  const l = level()
  l.stepOut()
  run(l, 1)
  assert.equal(l.out, true)
  l.rearm()
  assert.equal(l.out, false)
  run(l, 1)
  assert.equal(l.status, 'armed')
  l.teleportTester(v3(0, 0, -8))
  run(l, 0.2)
  assert.equal(l.out, true, 'and it steps out again')
})

test('no capture loop: caught past the lane, back at the light it does not step out again', () => {
  const l = level()
  l.stepOut()
  run(l, 40, () => l.peering())
  l.teleportTester(v3(-1.5, 0, AMBUSH.light.z))
  run(l, 0.2)
  assert.equal(l.status, 'passed')
  l.teleportTester(v3(0, 0, AMBUSH.mid.z - 6))
  l.testerLight = 'lit'
  run(l, 30, () => l.fails > 0)
  assert.equal(l.fails, 1)
  assert.equal(l.status, 'passed')
  assert.ok(dist(l.tester.position, v3(-1.5, 0, AMBUSH.light.z)) < 0.01, 'back at the checkpoint, the light')
  run(l, 15)
  assert.equal(l.out, false, 'nobody out beside the respawn spot')
  assert.equal(l.fails, 1)
  assert.equal(l.catches, 1)
})

test('no capture loop: caught, back at the start the trigger waits until nobody stands in it', () => {
  const l = level()
  l.stepOut()
  run(l, 40, () => l.peering())
  l.player = v3(0, 0, -8) // you stand in the trigger zone (a visitor is not moved), dark
  l.teleportTester(v3(0, 0, AMBUSH.mid.z - 6))
  l.testerLight = 'lit'
  run(l, 30, () => l.fails > 0)
  assert.equal(l.fails, 1)
  run(l, 10)
  assert.equal(l.out, false, 'you are still in the trigger: it stays away')
  l.player = v3(0, 0, -12.5)
  run(l, 0.5)
  l.player = v3(0, 0, -8)
  run(l, 0.2)
  assert.equal(l.out, true, 'a fresh approach brings it out')
})

test('the lure ring: a light glimpsed beyond its sight draws it over to look, not a chase', () => {
  const l = level()
  l.stepOut()
  run(l, 40, () => l.peering())
  const spot = v3(0, 0, AMBUSH.mid.z - 11) // beyond lit sight (9), inside the ring (12)
  l.teleportTester(spot)
  l.testerLight = 'lit'
  run(l, 8, () => l.doing('investigate_noise') || noticed(l))
  assert.ok(l.doing('investigate_noise'), `it comes to look (${l.chosen})`)
  assert.equal(l.lures, 1)
  assert.equal(noticed(l), false, 'not noticed from the ring alone')
  assert.equal(l.agent.blackboard.heardNoise?.kind, 'light')
})

test('at the crossing it always stops and peers toward where people come (head only)', () => {
  const l = level()
  l.stepOut()
  let stops = 0
  let peered = 0
  let wasAt = false
  run(l, 90, () => false, () => {
    const here = dist(npc(l), AMBUSH.mid) < 0.6 && l.agent.currentAction === '!peer'
    if (here && !wasAt) stops++
    if (l.peering()) peered++
    wasAt = here
  })
  assert.ok(stops >= 2, `stopped at the crossing ${stops} times`)
  assert.ok(peered > 30, 'peered toward the start with the head')
})

test('the tester script passes its round with you standing by in the dark, off the way', () => {
  const l = new AmbushLevel().init()
  while (l.round <= 1 && l.time < 300) {
    l.player = v3(12, 0, -11) // in a corner, outside the trigger
    l.update(DT)
  }
  assert.ok(l.round > 1)
  assert.deepEqual(l.checkLog.filter(c => c.state === 'fail').map(c => c.label), [])
})
