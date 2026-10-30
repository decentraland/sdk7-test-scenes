// Upstream golden plans (E4): every gallery and lab scenario the driver can express (tools/upstream-golden/cases.ts)
// plans on our planner exactly as upstream urosidoki/htn_planner@aec08fa planned it (status, steps, and the callterm
// errors its Report policy gave), from the checked-in reference plans in test/fixtures/upstream-golden (regenerate:
// npm run htn:golden, needs WSL or Linux with g++; docs/htn-guidance.md). A scenario whose inputs changed since the
// plans were made fails until they are regenerated. A deliberate difference is listed in DIFFERENCES with its register row (src/htn-planner/htn/README.md, Planner limitations).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GOLDEN_DIR, goldenCases, goldenFile, GoldenPlan, manifestLine, MANIFEST_COLUMNS, parseGolden } from '../../tools/upstream-golden/cases'

const ROOT = process.env.HTN_REPO_ROOT ?? process.cwd()
const REGENERATE = 'inputs changed since the upstream plans were made: run npm run htn:golden'

/** Case id → why our plan differs from upstream's (a register row). None today. */
const DIFFERENCES: Record<string, string> = {}

const { cases } = goldenCases(ROOT)
const golden = new Map<string, GoldenPlan>()
for (const station of new Set(cases.map(c => c.station))) {
  const file = join(ROOT, goldenFile(station))
  if (existsSync(file)) for (const [id, plan] of parseGolden(readFileSync(file, 'utf8'))) golden.set(id, plan)
}

test('upstream golden: the manifest and the derived world states are current', () => {
  const manifest = readFileSync(join(ROOT, GOLDEN_DIR, 'manifest.tsv'), 'utf8')
    .split(/\r?\n/)
    .filter(l => l !== '' && !l.startsWith('#'))
  assert.deepEqual(manifest, cases.map(manifestLine), REGENERATE)
  for (const c of cases.filter(c => c.worldstate.startsWith('scene:'))) {
    const file = join(ROOT, c.worldstate.slice('scene:'.length))
    assert.equal(existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null, c.worldText, `${c.id}: ${REGENERATE}`)
  }
})

for (const c of cases) {
  test(`upstream golden ${c.id}`, { skip: DIFFERENCES[c.id] }, () => {
    const g = golden.get(c.id)
    assert.ok(g, `no upstream plan for ${c.id}: run npm run htn:golden`)
    for (const k of MANIFEST_COLUMNS.filter(k => k !== 'id')) assert.equal(g.inputs[k], c[k], `${k}: ${REGENERATE}`)
    const ours = c.ours()
    assert.deepEqual(ours, { status: g.status, steps: g.steps, calltermErrors: g.calltermErrors })
  })
}
