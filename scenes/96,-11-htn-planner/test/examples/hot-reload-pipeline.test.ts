// Upstream's `--pipeline-self-test` (HTNHotReloadDemo/README.md:110-140, src/HTNHotReloadDemoSelfTest.cpp) on
// GuardAgents, headless: edit and save the validation domain's source, compile a candidate (the active domain does
// not change), reject a broken source, then hot reload eight NPCs mid-walk with deferred calls pending. The client
// side (save / compile / reload / keep the active domain on failure, HTNHotReloadDemo.cpp:169-275) is the small
// `Pipeline` below; the compiler is the Node tool (tools/htn), the swap is GuardAgent.reload (register H16, B13).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { formatTask, PlanRunner, sym, WorldState, type Atom, type DomainIR } from '../../src/htn-planner'
import type { ActionExecutor, ActionFactory, GuardEvent } from '../../src/htn-planner/npc/actions'
import { GuardAgent, type PlannerFactory } from '../../src/htn-planner/npc/agent'
import { CLEAR_LINE_OF_SIGHT } from '../../src/htn-planner/npc/perception'
import { v3 } from '../../src/htn-planner/npc/vec'
import { galleryCallterms, same } from '../../src/examples/upstream/stations'
import { WandererWorld } from '../../src/examples/upstream/gallery/wanderer'
import { HOT_RELOAD_STATION, marker, wandererLocation } from '../../src/examples/upstream/hot-reload'
import { compileDomainSource } from '../../tools/htn/compiler'
import { formatDiagnostic } from '../../tools/htn/diagnostics'

const FIXTURES = join(process.env.HTN_REPO_ROOT ?? process.cwd(), 'test/htn/fixtures/upstream')
const TEMPLATE = readFileSync(join(FIXTURES, 'HTNHotReloadDemo/Validation/Wanderer.domain'), 'utf8')
const revision = (rev: string) => TEMPLATE.split('@REVISION@').join(rev)
const BROKEN = '(:domain InvalidSource (unterminated'

/** The client's reload loop, after HTNHotReloadDemo: one source, one candidate, one active domain. */
class Pipeline {
  active: DomainIR | null = null
  candidate: DomainIR | null = null
  dirty = false
  log: string[] = []
  private source = ''

  constructor(private readonly agents: () => GuardAgent[], private readonly factory: (ir: DomainIR) => PlannerFactory, private readonly topLevel: string) {}

  /** Save Domain: a saved edit invalidates the candidate. */
  save(text: string) {
    this.source = text
    this.candidate = null
    this.dirty = false
  }

  /** Compile Domain: a candidate or the diagnostics; the agents keep the active domain either way. */
  compile(): boolean {
    const include = (path: string) => readFileSync(join(FIXTURES, 'Domains/Includes', basename(path)), 'utf8')
    const r = compileDomainSource('Wanderer.domain', this.source, { readFile: include })
    this.candidate = r.ok ? r.ir : null
    this.log.push(r.ok ? 'compile succeeded' : `compile failed: ${r.diagnostics.map(formatDiagnostic).join('; ')}`)
    return r.ok
  }

  /**
   * Hot Reload: only the last good candidate, and only if it has the entry the agents plan (upstream checks the
   * module's export and ABI; a failed load rolls back to the backup). Otherwise the active domain stays.
   */
  reload(): boolean {
    const next = this.candidate
    if (this.dirty || next === null) return this.reject('no compiled candidate')
    if (next.topLevel[this.topLevel]?.[0] === undefined) return this.reject(`the candidate has no top-level (${this.topLevel})`)
    for (const agent of this.agents()) agent.reload(this.factory(next))
    this.active = next
    this.candidate = null
    this.log.push('reloaded')
    return true
  }

  private reject(why: string): boolean {
    this.log.push(`reload rejected: ${why}; active domain kept`)
    return false
  }
}

/** Eight wanderers, each with its own world and WandererWorld host, executing steps for the host's durations. */
function crew(count: number) {
  const hosts = new Map<WorldState, WandererWorld>()
  const host = (world: WorldState) => hosts.get(world)!
  const executed = new Map<string, string[]>()
  const factory =
    (ir: DomainIR): PlannerFactory =>
    world =>
      new PlanRunner(ir, world, {
        callterms: galleryCallterms,
        calltermErrorPolicy: 'report',
        context: { world, requestPath: (from: Atom, to: Atom) => host(world).requestPath(from, to) },
        onDiagnostic: d => assert.fail(`${d.code}: ${d.message}`)
      })
  const step =
    (name: string): ActionFactory =>
    (args, ctx) => {
      const h = host(ctx.blackboard.world)
      const seconds = h.duration(name, args)
      let elapsed = 0
      const ex: ActionExecutor = {
        start: () => 'running',
        update: dt => {
          elapsed += dt
          if (elapsed < seconds - 1e-6) return 'running'
          h.complete(name, args)
          return 'done'
        },
        cancel: () => {}
      }
      return ex
    }
  const names = ['!say', '!walk_segment', '!wait_for_pathfinding_query', '!wanderer_idle', '!play_contextual_animation', '!after_destination_comment']
  const actions = Object.fromEntries(names.map(n => [n, step(n)]))
  const agents: GuardAgent[] = []
  const make = (ir: DomainIR) => {
    for (let i = 0; i < count; i++) {
      const id = `npc${i}`
      executed.set(id, [])
      const agent = new GuardAgent({
        id,
        topLevel: 'run',
        planner: factory(ir),
        lineOfSight: CLEAR_LINE_OF_SIGHT,
        start: { position: v3(i, 0, 0), yaw: 0 },
        actions,
        onEvent: (e: GuardEvent) => {
          if (e.type === 'step') executed.get(id)!.push(formatTask(e.name, e.args))
          if (e.type === 'diagnostic') assert.fail(e.message)
        }
      })
      HOT_RELOAD_STATION.scenarios[0].setup(agent.blackboard.world)
      hosts.set(agent.blackboard.world, new WandererWorld(agent.blackboard.world))
      agents.push(agent)
    }
  }
  const tick = (dt = 1 / 30) => {
    for (const a of agents) {
      host(a.blackboard.world).update(dt)
      a.tick(dt, [])
    }
  }
  return { agents, factory, make, tick, executed }
}

