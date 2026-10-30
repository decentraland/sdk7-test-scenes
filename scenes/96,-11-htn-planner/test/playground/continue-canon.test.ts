// Canonical domains on the real LevelSim -> GuardAgent -> PlanRunner path, not PaperHost.
// These deterministic test executors have duration, movement and fact effects. They do not implement
// !continue or plan markers: GuardAgent owns those. This is Node host execution, not SDK/Explorer verification.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { float, formatTask, sym } from '../../src/htn-planner/htn/atom'
import type { DomainIR } from '../../src/htn-planner/htn/ir'
import type { ActionFactory, ActionRegistry, GuardEvent } from '../../src/htn-planner/npc/actions'
import { ACTIVE_PLAN_FACT, GuardAgent, RUNNING_FACT } from '../../src/htn-planner/npc/agent'
import { PlanRunner } from '../../src/htn-planner/htn/planner'
import { LevelSim, type AgentSetup, type LevelInfo, type TesterStep } from '../../src/playground/sim'
import { compileDomainFile } from '../../tools/htn/compiler'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
function domain(file: string): DomainIR {
  const result = compileDomainFile(path.join(ROOT, 'src/examples/canon', file))
  assert.ok(result.ok, result.diagnostics.map(d => d.message).join('\n'))
  return result.ir
}
const TURRET = domain('sentry_turret/sentry_turret.domain')
const SWARM = domain('swarm/swarm_drone.domain')
const DT = 0.05

class CanonicalLevel extends LevelSim {
  readonly info: LevelInfo = { id: 'canonical-continue-test', number: 0, title: 'Node integration fixture', source: '', lesson: [], watch: '' }
  readonly events: GuardEvent[] = []
  readonly started: string[] = []
  readonly cancelled: string[] = []
  readonly completed: string[] = []
  readonly progress = new Map<string, number>()
  threats = ['a']
  role: [string, string] | null = ['collector', 'r1']
  enemy: string | null = null
  holding: string | null = null
  above: string | null = null
  readonly delivered: string[] = []
  readonly shots: string[] = []
  weapon = 'bullets'

  readonly continueTask: string | undefined
  constructor(readonly kind: 'turret' | 'swarm', enabled = true) {
    super()
    this.continueTask = enabled ? '!continue' : undefined
    this.observer = event => this.events.push(event)
    this.testerPaused = true
  }
  protected agentSetup(): AgentSetup {
    return { domain: this.kind === 'turret' ? TURRET : SWARM, start: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, route: [], continueTask: this.continueTask }
  }
  protected testerStart() { return { x: 0, y: 0, z: -10 } }
  protected testerScript(): TesterStep[] { return [] }
  spots() { return {} }
  protected facts(agent: GuardAgent): string {
    const w = agent.blackboard.world
    if (this.kind === 'turret') {
      w.clear('threat', 2); w.clear('distance_to', 2); w.clear('line_of_fire', 1); w.clear('wielded', 1)
      for (const id of this.threats) {
        w.add('threat', sym(id), sym('humanoid')); w.add('distance_to', sym(id), float(10)); w.add('line_of_fire', sym(id))
      }
      w.add('wielded', sym(this.weapon))
      return this.threats.join(',')
    }
    w.clear('role', 2); w.clear('enemy', 1); w.clear('holding', 1); w.clear('above', 1); w.clear('processor', 1)
    if (this.role) w.add('role', ...this.role.map(sym))
    if (this.enemy) w.add('enemy', sym(this.enemy))
    if (this.holding) w.add('holding', sym(this.holding))
    if (this.above) w.add('above', sym(this.above))
    w.add('processor', sym('m1'))
    // External assignments/enemies request replans; an executor's own effects are read by the next plan.
    return JSON.stringify([this.role, this.enemy])
  }
  private work(name: string, seconds: number, effect: (args: readonly string[]) => void = () => {}, travel = 0): ActionFactory {
    return (args, ctx) => {
      const key = formatTask(name, args)
      const values = args.map(a => { assert.ok(a.t === 'sym' || a.t === 'str'); return a.v })
      let elapsed = 0
      const finish = () => { this.completed.push(key); effect(values); return 'done' as const }
      return {
        start: () => { this.started.push(key); this.progress.set(key, 0); return seconds === 0 ? finish() : 'running' },
        update: dt => {
          elapsed += dt
          this.progress.set(key, elapsed)
          ctx.kinematic.position.x += dt * travel
          return elapsed >= seconds - 1e-9 ? finish() : 'running'
        },
        cancel: () => { this.cancelled.push(key) }
      }
    }
  }
  protected actions(): ActionRegistry {
    return this.kind === 'turret' ? {
      '!switch_weapon': this.work('!switch_weapon', 0, ([weapon]) => { this.weapon = weapon }),
      '!aim_at': this.work('!aim_at', 0.2),
      '!fire': this.work('!fire', 1, ([, target]) => { this.shots.push(target); this.threats = this.threats.filter(id => id !== target) }),
      '!sweep': () => ({ start: () => 'running', update: () => 'running', cancel: () => {} })
    } : {
      '!fly_over': this.work('!fly_over', 0.6, ([resource]) => { this.above = resource }, 2),
      '!descend': this.work('!descend', 0.2),
      '!grab': this.work('!grab', 0, ([resource]) => { this.holding = resource }),
      '!climb': this.work('!climb', 0.2),
      '!fly_to': this.work('!fly_to', 0.4, () => {}, 2),
      '!release': this.work('!release', 0, ([resource]) => { this.delivered.push(resource); this.holding = null; this.role = null }),
      '!follow': this.work('!follow', 10, () => {}, 1),
      '!hover': () => ({ start: () => 'running', update: () => 'running', cancel: () => {} }),
      '!intercept': this.work('!intercept', 0.3, () => {}, 2),
      '!sting': this.work('!sting', 0.2),
      '!evade': this.work('!evade', 0.2)
    }
  }
  rows(name: string, arity: number): string[] { return this.agent.blackboard.world.rows(name, arity).map(row => formatTask('', row).trim()) }
  continued() { return this.events.filter(event => event.type === 'replan' && event.continued).length }
  diagnostics() { return this.events.filter(event => event.type === 'diagnostic') }
}

