// Every gallery and lab scenario plans its `expect`, every upstream example domain runs on some station, and the
// Wanderer host (after upstream's HTNDemo) drives the movement domain through request → in progress → walk →
// deferred comment → next destination picked by the world, a contextual animation at an interactable, a failed path,
// and one path request replacing the previous. Only the hierarchical_backtracking, backtracking_policy, callterms
// and linux_smoke expectations are upstream's full reference plans (AAA: partly); the rest are our planner's own output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { decompose, formatAtom, formatTask, PlanRunner, sym, WorldState } from '../../src/htn-planner'
import { missingCallterms } from '../../src/htn-planner/htn/planner'
import { LAB_STATIONS } from '../../src/examples/upstream/lab'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { WANDERER_TERRAIN, WandererWorld } from '../../src/examples/upstream/gallery/wanderer'
import { expectedStatus, galleryCallterms, pos, same } from '../../src/examples/upstream/stations'
import { wandererDomain } from '../../src/examples/upstream/generated/Wanderer.htn'
import { BROKEN_DIAGNOSTICS, BROKEN_SOURCE } from '../../src/examples/upstream/generated/hot-reload/broken'
import { wandererRevADomain } from '../../src/examples/upstream/generated/hot-reload/WandererRevA.htn'
import { HOT_RELOAD_STATION, HOT_RELOADS, marker, wandererLocation } from '../../src/examples/upstream/hot-reload'
import { compileDomainFile, compileDomainSource, formatDiagnostic } from '../../tools/htn/compiler'

for (const station of [...GALLERY_STATIONS, ...LAB_STATIONS]) {
  for (const s of station.scenarios) {
    test(`gallery ${station.id}: ${s.name} ${s.method}`, () => {
      const world = new WorldState()
      s.setup(world)
      const host = s.context?.(world) ?? station.host?.(world) ?? { world }
      const r = decompose(s.domain ?? station.domain, world, s.method, s.args ?? [], {
        callterms: s.callterms ?? galleryCallterms,
        calltermErrorPolicy: 'fail_silently',
        context: host,
        mode: s.mode,
        maxDepth: s.maxDepth
      })
      const plan = r.plan.map(p => formatTask(p.name, p.args))
      assert.equal(r.status, expectedStatus(s))
      if (s.expect) assert.deepEqual(plan, s.expect)
      if (s.name.includes('241 steps')) {
        assert.equal(plan.length, 241)
        assert.equal(plan[0], '!log "Recursive scenario started" 7 50 1.0')
      }
    })
  }
}

test('under the report policy, typed example callterms reject only what the upstream tests make them reject', () => {
  // The example bindings are typed like upstream's (callterm(), listCallterms): a wrong count, type or shape is a
  // callterm_error. Only the lab scenarios of HTNBooleanCompatibilityTest.cpp:240 (bare true/false are symbols)
  // and HTNMissingCallTermTest.cpp:515 (a typed probe called with no argument) do that, on purpose.
  const errors: string[][] = []
  for (const station of [...GALLERY_STATIONS, ...LAB_STATIONS]) {
    for (const s of station.scenarios) {
      const world = new WorldState()
      s.setup(world)
      decompose(s.domain ?? station.domain, world, s.method, s.args ?? [], {
        callterms: s.callterms ?? galleryCallterms,
        calltermErrorPolicy: 'report',
        onDiagnostic: d => void (d.code === 'callterm_error' && errors.push([s.name, d.callterm ?? '', d.calltermError?.reason ?? ''])),
        context: s.context?.(world) ?? station.host?.(world) ?? { world },
        mode: s.mode,
        maxDepth: s.maxDepth
      })
    }
  }
  assert.deepEqual(errors, [
    ['boolean_compatibility: boolean compatibility: bare true/false are symbols, not numeric aliases', 'accept_flags', 'argument_type_mismatch'],
    ...['nested', 'primitive', 'compound'].map(m => [
      `missing_callterms: missing callterms: typed probe called with no argument fails in ${m}`,
      'probe',
      'argument_count_mismatch'
    ])
  ])
})

