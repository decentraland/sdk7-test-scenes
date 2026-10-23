// Author-owned input: no demo catalogue or scene runtime imports.
import { bool, int } from '../../../src/htn-planner/htn/atom'
import type { ConsumerManifest } from '../manifest'

export default {
  domain: 'jobs.domain',
  callterms: () => {
    let checksum = 0
    return { callterms: { accept: args => {
      const work = args[0]?.t === 'int' ? args[0].v : 0
      // Deliberate CPU-heavy negative control; not an example of a useful game query.
      for (let i = 0; i < work; i++) checksum = (checksum + i) | 0
      return bool(Number.isFinite(checksum))
    } } }
  },
  scenarios: [
    { name: 'ordinary', world: 'ordinary.worldstate', method: 'pick', args: [int(41), int(0)], expect: { status: 'succeeded', plan: ['!choose 42'] } },
    { name: 'many facts', world: 'many.worldstate', method: 'pick', args: [int(41), int(0)], expect: { status: 'succeeded', plan: ['!choose 42'] } },
    { name: 'slow callterm', world: 'ordinary.worldstate', method: 'pick', args: [int(41), int(1000000)], expect: { status: 'succeeded', plan: ['!choose 42'] } },
    { name: 'unreachable', world: 'many.worldstate', method: 'pick', args: [int(99), int(0)], expect: { status: 'no_plan', plan: [] } }
  ]
} satisfies ConsumerManifest
