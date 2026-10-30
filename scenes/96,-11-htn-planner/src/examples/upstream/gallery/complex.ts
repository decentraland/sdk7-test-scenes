// Gallery station: Complex scenario, axioms is_threat / can_engage, callterms, recursion.
import { complexScenarioDomain } from '../generated/complex_scenario.htn'
import { complexScenarioCombatFacts } from '../generated/complex_scenario_combat.facts'
import { complexScenarioEmergencyFacts } from '../generated/complex_scenario_emergency.facts'
import { complexScenarioIdleFacts } from '../generated/complex_scenario_idle.facts'
import { complexScenarioMobilityFacts } from '../generated/complex_scenario_mobility.facts'
import { complexScenarioRecoveryFacts } from '../generated/complex_scenario_recovery.facts'
import { complexScenarioRecursive100Facts } from '../generated/complex_scenario_recursive_100.facts'
import { drop, E, GalleryStation, S, ws } from '../stations'

export const complexStation: GalleryStation = {
  id: 'complex',
  title: 'Complex scenario',
  blurb: 'axioms is_threat / can_engage, callterms, recursion',
  domain: complexScenarioDomain,
  scenarios: [
    {
      name: 'combat',
      method: 'run_scenario',
      setup: ws(complexScenarioCombatFacts),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Combat response"', '!aim 202', '!fire 202']
    },
    {
      name: 'emergency',
      method: 'run_scenario',
      setup: ws(complexScenarioEmergencyFacts),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Emergency response"', '!move_to_cover "cover_A"', '!aim 101', '!fire 101']
    },
    {
      name: 'emergency: cover compromised',
      method: 'run_scenario',
      setup: ws(complexScenarioEmergencyFacts, w => {
        w.add('cover_compromised', S('cover_A'))
        w.add('retreat_route', E(7), S('route_B'))
      }),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Emergency response"', '!retreat "route_B"']
    },
    {
      name: 'recovery: medkit',
      method: 'run_scenario',
      setup: ws(complexScenarioRecoveryFacts),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Recovery response"', '!use_medkit 7']
    },
    {
      name: 'recovery: healing station',
      method: 'run_scenario',
      setup: ws(complexScenarioRecoveryFacts, w => {
        drop(w, 'medkit', 1)
        w.add('healing_station_nearby', E(7))
        w.add('healing_station', E(7), S('station_1'))
      }),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Recovery response"', '!move_to_healing_station "station_1"', '!heal_at_station "station_1"']
    },
    {
      name: 'mobility',
      method: 'run_scenario',
      setup: ws(complexScenarioMobilityFacts),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Mobility response"', '!sprint_to "route_A" 1.0']
    },
    {
      name: 'mobility: route dangerous',
      method: 'run_scenario',
      setup: ws(complexScenarioMobilityFacts, w => {
        w.add('route_dangerous', S('route_A'))
        w.add('alternate_route', E(7), S('route_C'))
      }),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Mobility response"', '!walk_to "route_C"']
    },
    {
      name: 'idle',
      method: 'run_scenario',
      setup: ws(complexScenarioIdleFacts),
      expect: ['!log "Scenario started" 7 50 1.0', '!log "Idle - no special action"']
    },
    {
      name: '100 entities (241 steps)',
      method: 'run_scenario',
      setup: ws(complexScenarioRecursive100Facts),
      expect: null // 241 steps from '!log "Recursive scenario started" 7 50 1.0' (checked by the tests)
    }
  ]
}
