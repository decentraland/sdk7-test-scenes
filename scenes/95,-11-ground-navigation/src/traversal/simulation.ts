import type { TraversalFrame, TraversalRun } from './types'

export const TRAVERSAL_STEP = 1 / 30
const MAX_TICKS = 40 * 30

export function createTraversalSimulation(run: TraversalRun) {
  let frame = run.frame()
  let ticks = 0

  return {
    frame: () => frame,
    ticks: () => ticks,
    tick(): TraversalFrame {
      if (frame.verdict !== 'running') return frame
      run.step(TRAVERSAL_STEP)
      frame = run.frame()
      ticks++
      if (ticks === MAX_TICKS && frame.verdict === 'running') {
        frame = { ...frame, verdict: 'fail', detail: 'Timed out in ' + frame.phase }
      }
      return frame
    }
  }
}
