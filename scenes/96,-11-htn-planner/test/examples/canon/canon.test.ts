// Every canonical example (src/examples/canon, read by tools/htn/canon.ts): the catalogue loads without problems,
// every domain compiles clean and its header says what it teaches, its source, licence, deviations and what was not
// ported; htn-lint.json lists its executors; every scenario plans what its header expects, and the same with branch
// backtracking off (FACTS_AND_AXIOMS: the guards alone pick the branch; fact backtracking stays on, as a condition
// that filters a sensor list needs it); every story replays its trace. Example-specific lessons: the other files here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import { CANON_DIR, playStory, storyId } from '../../../tools/htn/canon'
import { ALL, CANON, lintPrimitives, NO_BRANCHES, planOf, primitivesOf, ROOT } from './helpers'

const HEADER_FIELDS = ['Teaches', 'Source', 'Licence', 'Deviations', 'Not ported']

function domainFiles(dir: string): string[] {
  return fs.readdirSync(nodePath.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) return domainFiles(rel)
    return e.name.endsWith('.domain') ? [rel] : []
  })
}

test('canon: the catalogue loads without problems', () => {
  assert.deepEqual(CANON.problems, [])
  assert.ok(CANON.stations.length > 0)
})

for (const file of domainFiles(CANON_DIR)) {
  test(`canon ${file.slice(CANON_DIR.length + 1)}: the header says what it teaches, its source, licence, deviations, what was not ported`, () => {
    const text = fs.readFileSync(nodePath.join(ROOT, file), 'utf8')
    const header = text.slice(0, text.indexOf('(:domain'))
    for (const field of HEADER_FIELDS) assert.match(header, new RegExp(`^// ${field}[^\\n]*:`, 'm'), `${file}: no '// ${field}...:' line`)
  })
}

for (const s of CANON.stations) {
  test(`canon ${s.id}: compiles clean; htn-lint.json lists its executors and the domain uses only those`, () => {
    assert.deepEqual(s.warnings, [])
    const listed = lintPrimitives(s.file)
    assert.ok(listed, `${s.file}: no "primitives" list in htn-lint.json`)
    for (const p of primitivesOf(s.domain)) assert.ok(listed.includes(p), `${p} is not in htn-lint.json's list for ${s.file}`)
  })
  for (const sc of s.scenarios) {
    test(`canon ${s.id}/${sc.name}: plans as its header expects, the same without branch backtracking`, () => {
      const all = planOf(s.domain, sc, ALL)
      assert.deepEqual(all, { status: sc.status, plan: sc.expect, diagnostics: [] }, sc.file)
      assert.deepEqual(planOf(s.domain, sc, NO_BRANCHES), all, `${sc.file}: the plan must not depend on branch backtracking`)
    })
  }
  for (const story of s.stories) {
    test(`canon story ${storyId(story)}: replays its trace; its hosts only run executors htn-lint.json lists`, () => {
      const { trace, stage } = playStory(CANON, story)
      assert.deepEqual(trace, story.expect)
      for (const agent of stage.agents) {
        const file = CANON.stations.find(x => x.id === stage.stationOf(agent))!.file
        const listed = lintPrimitives(file) ?? []
        for (const name of [...Object.keys(agent.host.effects ?? {}), ...Object.keys(agent.host.failures ?? {})])
          assert.ok(listed.includes(name), `${name} has an effect but is not in htn-lint.json's list for ${file}`)
      }
    })
  }
}

test('canon: a recorded story is a session the viewer loads (every agent, its runs, the timeline)', () => {
  const story = CANON.stations.flatMap(s => s.stories).find(s => storyId(s) === 'swarm_coordinator/roles-as-facts-from-the-coordinator')
  assert.ok(story)
  const { session, trace } = playStory(CANON, story, true)
  assert.deepEqual(trace, story.expect, 'recording does not change the story')
  assert.ok(session)
  assert.deepEqual([...new Set(session.runs.map(r => r.agent))].sort(), ['coordinator', 'd1', 'd2', 'd3'])
  assert.ok(session.timeline.some(e => e.event.type === 'replan') && session.timeline.some(e => e.event.type === 'step'))
})
