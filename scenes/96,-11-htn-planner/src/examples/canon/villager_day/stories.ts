// villager_day, the host and the story (paper prototype; src/examples/canon/paper.ts). The scenarios are the files in
// worlds/villager_day/. Run the story: npm run htn:run -- --story villager_day/a-morning-of-two-villagers
import { int, sym } from '../../../htn-planner'
import type { WorldState } from '../../../htn-planner'
import { clearAll, count, put } from '../paper'
import type { Agent, PaperHost, Story } from '../paper'

const setNum = (w: WorldState, name: string, n: number) => put(w, name, int(n))

/** What a step does to the villager's own world, and to the other villager's (a sale pays the keeper). */
export function villagerHost(other: () => WorldState): PaperHost {
  return {
    effects: {
      '!walk_to': ([place], w) => put(w, 'at', place),
      '!sleep_hour': (_args, w) => setNum(w, 'sleepiness', Math.max(0, count(w, 'sleepiness') - 5)),
      '!eat': (_args, w) => {
        setNum(w, 'hunger', 0)
        clearAll(w, 'has')
      },
      '!wait_for': (_args, w) => {
        const at = w.rows('at', 1)[0][0]
        const waited = w.rows('waited_at', 2).find(r => r[0].v === at.v)
        put(w, 'waited_at', at, int(waited ? Number(waited[1].v) + 1 : 1))
      },
      '!buy': ([item], w) => {
        setNum(w, 'money', count(w, 'money') - 5)
        w.add('has', item)
        clearAll(w, 'waited_at')
        setNum(other(), 'money', count(other(), 'money') + 5)
      },
      '!do_chores': (_args, w) => setNum(w, 'money', count(w, 'money') + 3)
    }
  }
}

/** The baker: the same village, her own needs, her own shop. */
const BAKER = `
hour 5
hunger 5
sleepiness 4
money 20
at cottage
home cottage
owns_shop bakery
opening_hours bakery 7 18
has food
shop bakery food baker
pastime chatting square
`

export const VILLAGER_STORIES: Story[] = [
  {
    station: 'villager_day',
    name: 'a morning of two villagers',
    blurb: 'one plan per game hour: the farmer waits for the baker, buys when she opens, then earns and rests',
    play: stage => {
      const worlds: { farmer?: WorldState; baker?: WorldState } = {}
      const farmer = stage.agent({ id: 'farmer', world: stage.scenario('1_night_sleeps'), method: 'spend_hour', host: villagerHost(() => worlds.baker!) })
      const baker = stage.agent({ id: 'baker', world: stage.facts(BAKER), method: 'spend_hour', host: villagerHost(() => worlds.farmer!) })
      worlds.farmer = farmer.world
      worlds.baker = baker.world
      const last = new Map<Agent, string>()
      for (let hour = 5; hour <= 10; hour++) {
        stage.at(hour)
        if (hour === 6) farmer.matches('2_hungry_waits_for_keeper')
        if (hour === 7) baker.matches('4_keeper_opens_shop')
        if (hour === 8) farmer.matches('5_keeper_present_buys')
        // Both plan from the hour's snapshot, then both run their hour.
        farmer.tick(`hour ${hour}`)
        baker.tick(`hour ${hour}`)
        for (const v of [farmer, baker]) last.set(v, v.run().pop() ?? last.get(v) ?? '')
        // The host's hour: needs grow (sleep lowers sleepiness instead), the clock moves, each villager learns
        // whether the baker is at the counter (she is when her last step was tending the shop).
        const atCounter = last.get(baker) === '!tend_shop bakery'
        for (const v of [farmer, baker]) {
          const w = v.world
          setNum(w, 'hour', count(w, 'hour') + 1)
          setNum(w, 'hunger', count(w, 'hunger') + 1)
          if (last.get(v) !== '!sleep_hour') setNum(w, 'sleepiness', count(w, 'sleepiness') + 1)
          clearAll(w, 'keeper_present')
          if (atCounter) w.add('keeper_present', sym('bakery'))
        }
      }
      baker.show('money')
    },
    expect: [
      'farmer: plan: !sleep_hour',
      'baker: plan: !sleep_hour',
      'farmer: run !sleep_hour',
      'baker: run !sleep_hour',
      'farmer: world is 2_hungry_waits_for_keeper',
      'farmer: plan: !walk_to bakery, !wait_for baker',
      'baker: plan: !eat',
      'farmer: run !walk_to bakery',
      'farmer: run !wait_for baker',
      'baker: run !eat',
      'baker: world is 4_keeper_opens_shop',
      'farmer: plan: !wait_for baker',
      'baker: plan: !walk_to bakery, !tend_shop bakery',
      'farmer: run !wait_for baker',
      'baker: run !walk_to bakery',
      'baker: run !tend_shop bakery',
      'farmer: world is 5_keeper_present_buys',
      'farmer: plan: !buy food baker, !eat',
      'baker: plan: !tend_shop bakery',
      'farmer: run !buy food baker',
      'farmer: run !eat',
      'baker: run !tend_shop bakery',
      'farmer: plan: !do_chores',
      'baker: plan: !tend_shop bakery',
      'farmer: run !do_chores',
      'baker: run !tend_shop bakery',
      'farmer: plan: !walk_to pond, !pass_hour fishing',
      'baker: plan: !tend_shop bakery',
      'farmer: run !walk_to pond',
      'farmer: run !pass_hour fishing',
      'baker: run !tend_shop bakery',
      'baker: money: 25'
    ]
  }
]
