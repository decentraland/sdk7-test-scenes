// Ore to gold, the host and the story (paper prototype; src/examples/canon/paper.ts): bevy_htn's miner (MIT; see
// ore_to_gold.domain and ../THIRD_PARTY_NOTICES.md). The scenarios (worlds/ore_to_gold/) are every stage of the chain;
// the story earns the gold from nothing. Run it: npm run htn:run -- --story ore_to_gold/earn-three-gold-from-nothing
import { int, sym } from '../../../htn-planner'
import { count, story } from '../paper'
import type { PaperHost, Story } from '../paper'

/** The miner's executors reduced to the facts they write (the source's effects). */
export const MINER_HOST: PaperHost = {
  effects: {
    '!go_to': ([place], w) => w.set('location', place),
    '!mine_ore': (_args, w) => {
      w.set('has_ore')
      w.set('location', sym('outside'))
    },
    '!smelt_ore': (_args, w) => {
      w.clear('has_ore', 0)
      w.set('has_metal')
    },
    '!sell_metal': (_args, w) => {
      w.set('gold', int(count(w, 'gold') + 1))
      w.clear('has_metal', 0)
    }
  }
}

export const CRAFTING_STORIES: Story[] = [
  story({
    station: 'ore_to_gold',
    name: 'earn three gold from nothing',
    blurb: 'the whole chain three times, one stage per decomposition, then the empty plan of enough_gold',
    from: '1_start_with_nothing',
    method: 'earn_gold',
    host: MINER_HOST,
    maxSteps: 40,
    show: ['gold'],
    expect: [
      'plan: !go_to ore, !mine_ore, &earn_gold',
      'run !go_to ore',
      'run !mine_ore',
      'expand &earn_gold: !go_to smelter, &ore_to_metal, &earn_gold',
      'run !go_to smelter',
      'expand &ore_to_metal: !smelt_ore, !go_to outside',
      'run !smelt_ore',
      'run !go_to outside',
      'expand &earn_gold: !go_to merchant, &metal_to_gold, &earn_gold',
      'run !go_to merchant',
      'expand &metal_to_gold: !sell_metal, !go_to outside',
      'run !sell_metal',
      'run !go_to outside',
      'expand &earn_gold: !go_to ore, !mine_ore, &earn_gold',
      'run !go_to ore',
      'run !mine_ore',
      'expand &earn_gold: !go_to smelter, &ore_to_metal, &earn_gold',
      'run !go_to smelter',
      'expand &ore_to_metal: !smelt_ore, !go_to outside',
      'run !smelt_ore',
      'run !go_to outside',
      'expand &earn_gold: !go_to merchant, &metal_to_gold, &earn_gold',
      'run !go_to merchant',
      'expand &metal_to_gold: !sell_metal, !go_to outside',
      'run !sell_metal',
      'run !go_to outside',
      'expand &earn_gold: !go_to ore, !mine_ore, &earn_gold',
      'run !go_to ore',
      'run !mine_ore',
      'expand &earn_gold: !go_to smelter, &ore_to_metal, &earn_gold',
      'run !go_to smelter',
      'expand &ore_to_metal: !smelt_ore, !go_to outside',
      'run !smelt_ore',
      'run !go_to outside',
      'expand &earn_gold: !go_to merchant, &metal_to_gold, &earn_gold',
      'run !go_to merchant',
      'expand &metal_to_gold: !sell_metal, !go_to outside',
      'run !sell_metal',
      'run !go_to outside',
      'expand &earn_gold: (empty)',
      'plan: (empty)',
      'gold: 3'
    ]
  })
]
