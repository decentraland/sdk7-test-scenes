// Gallery station: Human, eat the first edible, unspoiled fruit; !eat writes is_eating.
import { humanFacts } from '../generated/human.facts'
import { humanDomain } from '../generated/human.htn'
import { humanAxiomBacktrackingFacts } from '../generated/human_axiom_backtracking.facts'
import { GalleryStation, put, S, same, ws } from '../stations'

export const humanStation: GalleryStation = {
  id: 'human',
  title: 'Human',
  blurb: 'eat the first edible, unspoiled fruit; !eat writes is_eating',
  domain: humanDomain,
  effects: { '!eat': (args, w) => put(w, 'is_eating', args[0]) },
  scenarios: [
    { name: 'apple to peel', method: 'behave', setup: ws(humanFacts), expect: ['!take "apple"', '!peel "apple"', '!eat "apple"'] },
    { name: 'axiom backtracking', method: 'behave', setup: ws(humanAxiomBacktrackingFacts), expect: ['!take "orange"', '!eat "orange"'] },
    {
      name: 'wrapped apple',
      method: 'behave',
      setup: ws(humanFacts, w => {
        w.removeWhere('has_peel', 1, r => same(r[0], S('apple')))
        w.add('is_wrapped', S('apple'))
      }),
      expect: ['!take "apple"', '!unwrap "apple"', '!eat "apple"']
    },
    { name: 'upper body', method: 'behave_upper_body', setup: ws(humanFacts), expect: ['!talk "This fruit is very tasty!"'] }
  ]
}