test('a scenario leaves out on purpose only callterms its domain calls and its set lacks', () => {
  let declared = 0
  for (const station of [...GALLERY_STATIONS, ...LAB_STATIONS])
    for (const s of station.scenarios) {
      if (!s.unbound) continue
      declared++
      const missing = missingCallterms(s.domain ?? station.domain, s.callterms ?? galleryCallterms)
      assert.deepEqual(s.unbound.filter(n => !missing.includes(n)), [], `${station.id}: ${s.name}`)
    }
  assert.ok(declared > 0)
})

test('every upstream example domain (Domains/, Domains/Test/) runs on some gallery or lab station', () => {
  const run = new Set([...GALLERY_STATIONS, ...LAB_STATIONS].flatMap(st => [st.domain, ...st.scenarios.map(s => s.domain ?? st.domain)]).map(d => d.name))
  const dir = join(process.env.HTN_REPO_ROOT ?? process.cwd(), 'test/htn/fixtures/upstream/Domains')
  const files = [...readdirSync(dir).map(f => join(dir, f)), ...readdirSync(join(dir, 'Test')).map(f => join(dir, 'Test', f))].filter(f => f.endsWith('.domain'))
  assert.ok(files.length >= 29)
  const missing = files.filter(f => {
    const r = compileDomainFile(f)
    assert.ok(r.ok, f)
    return !run.has(r.ir.name)
  })
  assert.deepEqual(missing, [])
})

/** Upstream's demo agent (AIHTNDemoWandererAgent.cpp), headless: plan, run each step for the host's duration, tell the
 *  host's world it finished. Each entry: the step, its seconds, the world's destination right after it. */
function wandererLoop(world: WorldState, host: WandererWorld) {
  const runner = new PlanRunner(wandererDomain, world, { callterms: galleryCallterms, context: host })
  const steps: { task: string; seconds: number; destination: string }[] = []
  return {
    steps,
    /** Plans and runs the whole plan; returns the tasks it ran. */
    run(): string[] {
      assert.equal(runner.plan('run'), 'succeeded')
      const ran: string[] = []
      while (runner.resolve() === 'ready') {
        const s = runner.current()!
        const task = formatTask(s.name, s.args)
        const seconds = host.duration(s.name, s.args)
        host.complete(s.name, s.args)
        runner.complete()
        ran.push(task)
        steps.push({ task, seconds, destination: destination(world) })
      }
      return ran
    }
  }
}
const destination = (w: WorldState) => w.rows('wanderer_destination', 1).map(r => formatAtom(r[0])).join() || '-'
const fact = (w: WorldState, name: string, arity: number) => w.rows(name, arity).map(r => formatTask(name, r))
const snapshot = (w: WorldState) => JSON.stringify(w.tableKeys().map(k => w.rows(k.split('/')[0], Number(k.split('/')[1]))))
const walking = (w: WorldState, from = pos(0, 0), to = pos(15, 0)) => {
  w.add('wanderer_state', sym('walking'))
  w.add('wanderer_location', from)
  w.add('wanderer_destination', to)
}
/** Ticks the host until no path query is in progress; returns how many ticks it took. */
function settle(host: WandererWorld): number {
  let ticks = 0
  while (host.world.rows('pathfind_state', 4).some(r => same(r[0], sym('in_progress')))) {
    host.update(1 / 30)
    assert.ok(++ticks < 1000, 'the query never finished')
  }
  return ticks
}
const OPEN = { ...WANDERER_TERRAIN, blocked: [], interactables: [] }

