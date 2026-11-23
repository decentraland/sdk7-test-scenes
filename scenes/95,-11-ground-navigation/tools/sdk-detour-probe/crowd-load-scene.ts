import { engine, executeTask } from '@dcl/sdk/ecs'
import { init } from 'recast-navigation'
import { createCrowdLoadTrial, CROWD_LOAD_TRIALS } from './crowd-load'
import { createCrowdLoadBackends, type CrowdLoadData } from './crowd-load-backends'

export function runCrowdLoadScene(data: CrowdLoadData) {
  const log = (event: unknown) => console.log('[crowd-load] ' + JSON.stringify(event))
  const host = globalThis as typeof globalThis & { performance?: { now(): number } }
  const timer = typeof host.performance?.now === 'function' ? 'performance.now' : 'Date.now'
  const now = () => host.performance?.now() ?? Date.now()
  executeTask(async () => {
    try {
      await init()
      const runtime = createCrowdLoadBackends(data)
      let current: ReturnType<typeof createCrowdLoadTrial> | undefined
      let index = 0
      log({ stage: 'start', timer, trials: CROWD_LOAD_TRIALS.length })
      function tick() {
        try {
          current ??= createCrowdLoadTrial(CROWD_LOAD_TRIALS[index], runtime.backends, now)
          if (!current.step()) return
          for (const result of current.result()) log({ stage: 'result', ...result })
          current.dispose()
          current = undefined
          index++
          if (index === CROWD_LOAD_TRIALS.length) {
            engine.removeSystem(tick)
            runtime.dispose()
            log({ stage: 'done' })
          }
        } catch (error) {
          engine.removeSystem(tick)
          current?.dispose()
          runtime.dispose()
          log({ stage: 'failed', trial: CROWD_LOAD_TRIALS[index], error: String(error) })
        }
      }
      engine.addSystem(tick)
    } catch (error) {
      log({ stage: 'failed', error: String(error) })
    }
  })
}
