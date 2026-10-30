// The scene's simulation clock (sim-clock.ts) and the system that advances it once per frame, ahead of every other
// system: GuardSquad's system, the player noise system and a host's own loop read `sceneClock().dt` (or run through
// `sceneClock().each(maxStep, update)`) instead of the engine's dt, so one pause / step / time scale holds them all.
// The system is added on the first sceneClock() call; call it once at scene start (main) so it is in place before
// any system runs. No `~system/*` imports: runs headless in tests.
import { engine } from '@dcl/sdk/ecs'
import { SimClock } from './sim-clock'

/** Above every regular system (SYSTEMS_REGULAR_PRIORITY is 100e3): the clock moves before anything reads it. */
export const SIM_CLOCK_PRIORITY = 1e9

const clock = new SimClock()
let installed = false

/** The scene's simulation clock; adds the system that advances it on the first call. */
export function sceneClock(): SimClock {
  if (!installed) {
    installed = true
    engine.addSystem(dt => {
      clock.advance(dt)
    }, SIM_CLOCK_PRIORITY, 'htn-sim-clock')
  }
  return clock
}