test('gallery wanderer (HTNDemo): request → in progress for Manhattan ticks → walk; the world picks the next destination on the last segment', () => {
  const world = new WorldState()
  walking(world)
  const host = new WandererWorld(world, OPEN)
  const loop = wandererLoop(world, host)
  // The callterm writes the request at once, so the same plan goes on to the comment (AIHTNDemoPathfinder.cpp:184).
  assert.deepEqual(loop.run(), ['!say "Both coordinates are even!"', '!after_destination_comment'])
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state in_progress (0 0) (15 0) 1'])
  for (let i = 0; i < 14; i++) host.update(1 / 30)
  assert.deepEqual(loop.run(), ['!wait_for_pathfinding_query', '!say "Both coordinates are even!"', '!after_destination_comment'])
  assert.equal(settle(host), 1, '|15 - 0| + |0 - 0| = 15 ticks in all')
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state succeeded (0 0) (15 0) 1'])
  assert.deepEqual(loop.run(), [
    '!walk_segment (5 0)',
    '!walk_segment (10 0)',
    '!walk_segment (15 0)',
    '!say "One coordinate is even and the other is odd!"',
    '!after_destination_comment'
  ])
  const at = (task: string) => loop.steps.filter(s => s.task === task)
  assert.equal(at('!walk_segment (10 0)')[0].destination, '(15 0)')
  assert.equal(at('!walk_segment (15 0)')[0].destination, '(4 8)', 'the world picks the next waypoint on the last segment')
  assert.equal(host.journeys, 1)
  assert.deepEqual(fact(world, 'wanderer_location', 1), ['wanderer_location (15 0)'])
  // Durations of AIHTNDemoWandererAgent::StartCurrentTask: distance / 5.5 cells/s, !say 0.8, wait 0.15, others 0.05.
  assert.equal(at('!walk_segment (5 0)')[0].seconds, 5 / 5.5)
  assert.equal(at('!wait_for_pathfinding_query')[0].seconds, 0.15)
  assert.equal(at('!say "Both coordinates are even!"')[0].seconds, 0.8)
  assert.ok(at('!after_destination_comment').every(s => s.seconds === 0.05))
  // !after_destination_comment changes nothing.
  const before = snapshot(world)
  host.complete('!after_destination_comment', [])
  assert.equal(snapshot(world), before)
  // The next journey: a new request replaces the finished one and its facts.
  assert.deepEqual(loop.run(), ['!say "One coordinate is even and the other is odd!"', '!after_destination_comment'])
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state in_progress (15 0) (4 8) 2'])
  assert.deepEqual([...fact(world, 'pathfinder', 4), ...fact(world, 'pathfinding_segment', 3)], [])
  assert.equal(settle(host), 19)
  assert.deepEqual(loop.run().slice(-3), ['!walk_segment (4 8)', '!say "Both coordinates are even!"', '!after_destination_comment'])
  assert.equal(destination(world), '(12 12)')
  assert.equal(host.journeys, 2)
})

test('gallery wanderer (HTNDemo): at an interactable the world turns contextual; the animation lasts its usage time, then the next waypoint', () => {
  const world = new WorldState()
  walking(world)
  const host = new WandererWorld(world)
  const loop = wandererLoop(world, host)
  assert.deepEqual(fact(world, 'contextual_animation_at', 2), [
    'contextual_animation_at (15 0) look_at_view',
    'contextual_animation_at (12 12) sit_on_bench'
  ])
  loop.run()
  settle(host)
  assert.deepEqual(loop.run().slice(-2), ['!say "One coordinate is even and the other is odd!"', '!after_destination_comment'])
  assert.equal(loop.steps.find(s => s.task === '!walk_segment (15 0)')!.destination, '-', 'no destination while contextual')
  assert.deepEqual(fact(world, 'wanderer_state', 1), ['wanderer_state contextual'])
  assert.equal(host.journeys, 1)
  assert.deepEqual(loop.run(), ['!play_contextual_animation look_at_view (15 0)'])
  assert.equal(loop.steps[loop.steps.length - 1].seconds, 2.5, 'the interactable usage time')
  assert.deepEqual(fact(world, 'wanderer_state', 1), ['wanderer_state walking'])
  assert.equal(destination(world), '(4 8)')
  assert.equal(host.duration('!play_contextual_animation', [sym('wave'), pos(1, 1)]), 0.05, 'no interactable there')
})

test('gallery wanderer (HTNDemo): a path to a blocked cell fails after its ticks; the wanderer idles', () => {
  const world = new WorldState()
  walking(world, pos(0, 0), pos(8, 6))
  const host = new WandererWorld(world, { ...OPEN, blocked: [pos(8, 6)] })
  const loop = wandererLoop(world, host)
  loop.run()
  assert.equal(settle(host), 14)
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state failed (0 0) (8 6) 1'])
  assert.deepEqual([...fact(world, 'pathfinder', 4), ...fact(world, 'pathfinding_segment', 3)], [])
  assert.deepEqual(loop.run(), ['!wanderer_idle'])
  assert.deepEqual(loop.run(), ['!wanderer_idle'])
  assert.equal(loop.steps[loop.steps.length - 1].seconds, 0.4)
})

