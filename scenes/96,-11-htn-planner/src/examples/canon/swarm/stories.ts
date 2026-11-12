// swarm, the hosts and the story (paper prototype; src/examples/canon/paper.ts): a group planner feeding member
// planners. The scenarios are the files in worlds/swarm_coordinator/ and worlds/swarm_drone/. Run the story:
// npm run htn:run -- --story swarm_coordinator/roles-as-facts-from-the-coordinator
import { float, int, list, sym } from '../../../htn-planner'
import type { WorldState } from '../../../htn-planner'
import { ACTIVE_PLAN, put } from '../paper'
import type { PaperHost, Story } from '../paper'

/**
 * Partial teaching host: plan brackets and grab only. It does not execute release/delivery, navigation,
 * or automatically propagate carrier/role changes to the coordinator. The story below verifies
 * commitment and role decisions, not a complete collect-deliver-return cycle or all-agent progress.
 */
export const DRONE_HOST: PaperHost = {
  effects: { ...ACTIVE_PLAN.effects, '!grab': ([resource], w) => void w.add('holding', resource) },
  dropped: ACTIVE_PLAN.dropped
}

/** The coordinator's host: what it knows of the swarm, published as the coordinator's snapshot. */
export class SwarmKnowledge {
  members = ['d1', 'd2', 'd3', 'd4']
  carriers = new Set<string>()
  leader: string | undefined
  nextLeader = 'd1'
  leadTimeUp = false
  /** Unclaimed resources, best first. */
  resources = ['r1']
  collecting = new Map<string, string>()
  followers: string[] = []
  distances = new Map<string, number>()

  snapshot(w: WorldState): void {
    w.clearAll()
    w.add('swarm', sym('s1'))
    w.add('roster', list(...this.members.filter(m => !this.carriers.has(m)).map(m => sym(m))))
    if (this.leader) w.add('leader', sym(this.leader))
    w.add('next_leader', sym(this.nextLeader))
    if (this.leadTimeUp) w.add('lead_time_up')
    for (const f of this.followers) w.add('follower', sym(f))
    for (const [m, d] of this.distances) w.add('distance_to_leader', sym(m), float(d))
    for (const [m, r] of this.collecting) w.add('collecting', sym(m), sym(r))
    this.resources.filter(r => ![...this.collecting.values()].includes(r)).forEach((r, i) => w.add('free_resource', int(i + 1), sym(r)))
  }

  /** The orders of a plan (`!assign_role ?member ?role ?context`): the coordinator's own bookkeeping. */
  apply(plan: readonly string[]): void {
    this.followers = []
    this.collecting.clear()
    for (const step of plan) {
      const [, member, role, context] = step.split(' ')
      if (role === 'leader') this.leader = member
      if (role === 'follower') this.followers.push(member)
      if (role === 'collector') this.collecting.set(member, context)
    }
  }
}

