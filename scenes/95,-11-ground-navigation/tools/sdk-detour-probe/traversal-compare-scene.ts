import { engine, executeTask } from '@dcl/sdk/ecs'
import { init } from 'recast-navigation'
import { runTraversalComparison, runTraversalLinkComparison, TRAVERSAL_LINK_RUNS, TRAVERSAL_RUNS } from './traversal-compare'

export function runTraversalComparisonScene() {
  const log = (event: unknown) => console.log('[traversal-compare] ' + JSON.stringify(event))
  const host = globalThis as typeof globalThis & { performance?: { now(): number } }
  const now = () => host.performance?.now() ?? Date.now()
  executeTask(async () => {
    try {
      await init()
      let index = 0
      log({ stage: 'start', runs: TRAVERSAL_RUNS.length, links: TRAVERSAL_LINK_RUNS.length })
      function tick() {
        try {
          if (index < TRAVERSAL_RUNS.length) {
            log({ stage: 'run', ...runTraversalComparison(TRAVERSAL_RUNS[index], now) })
          } else {
            log({ stage: 'link', ...runTraversalLinkComparison(TRAVERSAL_LINK_RUNS[index - TRAVERSAL_RUNS.length]) })
          }
          index++
          if (index === TRAVERSAL_RUNS.length + TRAVERSAL_LINK_RUNS.length) {
            engine.removeSystem(tick)
            log({ stage: 'done' })
          }
        } catch (error) {
          engine.removeSystem(tick)
          log({ stage: 'failed', index, error: String(error) })
        }
      }
      engine.addSystem(tick)
    } catch (error) {
      log({ stage: 'failed', error: String(error) })
    }
  })
}
