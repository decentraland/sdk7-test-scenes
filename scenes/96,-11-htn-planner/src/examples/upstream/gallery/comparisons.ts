// Gallery station: Builtin comparisons, == != < <= > >= on health, ammo, distance.
import { sym } from '../../../htn-planner'
import { builtinComparisonsCriticalFacts } from '../generated/builtin_comparisons_critical.facts'
import { builtinComparisonsEngageFacts } from '../generated/builtin_comparisons_engage.facts'
import { builtinComparisonsOutOfAmmoFacts } from '../generated/builtin_comparisons_out_of_ammo.facts'
import { builtinComparisonsSafeFacts } from '../generated/builtin_comparisons_safe.facts'
import { builtinComparisonsDomain } from '../generated/BuiltinComparisonsDemo.htn'
import { GalleryStation, put, ws } from '../stations'

export const comparisonsStation: GalleryStation = {
  id: 'comparisons',
  title: 'Builtin comparisons',
  blurb: '== != < <= > >= on health, ammo, distance',
  domain: builtinComparisonsDomain,
  scenarios: [
    { name: 'critical', method: 'run', setup: ws(builtinComparisonsCriticalFacts), expect: ['!report_comparison_case "critical_close_combat" 20 3 6 combat'] },
    { name: 'engage', method: 'run', setup: ws(builtinComparisonsEngageFacts), expect: ['!report_comparison_case "ready_to_engage" 80 12 15 combat'] },
    { name: 'out of ammo', method: 'run', setup: ws(builtinComparisonsOutOfAmmoFacts), expect: ['!report_comparison_case "out_of_ammo" 60 0 8 combat'] },
    { name: 'safe', method: 'run', setup: ws(builtinComparisonsSafeFacts), expect: ['!report_comparison_case "safe_non_combat" 90 8 35 idle'] },
    {
      name: 'safe, but mode combat',
      method: 'run',
      setup: ws(builtinComparisonsSafeFacts, w => put(w, 'mode', sym('combat'))),
      expect: ['!report_comparison_case "fallback"']
    }
  ]
}