export const SWARM_STORIES: Story[] = [
  {
    station: 'swarm_coordinator',
    name: 'roles as facts from the coordinator',
    blurb: 'a collector keeps its job through a replan, turns carrier when it grabs; the lead changes hands only with the swarm gathered',
    play: stage => {
      const swarm = new SwarmKnowledge()
      const coord = stage.agent({ id: 'coordinator', world: stage.scenario('1_first_lead'), method: 'organise_swarm' })
      const decide = () => {
        swarm.snapshot(coord.world)
        const plan = coord.tick('snapshot').plan
        coord.run() // the host sends the orders at once
        swarm.apply(plan)
      }
      // t = 0: the first decision. Each drone gets its role as a fact and plans from its own world.
      swarm.snapshot(coord.world)
      coord.matches('1_first_lead')
      decide()
      const drone = (id: string, scenario: string) =>
        stage.agent({ id, station: 'swarm_drone', world: stage.scenario(scenario, 'swarm_drone'), method: 'behave', host: DRONE_HOST })
      const d1 = drone('d1', '1_leader_roams')
      const d2 = drone('d2', '3_collector_sets_out')
      const d3 = drone('d3', '6_follower_follows')
      for (const d of [d1, d2, d3]) d.show('role')
      for (const d of [d1, d2, d3]) d.tick()
      d2.run(2)
      d3.run(2)

      // t = 0.5: nothing changed; the collector's replan keeps its running job (continue branch).
      stage.at(0.5)
      d2.matches('4_collector_keeps_going', 'swarm_drone')
      d2.tick()

      // t = 1: d2 grabs the resource; its plan ends and the next one delivers it.
      stage.at(1)
      d2.run()
      d2.matches('5_carrier_delivers', 'swarm_drone')
      d2.tick()

      // t = 2: d2 is a busy carrier and r1 is gone; r2 is found. The leader has led long enough but d4 is far: no
      // hand-over yet. d3 becomes a collector; its running follow ends with its old role.
      stage.at(2)
      stage.event('d2 carries r1 home, r2 is found, the lead time is up, d4 is far behind', () => {
        swarm.carriers.add('d2')
        swarm.collecting.delete('d2')
        swarm.resources = ['r2']
        swarm.leadTimeUp = true
        swarm.nextLeader = 'd4'
        swarm.distances = new Map([
          ['d3', 2.0],
          ['d4', 7.5]
        ])
      })
      swarm.snapshot(coord.world)
      coord.matches('3_lead_waits_for_stragglers')
      decide()
      stage.event('d3 hears its new role', () => put(d3.world, 'role', sym('collector'), sym('r2')))
      d3.tick()
      d3.show('active_plan')

      // t = 3: d4 caught up. The lead goes to d4; the collector keeps its resource, the old leader follows.
      stage.at(3)
      stage.event('d4 catches up', () => (swarm.distances = new Map([['d4', 2.5]])))
      swarm.snapshot(coord.world)
      coord.matches('2_hand_over_gathered')
      decide()
    },
    expect: [
      'coordinator: world is 1_first_lead',
      'coordinator: plan: !assign_role d1 leader s1, !assign_role d2 collector r1, !assign_role d3 follower d1, !assign_role d4 follower d1',
      'coordinator: run !assign_role d1 leader s1',
      'coordinator: run !assign_role d2 collector r1',
      'coordinator: run !assign_role d3 follower d1',
      'coordinator: run !assign_role d4 follower d1',
      'd1: role: leader s1',
      'd2: role: collector r1',
      'd3: role: follower d1',
      'd1: plan: !fly_to p1',
      'd2: plan: !begin_plan move_to_grab_resource r1, !fly_over r1, !descend r1, !grab r1, !climb, !end_plan',
      'd3: plan: !begin_plan follow_swarm_leader d1, !follow d1, !end_plan',
      'd2: run !begin_plan move_to_grab_resource r1',
      'd2: run !fly_over r1',
      'd3: run !begin_plan follow_swarm_leader d1',
      'd3: run !follow d1',
      'd2: world is 4_collector_keeps_going',
      'd2: continue: !descend r1, !grab r1, !climb, !end_plan',
      'd2: run !descend r1',
      'd2: run !grab r1',
      'd2: run !climb',
      'd2: run !end_plan',
      'd2: world is 5_carrier_delivers',
      'd2: plan: !begin_plan deliver_resource r1, !fly_to m1, !release r1 m1, !end_plan',
      'event: d2 carries r1 home, r2 is found, the lead time is up, d4 is far behind',
      'coordinator: world is 3_lead_waits_for_stragglers',
      'coordinator: plan: !assign_role d1 leader s1, !assign_role d3 collector r2, !assign_role d4 follower d1',
      'coordinator: run !assign_role d1 leader s1',
      'coordinator: run !assign_role d3 collector r2',
      'coordinator: run !assign_role d4 follower d1',
      'event: d3 hears its new role',
      'd3: switch: !begin_plan move_to_grab_resource r2, !fly_over r2, !descend r2, !grab r2, !climb, !end_plan',
      'd3: active_plan: (none)',
      'event: d4 catches up',
      'coordinator: world is 2_hand_over_gathered',
      'coordinator: plan: !assign_role d4 leader s1, !assign_role d1 follower d4, !assign_role d3 collector r2',
      'coordinator: run !assign_role d4 leader s1',
      'coordinator: run !assign_role d1 follower d4',
      'coordinator: run !assign_role d3 collector r2'
    ]
  }
]
