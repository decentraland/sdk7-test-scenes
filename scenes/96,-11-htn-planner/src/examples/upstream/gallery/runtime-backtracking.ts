// Gallery station: Runtime backtracking, switch the mode: which alternatives are retried.
import { runtimeBacktrackingDemoFacts } from '../generated/RuntimeBacktrackingDemo.facts'
import { runtimeBacktrackingDomain } from '../generated/RuntimeBacktrackingDemo.htn'
import { GalleryStation, ws } from '../stations'

export const runtimeBacktrackingStation: GalleryStation = {
  id: 'runtime-backtracking',
  title: 'Runtime backtracking',
  blurb: 'switch the mode: which alternatives are retried',
  domain: runtimeBacktrackingDomain,
  modes: true,
  scenarios: [
    { name: 'fact alternatives', method: 'demo_fact_alternatives', setup: ws(runtimeBacktrackingDemoFacts), expect: ['!fact_alternative_selected second'] },
    { name: 'axiom alternatives', method: 'demo_axiom_alternatives', setup: ws(runtimeBacktrackingDemoFacts), expect: ['!axiom_alternative_selected second'] },
    { name: 'hierarchical branches', method: 'demo_hierarchical_branches', setup: ws(runtimeBacktrackingDemoFacts), expect: ['!branch_backtracking_selected_safe_path'] },
    { name: 'direct branch fallback', method: 'demo_direct_branch_fallback', setup: ws(runtimeBacktrackingDemoFacts), expect: ['!direct_precondition_fallback'] }
  ]
}
