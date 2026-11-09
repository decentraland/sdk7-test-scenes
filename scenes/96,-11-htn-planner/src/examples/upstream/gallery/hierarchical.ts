// Gallery station: Hierarchical backtracking, a child method fails: does the parent try its next branch?.
import { hierarchicalBacktrackingDomain } from '../generated/hierarchical_backtracking.htn'
import { hierarchicalBacktrackingNoCombatFacts } from '../generated/hierarchical_backtracking_no_combat.facts'
import { GalleryStation, ws } from '../stations'

export const hierarchicalStation: GalleryStation = {
  id: 'hierarchical',
  title: 'Hierarchical backtracking',
  blurb: 'a child method fails: does the parent try its next branch?',
  domain: hierarchicalBacktrackingDomain,
  modes: true,
  scenarios: [
    { name: 'child guard', method: 'validate_child_guard', setup: ws(hierarchicalBacktrackingNoCombatFacts), expect: ['!search enemy'] },
    { name: 'parent guard', method: 'validate_parent_guard', setup: ws(hierarchicalBacktrackingNoCombatFacts), expect: ['!search enemy'] },
    { name: 'fact backtracking', method: 'validate_fact_backtracking', setup: ws(hierarchicalBacktrackingNoCombatFacts), expect: ['!selected_fact second'] },
    { name: 'axiom backtracking', method: 'validate_axiom_backtracking', setup: ws(hierarchicalBacktrackingNoCombatFacts), expect: ['!selected_axiom second'] },
    {
      name: 'in combat',
      method: 'validate_child_guard',
      setup: ws(hierarchicalBacktrackingNoCombatFacts, w => w.add('in_combat_state')),
      expect: ['!fire enemy']
    }
  ]
}
