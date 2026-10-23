// Gallery station: Grunt / Ninja / Elite, domain inheritance: overrides, Base:: calls, constants.
import { eliteNinjaDomain } from '../generated/EliteNinja.htn'
import { eliteNinjaFacts } from '../generated/elite_ninja.facts'
import { gruntDomain } from '../generated/Grunt.htn'
import { normalNinjaDomain } from '../generated/NormalNinja.htn'
import { GalleryStation, ws } from '../stations'

export const ninjasStation: GalleryStation = {
  id: 'ninjas',
  title: 'Grunt / Ninja / Elite',
  blurb: 'domain inheritance: overrides, Base:: calls, constants',
  domain: gruntDomain,
  scenarios: [
    { name: 'Grunt', method: 'run', setup: () => {}, expect: ['!attack "normal_attack" 1'] },
    { name: 'NormalNinja', domain: normalNinjaDomain, method: 'run', setup: () => {}, expect: ['!attack "ninja_attack" 1'] },
    { name: 'EliteNinja', domain: eliteNinjaDomain, method: 'run', setup: () => {}, expect: ['!attack "elite_ninja_attack" 1'] },
    // elite_ninja.worldstate: its fact is the second arm of EliteNinja's `or`; the first, the empty base axiom, always
    // holds, so the plan is the same as without it.
    {
      name: 'EliteNinja, elite move',
      domain: eliteNinjaDomain,
      method: 'run',
      setup: ws(eliteNinjaFacts),
      expect: ['!attack "elite_ninja_attack" 1']
    }
  ]
}
