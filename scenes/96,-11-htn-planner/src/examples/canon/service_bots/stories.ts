// The SS14 service bots (medic, cleaner, fire, hug) as `overrides` of one `ServiceBot` base: the host and the stories
// (paper prototype; src/examples/canon/paper.ts). The scenarios are the files in worlds/<bot>/. Sources, licence and
// what was not ported: the .domain headers. Run a story: npm run htn:run -- --story medic_bot/the-medic-treats-two-patients
import { float } from '../../../htn-planner'
import { drop, num, story } from '../paper'
import type { PaperHost, Story } from '../paper'
import { CREATURE_HOST } from '../creatures/stories'

/** SS14 `NPCRecentlyInjectedComponent.RemoveTime`: one minute. */
export const TREATED_LIFETIME = 60

/**
 * The bots' executors, as world effects, with the creatures' `!move_near` and `!wait_until` (and their idle clock):
 * - `!say ?line`: `(spoke ?line ?now)`, read by the speech cooldown;
 * - `!mark_treated ?p` / `!mark_hugged ?p`: the mark the target filter reads, and the host's own `(marked_at ?p ?t)`
 *   from which the sensors remove the mark after `markLifetime` seconds (SS14: the perception system's accumulator);
 * - `!clean ?e`, `!extinguish ?e`: the puddle or the fire is gone (the sensor stops publishing it);
 * - `!inject`, `!hug`, `!melee_attack`, `!wait`: no fact the bots read (the patient's health is the game's).
 */
export function botHost(markLifetime = TREATED_LIFETIME): PaperHost {
  return {
    clock: true,
    effects: {
      '!move_near': CREATURE_HOST.effects!['!move_near'],
      '!wait_until': CREATURE_HOST.effects!['!wait_until'],
      '!say': ([line], w, now) => {
        drop(w, 'spoke', 2, line)
        w.add('spoke', line, float(now))
      },
      '!mark_treated': ([p], w, now) => {
        w.add('recently_treated', p)
        w.add('marked_at', p, float(now))
      },
      '!mark_hugged': ([p], w, now) => {
        w.add('recently_hugged', p)
        w.add('marked_at', p, float(now))
      },
      '!clean': ([e], w) => {
        drop(w, 'puddle', 1, e)
        drop(w, 'distance_to', 2, e)
      },
      '!extinguish': ([e], w) => {
        drop(w, 'on_fire', 1, e)
        drop(w, 'distance_to', 2, e)
      }
    },
    duration: (name, args, now) => (name === '!wait' ? num(args[0]) : CREATURE_HOST.duration!(name, args, now)),
    sense: (w, now) => {
      CREATURE_HOST.sense!(w, now)
      for (const [p, at] of w.rows('marked_at', 2).slice()) {
        if (num(at) + markLifetime > now) continue
        drop(w, 'marked_at', 2, p)
        drop(w, 'recently_treated', 1, p)
        drop(w, 'recently_hugged', 1, p)
      }
    }
  }
}

export const SERVICE_BOT_STORIES: Story[] = [
  story({
    station: 'medic_bot',
    name: 'the medic treats two patients',
    blurb: 'lines on cooldown are skipped; the first mark expires (lifetime 10 s here) and the medic comes back',
    facts: 'patient alice\npatient bob\ndistance_to alice 6.0\ndistance_to bob 3.0',
    method: 'behave',
    host: botHost(10),
    maxSteps: 14,
    expect: [
      'plan: !say start_inject, !move_near alice 1.5, !inject alice, !mark_treated alice, !say finish_inject',
      'run !say start_inject',
      'run !move_near alice 1.5',
      'run !inject alice',
      'run !mark_treated alice',
      'run !say finish_inject',
      'plan: !move_near bob 1.5, !inject bob, !mark_treated bob',
      'run !move_near bob 1.5',
      'run !inject bob',
      'run !mark_treated bob',
      'plan: !idle_wait 2.0 7.0',
      'run !idle_wait 2.0 7.0',
      'plan: !idle_wait 2.0 7.0',
      'run !idle_wait 2.0 7.0',
      'plan: !idle_wait 2.0 7.0',
      'run !idle_wait 2.0 7.0',
      'plan: !inject alice, !mark_treated alice, !say finish_inject',
      'run !inject alice',
      'run !mark_treated alice',
      'run !say finish_inject',
      'stop: 14 steps'
    ]
  }),
  story({
    station: 'fire_bot',
    name: 'the alarm again after a replan',
    blurb: 'a fire bot walking to a fire is replanned on the way and raises the alarm again (as the source)',
    facts: 'on_fire stove\ndistance_to stove 7.0\nidle_spot spot_a',
    method: 'behave',
    host: botHost(),
    until: w => w.rows('on_fire', 1).length === 0,
    events: [{ afterStep: 2, note: 'perception tick', replan: true }],
    expect: [
      'plan: !say fire_detected, !move_near stove 1.5, !wait 1.0, !extinguish stove',
      'run !say fire_detected',
      'run !move_near stove 1.5',
      'event: perception tick',
      'switch: !say fire_detected, !wait 1.0, !extinguish stove',
      'run !say fire_detected',
      'run !wait 1.0',
      'run !extinguish stove',
      'until: done'
    ]
  }),
  story({
    station: 'cleaner_bot',
    name: 'puddles best first, then idle',
    blurb: 'a cleaner bot works through the puddles the sensor lists, best first, then idles',
    facts: 'puddle puddle_1\npuddle puddle_2\ndistance_to puddle_1 2.0\ndistance_to puddle_2 5.0\nidle_spot spot_a',
    method: 'behave',
    host: botHost(),
    maxSteps: 5,
    expect: [
      'plan: !move_near puddle_1 1.0, !clean puddle_1',
      'run !move_near puddle_1 1.0',
      'run !clean puddle_1',
      'plan: !move_near puddle_2 1.0, !clean puddle_2',
      'run !move_near puddle_2 1.0',
      'run !clean puddle_2',
      'plan: !move_to spot_a, !idle_wait 2.0 7.0',
      'run !move_to spot_a',
      'stop: 5 steps'
    ]
  })
]
