// Upstream use case: AI director pacing (docs/USE_CASES.md:90-107). A world-level domain chooses the pacing from
// facts (intensity, cooldown, spawn points, player position): high intensity, a recovery phase; low intensity and
// the cooldown over, the next encounter. Spawning and spending reinforcements are host actions run after the plan
// is chosen (:104-106); the host owns the cadence (:106). Upstream ships no director demo (:107); the host here is
// the test's own. Domain: src/examples/usecases/director.domain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { float, formatTask, int, sym } from '../../src/htn-planner/htn/atom'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { WorldState } from '../../src/htn-planner/htn/world-state'
import { directorDomain } from '../../src/examples/usecases/director.htn'

class Director {
  readonly world = new WorldState()
  readonly runner = new PlanRunner(directorDomain, this.world, { onDiagnostic: d => assert.fail(d.message) })
  now = 0
  intensity = 0
  cooldownUntil = 0
  reinforcements = 3
  phase = 'calm'
  playerNear: string[] = []
  readonly spawned: { point: string; at: number }[] = []
  /** Enemies of the waves alive: each one raises the intensity until it is beaten. */
  enemies = 0

  /** Publish the facts, plan, run the plan's steps. Returns the plan ([] for a successful empty one). */
  decide(): string[] {
    const w = this.world
    w.clearAll()
    w.add('intensity', float(this.intensity))
    w.add('now', float(this.now))
    w.add('cooldown_until', float(this.cooldownUntil))
    w.add('reinforcements', int(this.reinforcements))
    for (const p of ['north', 'east', 'south']) w.add('spawn_point', sym(p))
    for (const p of this.playerNear) w.add('player_near', sym(p))
    assert.equal(this.runner.plan('direct'), 'succeeded')
    const plan = this.runner.steps.map(s => formatTask(s.name, s.args))
    while (this.runner.resolve() === 'ready') {
      const step = this.runner.current()!
      const arg = step.args[0]
      if (step.name === '!start_phase') this.phase = String(arg.v)
      else if (step.name === '!start_cooldown') this.cooldownUntil = this.now + Number(arg.v)
      else if (step.name === '!spawn_wave') {
        this.spawned.push({ point: String(arg.v), at: this.now })
        this.reinforcements--
        this.enemies += 4
      } else assert.fail(`unknown step ${step.name}`)
      this.runner.complete()
    }
    return plan
  }
}

test('director: high intensity -> recovery; low intensity during the cooldown -> nothing; cooldown over -> encounter', () => {
  const d = new Director()
  d.intensity = 0.9
  assert.deepEqual(d.decide(), ['!start_phase recovery', '!start_cooldown 8.0'])
  assert.equal(d.phase, 'recovery')
  assert.equal(d.cooldownUntil, 8)

  // Calm again, but the cooldown runs: a successful empty plan (nothing to do), not a failure.
  d.intensity = 0.2
  d.now = 3
  assert.deepEqual(d.decide(), [])
  assert.equal(d.spawned.length, 0)

  // Cooldown over: the next encounter, away from the player (north is near the player).
  d.now = 9
  d.playerNear = ['north']
  assert.deepEqual(d.decide(), ['!start_phase encounter', '!spawn_wave east', '!start_cooldown 20.0'])
  assert.deepEqual(d.spawned, [{ point: 'east', at: 9 }])
  assert.equal(d.reinforcements, 2)

  // In between (0.3..0.7) the director leaves the pace alone.
  d.intensity = 0.5
  d.now = 40
  assert.deepEqual(d.decide(), [])

  // No reinforcements left: no encounter; the player near every point: none either.
  d.intensity = 0.1
  d.reinforcements = 0
  assert.deepEqual(d.decide(), [])
  d.reinforcements = 1
  d.playerNear = ['north', 'east', 'south']
  assert.deepEqual(d.decide(), [])
  assert.equal(d.spawned.length, 1)
})

test('director: a paced session, planned once a second, alternates encounters and recovery; spawns only by the host', () => {
  const d = new Director()
  d.reinforcements = 4
  const phases: string[] = []
  for (let second = 0; second < 240; second++) {
    d.now = second
    // A toy fight: every live enemy raises the intensity, one enemy is beaten every 3 s, the intensity decays.
    if (d.enemies > 0 && second % 3 === 0) d.enemies--
    d.intensity = Math.max(0, Math.min(1, d.intensity + 0.1 * d.enemies - (d.phase === 'recovery' ? 0.08 : 0.04)))
    const plan = d.decide()
    if (plan.length > 0 && (phases.length === 0 || phases[phases.length - 1] !== d.phase)) phases.push(d.phase)
  }
  // Every encounter (but the last wave's) builds up to a recovery phase.
  assert.deepEqual(phases, ['encounter', 'recovery', 'encounter', 'recovery', 'encounter', 'recovery', 'encounter', 'recovery'])
  assert.equal(d.spawned.length, 4, 'one wave per encounter plan, all reinforcements used')
  assert.equal(d.reinforcements, 0)
  // Each wave came after the previous cooldown: at least 20 s apart.
  for (let i = 1; i < d.spawned.length; i++) assert.ok(d.spawned[i].at - d.spawned[i - 1].at >= 20)
})
