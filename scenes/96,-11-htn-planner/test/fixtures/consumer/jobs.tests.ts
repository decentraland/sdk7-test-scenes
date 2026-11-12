// Expectations derived from the branch order and host contract before the first harness run.
import type { ConsumerManifest } from '../../../tools/consumer/manifest'
import { bool, sym } from '../../../src/htn-planner/htn/atom'
import { has } from '../../../src/htn-testing/paper'
import type { PaperHost } from '../../../src/htn-testing/paper'

const manifest: ConsumerManifest = {
  domain: 'jobs.domain',
  callterms: ({ rng }) => ({ callterms: { allowed: () => { rng.next(); return bool(true) } } }),
  scenarios: [
    { name: 'no ready fact', world: 'free.worldstate', method: 'approve', expect: { status: 'no_plan', plan: [] } },
    { name: 'positive', world: 'free.worldstate', method: 'job', args: [sym('a')], expect: { status: 'succeeded', plan: ['!claim a', '!finish a'] } },
    { name: 'near miss', world: 'busy.worldstate', method: 'job', args: [sym('a')], expect: { status: 'succeeded', plan: ['!wait a'] } },
    { name: 'reentry', world: 'resume.worldstate', method: 'job', args: [sym('a')], expect: { status: 'succeeded', plan: ['!finish a'] } },
    { name: 'complete', world: 'done.worldstate', method: 'job', args: [sym('a')], expect: { status: 'succeeded', plan: [] } },
    { name: 'invalid setup', world: 'invalid.worldstate', method: 'job', args: [sym('a')], expect: { status: 'invalid_world', plan: [] } }
  ],
  stories: [{
    name: 'shared host interruption failure and cleanup',
    expect: [
      'a: plan: !claim a, !finish a', 'a: run !claim a', 'b: plan: !wait b',
      'event: alarm', 'a: switch: !flee a', 'a: run !flee a',
      'b: switch: !claim b, !finish b', 'b: run !claim b', 'b: run !finish b',
      'a: plan: !claim a, !finish a', 'a: run !claim a', 'a: fail !finish a',
      'a: plan: !claim a, !finish a', 'a: run !claim a', 'a: run !finish a', 'a: plan: (empty)',
      'a: owner: (none)', 'a: done: b, a'
    ],
    play(stage, input) {
      const world = stage.scenario('positive')
      const host: PaperHost = {
        effects: {
          '!claim': (args, w) => { if (w.rows('owner', 1).length) return false; w.add('owner', ...args) },
          '!finish': (args, w) => { if (!has(w, 'owner', ...args)) return false; w.clear('owner', 1); w.add('done', ...args) },
          '!flee': (_args, w) => { w.clear('alarm', 0) }
        },
        dropped: w => w.clear('owner', 1)
      }
      const a = stage.agent({ id: 'a', world, method: 'job', args: [sym('a')], host, ...input.bindings(world) })
      const b = stage.agent({ id: 'b', world, method: 'job', args: [sym('b')], host, ...input.bindings(world, input.seed + 1) })
      a.tick(); a.step(); b.tick()
      stage.event('alarm', () => world.add('alarm'))
      a.tick(); a.step(); b.tick(); b.run()
      a.tick(); a.step(); a.step(() => true)
      a.tick(); a.run(); a.tick()
      a.show('owner'); a.show('done')
    }
  }]
}
export default manifest