function until(level: CanonicalLevel, condition: () => boolean, seconds = 3) {
  for (let i = 0; i < seconds / DT; i++) {
    level.update(DT)
    if (condition()) return
  }
  assert.fail('condition not reached; started: ' + level.started.join(', '))
}
function firing(level: CanonicalLevel) { until(level, () => level.agent.currentAction === '!fire') }
function flying(level: CanonicalLevel) { until(level, () => level.agent.currentAction === '!fly_over') }
function noConventionFacts(level: CanonicalLevel) {
  for (const name of [ACTIVE_PLAN_FACT, RUNNING_FACT])
    for (let arity = 0; arity <= 3; arity++) assert.deepEqual(level.rows(name, arity), [], `${name}/${arity} cleaned up`)
}

test('canonical turret on LevelSim: target ranking keeps fire progress; loss cancels it; replacement executes and clears markers', () => {
  const level = new CanonicalLevel('turret').init()
  try {
    firing(level)
    const before = level.progress.get('!fire bullets a')!
    level.threats = ['b', 'a']
    level.advanceTime(0.25, DT)
    assert.ok(level.continued() > 0, 'the forwarded real GuardAgent option kept the running plan')
    assert.equal(level.started.filter(s => s === '!fire bullets a').length, 1)
    assert.ok(level.progress.get('!fire bullets a')! > before)
    assert.deepEqual(level.cancelled, [])
    assert.deepEqual(level.rows(ACTIVE_PLAN_FACT, 2), ['attack a'])
    level.threats = ['b']
    level.update(DT)
    assert.deepEqual(level.cancelled, ['!fire bullets a'])
    assert.deepEqual(level.rows(ACTIVE_PLAN_FACT, 2), ['attack b'])
    until(level, () => level.shots.includes('b') && level.rows(ACTIVE_PLAN_FACT, 2).length === 0)
    assert.deepEqual(level.shots, ['b'], 'a cancelled fire has no shot effect')
    assert.ok(level.events.some(e => e.type === 'step_end' && e.name === '!end_plan' && e.status === 'done'))
    assert.deepEqual(level.diagnostics(), [])
  } finally { level.agent.stop() }
  noConventionFacts(level)
})

