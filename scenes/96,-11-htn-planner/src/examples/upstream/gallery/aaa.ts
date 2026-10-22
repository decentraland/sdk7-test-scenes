// Gallery station: AAA Combat NPC, orders > combat > investigation > search > idle.
import { int, sym } from '../../../htn-planner'
import { aaaEligibleCombatDomain } from '../adapted/AAACombatNPC.htn'
import { aaaCombatDomain } from '../generated/AAACombatNPC.htn'
import { aaaCombatNPCHighOrderFacts } from '../generated/AAACombatNPC_high_order.facts'
import { aaaCombatNPCIdleFacts } from '../generated/AAACombatNPC_idle.facts'
import { aaaCombatNPCInvestigationFacts } from '../generated/AAACombatNPC_investigation.facts'
import { aaaCombatNPCLowOrderFacts } from '../generated/AAACombatNPC_low_order.facts'
import { aaaCombatNPCMediumOrderFacts } from '../generated/AAACombatNPC_medium_order.facts'
import { aaaCombatNPCMeleeFacts } from '../generated/AAACombatNPC_melee.facts'
import { aaaCombatNPCRangedFacts } from '../generated/AAACombatNPC_ranged.facts'
import { aaaCombatNPCSearchFacts } from '../generated/AAACombatNPC_search.facts'
import { drop, E, GalleryStation, put, S, ws } from '../stations'

export const aaaStation: GalleryStation = {
  id: 'aaa',
  title: 'AAA Combat NPC',
  blurb: 'orders > combat > investigation > search > idle',
  domain: aaaCombatDomain,
  scenarios: [
    {
      name: 'idle: patrol',
      method: 'run',
      setup: ws(aaaCombatNPCIdleFacts),
      expect: ['!announce_state "idle" 1', '!follow_patrol_route 1 "north_loop"', '!inspect_checkpoint 1 "checkpoint_alpha"', '!report_patrol_progress 1 "checkpoint_alpha"']
    },
    {
      name: 'idle: hurt, has a medkit',
      method: 'run',
      setup: ws(aaaCombatNPCIdleFacts, w => {
        put(w, 'health', E(1), int(30))
        put(w, 'medkit_available', E(1))
      }),
      expect: ['!announce_state "idle" 1', '!use_medkit 1', '!check_equipment 1']
    },
    {
      name: 'idle: no checkpoint, ally near',
      method: 'run',
      setup: ws(aaaCombatNPCIdleFacts, w => {
        drop(w, 'patrol_checkpoint', 2)
        put(w, 'nearby_ally', E(1), E(7))
        put(w, 'social_cooldown_ready', E(1))
      }),
      expect: ['!announce_state "idle" 1', '!greet_ally 1 7', '!exchange_status 1 7']
    },
    {
      name: 'melee: nearest enemy',
      method: 'run',
      setup: ws(aaaCombatNPCMeleeFacts),
      expect: ['!announce_state "combat" 1', '!switch_weapon 1 melee', '!quick_melee_attack 1 202']
    },
    {
      name: 'melee: low health, retreat',
      method: 'run',
      setup: ws(aaaCombatNPCMeleeFacts, w => {
        put(w, 'health', E(1), int(15))
        put(w, 'retreat_route', E(1), S('back_alley'))
      }),
      expect: ['!announce_state "combat" 1', '!remember_enemy 1 202', '!throw_smoke 1', '!retreat_via 1 "back_alley"']
    },
    {
      name: 'melee: enemy attacking, parry',
      method: 'run',
      setup: ws(aaaCombatNPCMeleeFacts, w => {
        put(w, 'weapon_equipped', E(1), sym('melee'))
        put(w, 'enemy_attacking', E(202))
      }),
      expect: ['!announce_state "combat" 1', '!face_enemy 1 202', '!parry_attack 1 202', '!counter_attack 1 202']
    },
    {
      name: 'ranged',
      method: 'run',
      setup: ws(aaaCombatNPCRangedFacts),
      expect: ['!announce_state "combat" 1', '!switch_weapon 1 ranged', '!aim_at 1 302', '!fire_controlled_burst 1 302']
    },
    {
      name: 'ranged: under fire, cover',
      method: 'run',
      setup: ws(aaaCombatNPCRangedFacts, w => {
        put(w, 'weapon_equipped', E(1), sym('ranged'))
        put(w, 'under_fire', E(1))
      }),
      expect: ['!announce_state "combat" 1', '!move_to_cover 1 "concrete_barrier"', '!peek_from_cover 1 302', '!fire_controlled_burst 1 302']
    },
    {
      name: 'investigation',
      method: 'run',
      setup: ws(aaaCombatNPCInvestigationFacts),
      expect: ['!announce_state "investigation" 1', '!move_to_cover 1 "pillar_7"', '!report_suspicious_sound 1 "upper_walkway"', '!scan_sector 1 "upper_walkway"']
    },
    {
      name: 'search: lost enemy',
      method: 'run',
      setup: ws(aaaCombatNPCSearchFacts),
      expect: ['!announce_state "search" 1', '!announce_lost_enemy 1 501', '!follow_enemy_tracks 1 "muddy_corridor"', '!scan_sector 1 "warehouse"']
    },
    {
      name: 'high order: evacuate',
      method: 'run',
      setup: ws(aaaCombatNPCHighOrderFacts),
      expect: ['!announce_state "high_order" 1', '!mark_order_started 1 evacuate', '!deploy_smoke 1', '!move_to_order_target 1 "extraction_zone"', '!mark_order_complete 1 evacuate']
    },
    {
      name: 'medium order: escort',
      method: 'run',
      setup: ws(aaaCombatNPCMediumOrderFacts),
      expect: ['!announce_state "medium_order" 1', '!mark_order_started 1 escort', '!follow_escort_route 1 "scientist" "service_tunnel"']
    },
    {
      name: 'low order: guard',
      method: 'run',
      setup: ws(aaaCombatNPCLowOrderFacts),
      expect: ['!announce_state "low_order" 1', '!mark_order_started 1 guard', '!guard_target 1 "west_gate"']
    },
    {
      name: 'adapted: nearest eligible enemy ignores the dead rival',
      domain: aaaEligibleCombatDomain,
      method: 'run',
      setup: w => {
        w.add('controlled_npc', int(1))
        for (const [id, distance] of [[101, 2], [202, 5]]) {
          w.add('visible_enemy', int(1), int(id))
          w.add('hostile_enemy', int(id))
          w.add('enemy_distance', int(1), int(id), int(distance))
        }
        w.add('enemy_dead', int(101))
      },
      expect: ['!announce_state "combat" 1', '!dodge_enemy 1 202', '!improvised_melee_attack 1 202']
    }
  ]
}
