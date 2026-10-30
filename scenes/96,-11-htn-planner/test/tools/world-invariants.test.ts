import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { WorldState, snapshotWorld } from '../../src/htn-planner/htn/world-state'
import { compileDomainFile, parseWorldState } from '../../tools/htn/compiler'
import { loadWorldInvariants, InvalidWorldError, InvariantConfigError } from '../../tools/htn/world-invariants'
import { loadCanon, playStory, type Canon } from '../../tools/htn/canon'
import type { Story } from '../../src/examples/canon/paper'
import { runCli } from '../../tools/htn/run'

const rules = `(:domain KitchenChecks top_level_domain
  (:method (one_location) top_level_method
    (valid (and (not (and (location ?item ?a) (location ?item ?b) (!= ?a ?b)))) ()))
  (:method (one_owner) top_level_method
    (valid (and (not (and (owns ?agent ?order) (owns ?other ?order) (!= ?agent ?other)))) ()))
  (:method (one_stage) top_level_method
    (valid (and (not (and (stage ?pot ?a) (stage ?pot ?b) (!= ?a ?b)))) ())))`
const behaviour = `(:domain Kitchen top_level_domain (:method (act) top_level_method (always () ((!work)))))`
function fixture(t: { after(fn: () => void): void }, checks = rules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htn-invariants-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const domain = path.join(dir, 'kitchen.domain')
  fs.writeFileSync(domain, behaviour)
  const sidecar = path.join(dir, 'kitchen.invariants.domain')
  fs.writeFileSync(sidecar, checks)
  return { dir, domain, sidecar }
}
function world(text: string) {
  const w = new WorldState()
  parseWorldState(text, w)
  return w
}
function cli(dir: string, ...args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = runCli([...args, '--json', '--repeats', '0'], { cwd: dir, out: s => out.push(s), err: s => err.push(s) })
  return { code, value: JSON.parse(out.join('')), err }
}
test('world invariants: reject location, ownership and stage conflicts independently', t => {
  const { domain } = fixture(t)
  const checks = loadWorldInvariants(domain)!
  for (const [name, text] of [
    ['one_location', 'location extinguisher counter\nlocation extinguisher alice'],
    ['one_owner', 'owns alice order1\nowns bob order1'],
    ['one_stage', 'stage pot raw\nstage pot cooked']
  ]) {
    assert.throws(() => checks.assert(world(text)), e => e instanceof InvalidWorldError && e.checks.join() === name)
  }
})
test('world invariants: valid worlds, multiple distinct items and no mutation', t => {
  const { domain } = fixture(t)
  const w = world('location onion1 alice\nlocation onion2 bob\nowns alice order1\nowns bob order2\nstage pot cooked')
  const before = snapshotWorld(w)
  loadWorldInvariants(domain)!.assert(w)
  assert.deepEqual(snapshotWorld(w), before)
})
test('world invariants: CLI auto-discovery rejects invalid facts before producing a plan or session', t => {
  const { dir, domain } = fixture(t)
  const file = path.join(dir, 'bad.worldstate')
  fs.writeFileSync(file, 'stage pot raw\nstage pot cooked')
  const session = path.join(dir, 'session.json')
  const r = cli(dir, domain, '--world', file, '--session', session)
  assert.equal(r.code, 3)
  assert.equal(r.value.status, 'invalid_world')
  assert.deepEqual(r.value.checks, ['one_stage'])
  assert.equal(r.value.plan, undefined)
  assert.equal(fs.existsSync(session), false)
  fs.writeFileSync(file, 'stage pot cooked')
  const valid = cli(dir, domain, '--world', file)
  assert.equal(valid.code, 0)
  assert.equal(valid.value.worldValidation.status, 'passed')
})
test('world invariants: absent sidecar preserves behavior; explicit missing sidecar fails closed', t => {
  const { dir, domain, sidecar } = fixture(t)
  fs.unlinkSync(sidecar)
  assert.equal(loadWorldInvariants(domain), undefined)
  const file = path.join(dir, 'unchecked.worldstate')
  fs.writeFileSync(file, 'stage pot raw\nstage pot cooked')
  const unchecked = cli(dir, domain, '--world', file)
  assert.equal(unchecked.code, 0, 'without rules, a plan can succeed on contradictory facts')
  assert.equal(unchecked.value.worldValidation, undefined)
  const r = cli(dir, domain, '--invariants', sidecar)
  assert.equal(r.code, 2)
  assert.equal(r.value.status, 'invariant_error')
})
test('world invariants: explicit validator overrides automatic discovery', t => {
  const { dir, domain } = fixture(t)
  const strict = path.join(dir, 'strict.domain')
  fs.writeFileSync(strict, '(:domain Strict top_level_domain (:method (ready) top_level_method (valid (and (ready)) ())))')
  const r = cli(dir, domain, '--invariants', strict)
  assert.equal(r.code, 3)
  assert.deepEqual(r.value.checks, ['ready'])
})
test('world invariants: reject malformed, empty, parameterized and action-producing validators', t => {
  const { domain, sidecar } = fixture(t)
  for (const source of ['bad', '(:domain Empty top_level_domain)',
    '(:domain Bad top_level_domain (:method (check ?inp_x) top_level_method (valid () ())))', behaviour]) {
    fs.writeFileSync(sidecar, source)
    assert.throws(() => loadWorldInvariants(domain), InvariantConfigError)
  }
})
test('world invariants: fact arity errors are not silently treated as valid', t => {
  const { domain } = fixture(t)
  assert.throws(() => loadWorldInvariants(domain)!.assert(world('location extinguisher')), InvariantConfigError)
})