test('canonical turret ablation: same domain and sensor change, continueTask unset cancels fire instead of keeping it', () => {
  const on = new CanonicalLevel('turret').init()
  const off = new CanonicalLevel('turret', false).init()
  try {
    assert.equal(off.continueTask, undefined)
    for (const level of [on, off]) { firing(level); level.threats = ['b', 'a']; level.advanceTime(0.25, DT) }
    assert.ok(on.continued() > 0)
    assert.equal(off.continued(), 0)
    assert.deepEqual(on.cancelled, [])
    assert.ok(off.cancelled.includes('!fire bullets a'))
    assert.deepEqual(off.rows(ACTIVE_PLAN_FACT, 2), [])
    assert.ok(off.started.includes('!aim_at b'))
  } finally { on.agent.stop(); off.agent.stop() }
})

test('canonical swarm on LevelSim: a continued collector moves, grabs and delivers once; end markers and reset clean up', () => {
  const level = new CanonicalLevel('swarm').init()
  try {
    flying(level)
    const position = level.agent.kinematic.position.x
    level.agent.requestReplan('periodic reassessment', true)
    level.advanceTime(0.2, DT)
    assert.equal(level.started.filter(s => s === '!fly_over r1').length, 1)
    assert.ok(level.agent.kinematic.position.x > position, 'the actual executor keeps moving')
    assert.ok(level.continued() > 0)
    until(level, () => level.delivered.length === 1 && level.rows(ACTIVE_PLAN_FACT, 2).length === 0)
    assert.deepEqual(level.completed, ['!fly_over r1', '!descend r1', '!grab r1', '!climb', '!fly_to m1', '!release r1 m1'])
    assert.deepEqual(level.delivered, ['r1'])
    assert.equal(level.holding, null)
    assert.deepEqual(level.cancelled, [])
    assert.deepEqual(level.diagnostics(), [])
    const old = level.agent
    level.reset()
    assert.notEqual(level.agent, old)
    assert.deepEqual(old.blackboard.world.rows(ACTIVE_PLAN_FACT, 2), [])
    assert.deepEqual(old.blackboard.world.rows(RUNNING_FACT, 2), [])
  } finally { level.agent.stop() }
  noConventionFacts(level)
})

test('canonical swarm ablation: periodic replan keeps collector progress only with the real continueTask option', () => {
  const on = new CanonicalLevel('swarm').init()
  const off = new CanonicalLevel('swarm', false).init()
  try {
    for (const level of [on, off]) {
      flying(level)
      for (let i = 0; i < 4; i++) { level.agent.requestReplan('periodic reassessment', true); level.advanceTime(0.05, DT) }
    }
    assert.ok(on.continued() > 0)
    assert.equal(off.continued(), 0)
    assert.equal(on.started.filter(s => s === '!fly_over r1').length, 1)
    assert.ok(off.cancelled.includes('!fly_over r1'))
    assert.ok(on.agent.kinematic.position.x > off.agent.kinematic.position.x, 'continued work advances instead of restarting behind the marker')
  } finally { on.agent.stop(); off.agent.stop() }
})

test('canonical swarm on LevelSim: role and enemy changes replace work; reload and reset cancel executors and clear old facts', () => {
  const level = new CanonicalLevel('swarm').init()
  try {
    flying(level)
    level.role = ['follower', 'leader']
    until(level, () => level.agent.currentAction === '!follow')
    assert.ok(level.cancelled.includes('!fly_over r1'))
    assert.deepEqual(level.rows(ACTIVE_PLAN_FACT, 2), ['follow_swarm_leader leader'])
    level.enemy = 'intruder'
    until(level, () => level.agent.currentAction === '!intercept')
    assert.ok(level.cancelled.includes('!follow leader'))
    assert.deepEqual(level.rows(ACTIVE_PLAN_FACT, 2), ['attack_run intruder'])
    level.agent.reload(world => new PlanRunner(SWARM, world))
    assert.ok(level.cancelled.includes('!intercept intruder'))
    noConventionFacts(level)
    until(level, () => level.agent.currentAction === '!intercept')
    const old = level.agent
    level.reset()
    assert.notEqual(level.agent, old)
    assert.deepEqual(old.blackboard.world.rows(ACTIVE_PLAN_FACT, 2), [])
    assert.deepEqual(old.blackboard.world.rows(RUNNING_FACT, 2), [])
    assert.equal(level.cancelled.filter(s => s === '!intercept intruder').length, 2)
  } finally { level.agent.stop() }
})
