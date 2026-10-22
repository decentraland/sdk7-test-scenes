// sentry_turret, the host and the story (paper prototype; src/examples/canon/paper.ts). The scenarios are the files
// in worlds/sentry_turret/. Run the story: npm run htn:run -- --story sentry_turret/a-continue-branch-keeps-the-attack
import { float, sym } from '../../../htn-planner'
import { ACTIVE_PLAN, clearAll } from '../paper'
import type { PaperHost, Story } from '../paper'

/** The turret's host: only the plan brackets write facts (aiming and firing are the game's). */
export const TURRET_HOST: PaperHost = { effects: ACTIVE_PLAN.effects, dropped: ACTIVE_PLAN.dropped }

export const SENTRY_STORIES: Story[] = [
  {
    station: 'sentry_turret',
    name: 'a continue branch keeps the attack',
    blurb: 'at 5 Hz a closer soldier is ranked first, the turret keeps firing at the vehicle; a lost target ends it',
    play: stage => {
      const turret = stage.agent({ world: stage.scenario('03_vehicle_in_rocket_range'), method: 'behave', host: TURRET_HOST })
      const w = turret.world
      // Tick 1: the vehicle is the only threat; rockets are in hand.
      turret.tick()
      turret.run(2)
      turret.show('active_plan')
      // Tick 2, 0.2 s later: a soldier walks in closer and the sensors rank him first.
      stage.at(0.2)
      stage.event('a soldier walks in closer; the sensors rank him first', () => {
        clearAll(w, 'threat')
        w.add('threat', sym('h2'), sym('humanoid'))
        w.add('threat', sym('v1'), sym('vehicle'))
        w.add('distance_to', sym('h2'), float(10))
        w.add('line_of_fire', sym('h2'))
      })
      turret.matches('05_continue_running_attack')
      turret.tick()
      // Tick 3: the vehicle drives behind a wall; the continue branch no longer holds.
      stage.at(0.4)
      stage.event('the vehicle drives behind a wall', () => w.removeWhere('line_of_fire', 1, r => r[0].v === 'v1'))
      turret.matches('06_running_target_lost')
      turret.tick()
      turret.show('active_plan')
      turret.run()
      turret.show('active_plan')
    },
    expect: [
      'plan: !begin_plan attack v1, !aim_at v1, !fire rockets v1, !end_plan',
      'run !begin_plan attack v1',
      'run !aim_at v1',
      'active_plan: attack v1',
      'event: a soldier walks in closer; the sensors rank him first',
      'world is 05_continue_running_attack',
      'continue: !fire rockets v1, !end_plan',
      'event: the vehicle drives behind a wall',
      'world is 06_running_target_lost',
      'switch: !begin_plan attack h2, !switch_weapon bullets, !aim_at h2, !fire bullets h2, !end_plan',
      'active_plan: (none)',
      'run !begin_plan attack h2',
      'run !switch_weapon bullets',
      'run !aim_at h2',
      'run !fire bullets h2',
      'run !end_plan',
      'active_plan: (none)'
    ]
  }
]