/** Mid-walk with a deferred call pending: on a segment, the plan still holds `&talk_about_destination`. */
const midWalk = (a: GuardAgent) => a.currentAction === '!walk_segment' && a.runner.steps.some(s => s.kind === 'deferred')

test('hot reload pipeline: compile does not touch the active domain, a broken source is rejected, eight NPCs reload mid-walk', () => {
  const c = crew(8)
  const pipeline = new Pipeline(() => c.agents, c.factory, 'run')

  // Initial build: rev A.
  pipeline.save(revision('A'))
  assert.ok(pipeline.compile())
  const revA = pipeline.candidate!
  c.make(revA)
  pipeline.active = revA
  for (let i = 0; i < 600 && !c.agents.every(midWalk); i++) c.tick()
  assert.ok(c.agents.every(midWalk), 'every NPC walks with a deferred call pending')
  assert.ok([...c.executed.values()].every(s => s.includes(marker('A'))))

  // Edit to rev B and compile: a candidate, the NPCs still run rev A.
  pipeline.save(revision('B'))
  assert.ok(pipeline.compile())
  for (let i = 0; i < 3; i++) c.tick()
  assert.ok(c.agents.every(a => a.runner.domain === revA), 'compile changes no agent')

  // A saved edit invalidates the candidate; a broken source does not compile; reload is refused, rev A runs on.
  pipeline.save(BROKEN)
  assert.equal(pipeline.compile(), false)
  assert.match(pipeline.log[pipeline.log.length - 1], /compile failed: .*unclosed-list/)
  assert.equal(pipeline.reload(), false)
  assert.ok(c.agents.every(a => a.runner.domain === revA))
  const moved = c.agents.map(a => wandererLocation(a.blackboard.world))
  for (let i = 0; i < 90; i++) c.tick()
  assert.ok(c.agents.some((a, i) => wandererLocation(a.blackboard.world) !== moved[i]), 'the NPCs keep walking')

  // A candidate without the agents' entry is refused too (upstream: a module without the export).
  pipeline.save('(:domain Other top_level_domain (:method (other) top_level_method (go () ((!say "x")))))')
  assert.ok(pipeline.compile())
  assert.equal(pipeline.reload(), false)
  assert.match(pipeline.log[pipeline.log.length - 1], /no top-level \(run\)/)

  // Back to rev B, compiled, reloaded on all eight mid-walk with their rev A deferred calls pending.
  pipeline.save(revision('B'))
  assert.ok(pipeline.compile())
  for (let i = 0; i < 600 && !c.agents.every(midWalk); i++) c.tick()
  assert.ok(c.agents.every(midWalk))
  const before = c.agents.map(a => wandererLocation(a.blackboard.world))
  const marks = c.agents.map(a => c.executed.get(a.id)!.length)
  assert.ok(pipeline.reload())
  const revB = pipeline.active!
  assert.ok(c.agents.every(a => a.runner.domain === revB && a.runner.steps.length === 0 && a.currentAction === ''), 'plans dropped')
  assert.deepEqual(c.agents.map(a => wandererLocation(a.blackboard.world)), before, 'world kept')
  assert.ok(c.agents.every(a => a.blackboard.world.rows('wanderer_state', 1).some(r => same(r[0], sym('walking')))))

  // Movement resumes with rev B; its deferred comment runs after it arrives; nothing of rev A again.
  for (let i = 0; i < 1500; i++) c.tick()
  c.agents.forEach((a, n) => {
    const after = c.executed.get(a.id)!.slice(marks[n])
    assert.equal(after[0], marker('B'), `${a.id}: ${after.join(', ')}`)
    const arrived = after.indexOf('!walk_segment (15 0)')
    assert.ok(arrived > 0, `${a.id} reached (15 0): ${after.join(', ')}`)
    assert.equal(after[arrived + 1], '!say "reload-validation-B-deferred"', `${a.id}: ${after.join(', ')}`)
    assert.ok(!after.some(s => s.includes('validation-A')), `${a.id}: nothing of rev A after the reload`)
  })
})
