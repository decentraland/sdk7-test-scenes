// HTN planner test scene: the library is src/htn-planner (copy it to use it), the example domains are
// src/examples. Ambush starts on entry; the Playgrounds menu on the right switches or restarts playgrounds.
import { PLAYGROUNDS } from './playgrounds'
import { setupPlaygroundMenu } from './spawn/ui'
import { spawnWhenReady } from './spawn/spawner'
import { setupDebugger } from './debugger/ui/panel'
import { sceneClock } from './htn-planner'

export function main() {
  // The simulation clock's system first, ahead of every system that reads it (the debugger pauses and scales it).
  sceneClock()
  setupPlaygroundMenu(PLAYGROUNDS)
  // The HTN debugger (src/debugger): the 'HTN debugger' button, or click an NPC.
  setupDebugger()
  const initial = PLAYGROUNDS.find(p => p.id === 'ambush')
  if (initial) spawnWhenReady(initial)
}
