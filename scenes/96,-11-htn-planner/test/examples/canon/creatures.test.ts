// The SS14 creature family (src/examples/canon/creatures): why the roots carry guards. The source's unguarded shape
// only works with branch backtracking on; the guarded port plans the same in every mode. (Every scenario and story:
// canon.test.ts.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { decompose, formatTask, WorldState } from '../../../src/htn-planner'
import { addFacts } from '../../../src/examples/canon/paper'
import { compileDomainSource } from '../../../tools/htn/compiler'
import { ALL, NO_BRANCHES, NONE, ROOT, station } from './helpers'

test('the source shape (root branches without conditions) falls through only with branch backtracking on', () => {
  // SS14's MouseCompound as it is: the food tier is tried unconditionally and the root relies on its failure.
  const source = `(:include "tiers/feed.domain")
(:include "tiers/idle.domain")
(:domain UnguardedMouse top_level_domain
    (:method (behave) top_level_method
        // htn-lint-disable-next-line unconditional-not-last -- the source's shape, kept to show why we guard
        (eat () ((eat_something)))
        (idle () ((idle))))
    (:method (eat_something)
        (eat (and (#feed_target ?item)) ((feed ?item)))))`
  const r = compileDomainSource(join(ROOT, 'src/examples/canon/creatures/unguarded.domain'), source)
  assert.ok(r.ok)
  const full = () => {
    const w = new WorldState()
    addFacts(w, 'now 0.0\nsatiation hunger 80\nidle_spot spot_a')
    return w
  }
  const plan = (mode: typeof ALL) => {
    const d = decompose(r.ir!, full(), 'behave', [], { mode })
    return [d.status, ...d.plan.map(p => formatTask(p.name, p.args))]
  }
  assert.deepEqual(plan(ALL), ['succeeded', '!move_to spot_a', '!idle_wait 2.0 7.0'])
  assert.deepEqual(plan(NO_BRANCHES), ['no_plan'])
  assert.deepEqual(plan(NONE), ['no_plan'])
  // The guarded port plans the same in every mode.
  for (const mode of [ALL, NO_BRANCHES, NONE]) {
    const d = decompose(station('mouse').domain, full(), 'behave', [], { mode })
    assert.deepEqual(d.plan.map(p => formatTask(p.name, p.args)), ['!move_to spot_a', '!idle_wait 2.0 7.0'])
  }
})
