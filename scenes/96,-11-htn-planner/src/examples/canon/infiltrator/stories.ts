// infiltrator, the host and the story (paper prototype; src/examples/canon/paper.ts). The scenarios are the files in
// worlds/infiltrator/. Run the story: npm run htn:run -- --story infiltrator/a-pickup-ends-the-known-part-of-the-plan
import { put } from '../paper'
import type { PaperHost, Story } from '../paper'

/** What each action does to the NPC's world (the host's sensors would report the same). */
export const INFILTRATOR_HOST: PaperHost = {
  effects: {
    '!go_to_area': ([area], w) => put(w, 'npc_in', area),
    '!switch_lights': ([area, state], w) => {
      w.removeWhere('lights', 2, r => r[0].v === area.v)
      w.add('lights', area, state)
    },
    '!pick_up': ([item], w) => {
      w.add('holding', item)
      w.removeWhere('reachable_item', 2, r => r[0].v === item.v)
    },
    '!make_contact': (_args, w) => void w.add('player_aware')
  }
}

export const INFILTRATOR_STORIES: Story[] = [
  {
    station: 'infiltrator',
    name: 'a pickup ends the known part of the plan',
    blurb: 'an unarmed NPC fetches a gun; the deferred &behave plans the attack with the gun it just picked up',
    play: stage => {
      const npc = stage.agent({ world: stage.scenario('4_arm_first_fetch_gun'), method: 'behave', host: INFILTRATOR_HOST })
      npc.tick()
      npc.run()
      npc.show('holding')
    },
    expect: [
      'plan: !go_to_area armory, !walk_to box_a, !switch_lights armory on, !pick_up g3, &behave',
      'run !go_to_area armory',
      'run !walk_to box_a',
      'run !switch_lights armory on',
      'run !pick_up g3',
      'expand &behave: !go_to_area hall, !walk_to box_h, !switch_lights hall on, !make_contact p1, !shoot p1 g3',
      'run !go_to_area hall',
      'run !walk_to box_h',
      'run !switch_lights hall on',
      'run !make_contact p1',
      'run !shoot p1 g3',
      'holding: g3'
    ]
  }
]
