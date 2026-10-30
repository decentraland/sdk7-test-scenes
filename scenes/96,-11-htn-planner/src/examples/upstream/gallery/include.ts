// Gallery station: Include demo, reusable included modules: react to events, navigate.
import { sym } from '../../../htn-planner'
import { includeDemoDomain } from '../generated/include_demo.htn'
import { E, GalleryStation, S } from '../stations'

export const includeStation: GalleryStation = {
  id: 'include',
  title: 'Include demo',
  blurb: 'reusable included modules: react to events, navigate',
  domain: includeDemoDomain,
  scenarios: [
    { name: 'no entity', method: 'run_include_demo', setup: () => {}, expect: ['!log "No active entity for include demo"'] },
    { name: 'calm', method: 'run_include_demo', setup: w => w.add('controlled_entity', E(1)), expect: ['!continue_normal_behavior 1', '!wait_for_route 1'] },
    {
      name: 'heard footsteps',
      method: 'run_include_demo',
      setup: w => {
        w.add('controlled_entity', E(1))
        w.add('event_recently_heard', E(1), sym('footsteps'))
        w.add('objective_route', E(1), S('route_A'))
      },
      expect: ['!inspect_event footsteps', '!follow_route "route_A"']
    },
    {
      name: 'explosion seen',
      method: 'run_include_demo',
      setup: w => {
        w.add('controlled_entity', E(1))
        w.add('event_visible', E(1), sym('explosion'))
        w.add('event_dangerous', sym('explosion'))
        w.add('route_blocked', S('route_A'))
      },
      expect: ['!face_event explosion', '!raise_alert 1 explosion', '!wait_for_route 1']
    }
  ]
}