test('world invariants: canonical catalogue rejects invalid fixtures before planning', t => {
  const { dir, domain, sidecar } = fixture(t)
  const folder = path.join(dir, 'src/examples/canon/kitchen')
  fs.mkdirSync(path.join(folder, 'worlds/kitchen'), { recursive: true })
  fs.copyFileSync(domain, path.join(folder, 'kitchen.domain'))
  fs.copyFileSync(sidecar, path.join(folder, 'kitchen.invariants.domain'))
  const header = '// method: act\n// expect: succeeded\n//   1. !work\n'
  fs.writeFileSync(path.join(folder, 'worlds/kitchen/valid.worldstate'), header + 'stage pot raw')
  fs.writeFileSync(path.join(folder, 'worlds/kitchen/bad.worldstate'), header + 'stage pot raw\nstage pot cooked')
  const canon = loadCanon(dir)
  assert.deepEqual(canon.stations[0].scenarios.map(s => s.name), ['valid'])
  assert.ok(canon.problems.some(p => p.includes('bad.worldstate') && p.includes('one_stage')))
})
test('world invariants: shared-host story rejects a double owner after execution, allows atomic transfer', t => {
  const { domain } = fixture(t)
  const compiled = compileDomainFile(domain)
  assert.ok(compiled.ok)
  const canon: Canon = { problems: [], stations: [{ id: 'kitchen', example: 'kitchen', file: domain,
    title: 'kitchen', blurb: '', domain: compiled.ir, warnings: [], scenarios: [], stories: [],
    invariants: loadWorldInvariants(domain) }] }
  for (const transfer of [false, true]) {
    const story: Story = { station: 'kitchen', name: 'handoff', blurb: 'ownership', expect: [], play(stage) {
      const w = stage.facts('owns alice order1')
      const bob = stage.agent({ id: 'bob', world: w, method: 'act', host: { effects: {
        '!work': (_args, shared) => {
          parseWorldState('owns bob order1', shared)
          if (transfer) shared.removeWhere('owns', 2, row => row[0].v === 'alice')
        }
      } } })
      stage.agent({ id: 'alice', world: w, method: 'act' })
      bob.tick()
      bob.step()
    } }
    if (transfer) assert.doesNotThrow(() => playStory(canon, story))
    else assert.throws(() => playStory(canon, story), e => e instanceof InvalidWorldError && e.checks.includes('one_owner'))
  }
})
test('world invariants: recursive axiom is rejected by the compiler, never treated as a valid world', t => {
  const { domain } = fixture(t, `(:domain Bad top_level_domain
    (:axiom (loop) (and (#loop)))
    (:method (check) top_level_method (valid (and (#loop)) ())))`)
  assert.throws(() => loadWorldInvariants(domain), /axiom-cycle/)
})
test('world invariants: a host callterm in checks is rejected', t => {
  const { domain } = fixture(t, `(:domain Bad top_level_domain
    (:method (check) top_level_method (valid (and (call allowed)) ())))`)
  const compiled = compileDomainFile(domain.replace('.domain', '.invariants.domain'))
  assert.ok(compiled.ok, 'the fixture is legal HTN, rejected by validator policy')
  assert.throws(() => loadWorldInvariants(domain), /no tasks or host callterms/)
})

test('world invariants: arithmetic evaluation errors fail closed even under negation', t => {
  const { domain } = fixture(t, `(:domain Bad top_level_domain
    (:method (check) top_level_method (valid (and (not (== (/ 1 0) 0))) ())))`)
  const compiled = compileDomainFile(domain.replace('.domain', '.invariants.domain'))
  assert.ok(compiled.ok, compiled.diagnostics.map(d => d.message).join(' | '))
  assert.throws(() => loadWorldInvariants(domain)!.assert(new WorldState()), /could not be evaluated/)
})
test('world invariants: story override is explicitly rejected, not ignored', t => {
  const { dir, sidecar } = fixture(t)
  const r = cli(dir, '--story', 'kitchen/handoff', '--invariants', sidecar)
  assert.equal(r.code, 2)
  assert.match(r.value.error, /station sidecars/)
})