test('gallery wanderer (HTNDemo): one path request at a time; a new one replaces it, the same one keeps its countdown', () => {
  const world = new WorldState()
  const host = new WandererWorld(world, OPEN)
  assert.equal(host.requestPath(pos(0, 0), pos(10, 0)), 1)
  for (let i = 0; i < 4; i++) host.update(1 / 30)
  assert.equal(host.requestPath(pos(0, 0), pos(10, 0)), 1, 'the same query')
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state in_progress (0 0) (10 0) 1'])
  assert.equal(settle(host), 6, 'not restarted')
  assert.equal(host.requestPath(pos(10, 0), pos(10, 3)), 2)
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state in_progress (10 0) (10 3) 2'])
  assert.deepEqual([...fact(world, 'pathfinder', 4), ...fact(world, 'pathfinding_segment', 3)], [], 'the old path is gone')
  assert.equal(host.requestPath(pos(1, 1), pos(2, 2)), 3, 'replaced before it finished')
  assert.equal(settle(host), 2)
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state succeeded (1 1) (2 2) 3'])
  assert.equal(host.requestPath(pos(0, 0), pos(40, 0)), 0, 'outside the grid: no query')
  assert.deepEqual(fact(world, 'pathfind_state', 4), ['pathfind_state succeeded (1 1) (2 2) 3'])
})

test('hot reload (HTNHotReloadDemoSelfTest.cpp): rev B replaces rev A mid-walk on the same world; a broken source does not compile', () => {
  const station = HOT_RELOAD_STATION
  const world = new WorldState()
  station.scenarios[0].setup(world)
  const host = station.host!(world) as WandererWorld
  let runner = new PlanRunner(wandererRevADomain, world, { callterms: galleryCallterms, context: host })
  const executed: string[] = []
  const step = () => {
    const s = runner.current()!
    executed.push(formatTask(s.name, s.args))
    host.complete(s.name, s.args)
    runner.complete()
  }
  assert.equal(runner.plan('run'), 'succeeded')
  while (runner.resolve() === 'ready') step() // requests the path
  settle(host) // path ready
  assert.equal(runner.plan('run'), 'succeeded')
  assert.equal(runner.resolve(), 'ready')
  step() // !say "reload-validation-A"
  step() // the first segment
  assert.equal(runner.resolve(), 'ready')
  assert.equal(runner.current()!.name, '!walk_segment', 'moving')
  assert.ok(runner.steps.some(s => s.name === '&talk_about_destination'), 'a deferred call pending')
  const location = formatTask('at', world.rows('wanderer_location', 1)[0])
  assert.equal(location, 'at (5 0)')

  // Reload: a new planner on the same world; the running step and plan are dropped.
  const reload = HOT_RELOADS.find(r => r.name === 'B')!
  runner = new PlanRunner(reload.domain!, world, { callterms: galleryCallterms, context: host })
  assert.equal(wandererLocation(world), '(5 0)', 'world kept')
  assert.equal(runner.plan('run'), 'succeeded')
  assert.equal(formatTask(runner.steps[0].name, runner.steps[0].args), marker('B'))
  while (runner.resolve() === 'ready') step() // a new path query from where it stood
  assert.ok(executed.includes('!say "reload-validation-B-deferred"'), executed.join(', '))
  settle(host)
  assert.equal(runner.plan('run'), 'succeeded')
  while (runner.resolve() === 'ready') step()
  assert.equal(wandererLocation(world), '(15 0)', `movement resumed: ${executed.join(', ')}`)
  assert.ok(!executed.slice(executed.indexOf(marker('B'))).some(s => s.includes('reload-validation-A')), 'nothing from rev A after the reload')

  // The broken source: the compiler refuses it with the diagnostic the station shows; the active domain stays.
  const broken = compileDomainSource('Wanderer.domain', BROKEN_SOURCE)
  assert.equal(broken.ok, false)
  assert.deepEqual(broken.diagnostics.map(formatDiagnostic), BROKEN_DIAGNOSTICS)
  assert.ok(HOT_RELOADS.some(r => !r.domain && r.error?.includes(BROKEN_DIAGNOSTICS[0])))
})
