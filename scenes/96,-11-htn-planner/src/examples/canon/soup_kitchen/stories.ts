// soup_kitchen, the host and the story (paper prototype; src/examples/canon/paper.ts). The scenarios are the files in
// worlds/soup_kitchen/. Run the story: npm run htn:run -- --story soup_kitchen/a-soup-in-a-split-kitchen
import { sym } from '../../../htn-planner'
import type { Atom, WorldState } from '../../../htn-planner'
import type { PaperHost, Story } from '../paper'

const holds = (w: WorldState, who: Atom) => w.rows('holding', 2).find(r => r[0].v === who.v)?.[1]
function setHolding(w: WorldState, who: Atom, what: Atom) {
  w.removeWhere('holding', 2, r => r[0].v === who.v)
  w.add('holding', who, what)
}

/**
 * The kitchen: an interaction follows the exchange table the domain reads (as the source's a-interact does; no rule:
 * the step fails), a pot that now holds a dish's start label is cooking it; a wait cooks one stage.
 */
export const KITCHEN_HOST: PaperHost = {
  effects: {
    '!interact': ([agent, target], w) => {
      const a = holds(w, agent)
      const t = holds(w, target)
      const rule = w.rows('exchange', 6).find(r => r[0].v === agent.v && r[1].v === target.v && r[2].v === a?.v && r[3].v === t?.v)
      if (rule === undefined) return false
      setHolding(w, agent, rule[4])
      setHolding(w, target, rule[5])
      const start = w.rows('start_label', 2).find(r => r[1].v === rule[5].v)
      if (start) w.add('cooking', target, start[0])
    },
    '!wait': ([, pot], w) => {
      const next = w.rows('cooking_progress', 2).find(r => r[0].v === holds(w, pot)?.v)
      if (next === undefined) return false
      setHolding(w, pot, next[1])
      if (w.rows('cooking', 2).some(r => r[0].v === pot.v && r[1].v === next[1].v)) w.removeWhere('cooking', 2, r => r[0].v === pot.v)
    }
  }
}

export const SOUP_STORIES: Story[] = [
  {
    station: 'soup_kitchen',
    name: 'a soup in a split kitchen',
    blurb: 'one phase per planning run, everything handed over the counter; the deferred wait loop holds the delivery',
    play: stage => {
      const team = stage.agent({ world: stage.scenario('2_add_onion_through_counter'), method: 'make_soup', args: [sym('soup'), sym('delivery')], host: KITCHEN_HOST })
      for (let run = 0; run < 5; run++) {
        stage.at(run)
        team.tick()
        if (!team.running) break
        team.run()
      }
      team.show('holding')
    },
    expect: [
      'plan: !interact chef1 onion_pile, !interact chef1 counter, !interact chef2 counter, !interact chef2 pot1',
      'run !interact chef1 onion_pile',
      'run !interact chef1 counter',
      'run !interact chef2 counter',
      'run !interact chef2 pot1',
      'plan: !interact chef2 pot1',
      'run !interact chef2 pot1',
      'plan: !interact chef1 bowl_pile, !interact chef1 counter, !interact chef2 counter, &wait_cooking chef2 pot1 soup, !interact chef2 pot1, !interact chef2 delivery',
      'run !interact chef1 bowl_pile',
      'run !interact chef1 counter',
      'run !interact chef2 counter',
      'expand &wait_cooking chef2 pot1 soup: !wait chef2 pot1, &wait_cooking chef2 pot1 soup',
      'run !wait chef2 pot1',
      'expand &wait_cooking chef2 pot1 soup: !wait chef2 pot1, &wait_cooking chef2 pot1 soup',
      'run !wait chef2 pot1',
      'expand &wait_cooking chef2 pot1 soup: !wait chef2 pot1, &wait_cooking chef2 pot1 soup',
      'run !wait chef2 pot1',
      'expand &wait_cooking chef2 pot1 soup: (empty)',
      'run !interact chef2 pot1',
      'run !interact chef2 delivery',
      'plan: (empty)',
      'holding: onion_pile onion, bowl_pile bowl, chef1 empty, counter empty, pot1 empty, chef2 empty, delivery soup'
    ]
  }
]
