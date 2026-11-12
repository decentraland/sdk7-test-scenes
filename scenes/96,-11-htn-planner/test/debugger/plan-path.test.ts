// Runs, the committed path, the breadcrumb and the plan strip (src/debugger/runs.ts, plan-path.ts), on the real
// gallery and lab domains.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decompose, PlanTraceRecorder, WorldState } from '../../src/htn-planner'
import type { PlanRun } from '../../src/htn-planner'
import { GALLERY_STATIONS } from '../../src/examples/upstream/gallery'
import { LAB_STATIONS } from '../../src/examples/upstream/lab'
import { galleryCallterms } from '../../src/examples/upstream/stations'
import { committedSteps, crumbs, planStrip, planTexts } from '../../src/debugger/plan-path'
import { hostRuns, pickRun, runTitle, stepRun } from '../../src/debugger/runs'

function traced(stationId: string, scenario: number) {
  const station = [...GALLERY_STATIONS, ...LAB_STATIONS].find(s => s.id === stationId)!
  const s = station.scenarios[scenario]
  const domain = s.domain ?? station.domain
  const world = new WorldState()
  s.setup(world)
  const recorder = new PlanTraceRecorder(domain)
  decompose(domain, world, s.method, s.args ?? [], { callterms: s.callterms ?? galleryCallterms, context: s.context?.(world) ?? station.host?.(world) ?? { world }, mode: s.mode, calltermErrorPolicy: 'report', onDiagnostic: () => {}, trace: recorder })
  return { run: recorder.lastPlan!, recorder, domain }
}

test('committedSteps: one task node per plan step, in order, for every gallery and lab scenario', () => {
  let checked = 0
  for (const station of [...GALLERY_STATIONS, ...LAB_STATIONS])
    station.scenarios.forEach((s, i) => {
      const { run, recorder } = traced(station.id, i)
      if (!run) return
      const steps = committedSteps(run)
      if (run.status !== 'succeeded') {
        assert.deepEqual(steps, [])
        return
      }
      const names = steps.map(c => recorder.graph.tasks[run.nodes[c.node].ref].title.slice(1).split(/[ )]/)[0])
      assert.deepEqual(names, run.plan.map(p => (p.kind === 'deferred' ? p.name : p.name)), `${station.id}: ${s.name}`)
      for (const c of steps) {
        assert.equal(c.path[0], 0, 'from the plan node')
        assert.equal(c.path[c.path.length - 1], c.node)
        for (const id of c.path) assert.ok(run.nodes[id].succeeded, 'every node on the path succeeded')
      }
      checked++
    })
  assert.ok(checked > 50)
})

test('crumbs: method, branch, task, method... down to the step', () => {
  const { run, recorder } = traced('aaa', 0)
  const steps = committedSteps(run)
  const c = crumbs(run, recorder.graph, steps[1].path)
  assert.equal(c[0].kind, 'method')
  assert.equal(c[0].label, 'run')
  assert.equal(c[1].kind, 'branch')
  assert.equal(c[c.length - 1].kind, 'task')
  assert.match(c[c.length - 1].label, /^\(!follow_patrol_route/)
})

test('planStrip: the host runs the run\'s plan: done, current, next', () => {
  const plan = ['!a', '!b', '!c', '!d']
  const s = planStrip(plan, ['!c', '!d'], true, ['!b'])
  assert.deepEqual(s.items.map(i => i.state), ['done', 'done', 'current', 'next'])
  assert.equal(s.current, 2)
  const idle = planStrip(plan, ['!c', '!d'], false, [])
  assert.equal(idle.items[2].state, 'next')
  const finished = planStrip(plan, [], false, [])
  assert.deepEqual(finished.items.map(i => i.state), ['done', 'done', 'done', 'done'])
  assert.equal(finished.current, -1)
  assert.ok(s.fromRun && finished.fromRun)
  const ended = planStrip(plan, [], false, ['!b', '!c', '!d'])
  assert.ok(ended.fromRun, 'the host finished this plan: its last done steps end the plan')
  assert.deepEqual(ended.items.map(i => i.state), ['done', 'done', 'done', 'done'])
  const other = planStrip(plan, [], false, ['!x'])
  assert.ok(!other.fromRun, 'it finished another plan')
  assert.deepEqual(other.items.map(i => i.text), ['!x'])
})

test('planStrip: another plan runs: the host\'s own done and remaining steps, no position in the run', () => {
  const s = planStrip(['!x', '!y'], ['!c', '!d'], true, ['!a', '!b'])
  assert.deepEqual(s.items.map(i => `${i.state} ${i.text}`), ['done !a', 'done !b', 'current !c', 'next !d'])
  assert.equal(s.current, -1)
  assert.ok(!s.fromRun)
  assert.deepEqual(planStrip([], [], false, []).items, [])
})

const fakeRun = (seq: number, deferred = false): PlanRun => ({ seq, deferred, method: 0, args: [], status: 'succeeded', plan: [], ms: 0.25, world: 0, nodes: [] })

test('runs: follow the newest, step back and forth, count newer runs', () => {
  const runs = [fakeRun(3), fakeRun(4), fakeRun(5, true), fakeRun(6)]
  assert.equal(pickRun(runs, null).run!.seq, 6)
  assert.equal(pickRun(runs, null).latest, true)
  const back = stepRun(runs, null, -1)
  assert.equal(back, 5)
  const p = pickRun(runs, back)
  assert.equal(p.index, 2)
  assert.equal(p.newer, 1)
  assert.equal(stepRun(runs, back, +1), null, 'back on the newest: follow again')
  assert.equal(stepRun(runs, back, -10), 3)
  assert.equal(pickRun(runs, 1).run!.seq, 3, 'a run that fell out of the ring: the oldest kept')
  assert.equal(pickRun([], null).run, null)
  assert.equal(runTitle(fakeRun(5, true), 'go_to'), '#5 &go_to · succeeded · 0 steps · 0.25 ms')
})

test('hostRuns: the ring plus the last plan and deferred run, by seq, once each', () => {
  const recorder = new PlanTraceRecorder(GALLERY_STATIONS[0].domain, { keep: 2 })
  const world = new WorldState()
  GALLERY_STATIONS[0].scenarios[0].setup(world)
  for (let i = 0; i < 3; i++) decompose(GALLERY_STATIONS[0].domain, world, 'run', [], { trace: recorder })
  const runs = hostRuns(recorder)
  assert.deepEqual(runs.map(r => r.seq), [2, 3])
  assert.deepEqual(hostRuns(null), [])
  assert.deepEqual(planTexts(runs[1]), planTexts(recorder.lastPlan))
})
