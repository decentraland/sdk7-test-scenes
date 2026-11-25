import type { TraversalRun, TraversalScenario } from '../traversal/types'
import { engineRecipeDefinitions } from './recipe-engine-cases'
import { buildEngineNavcat } from './recipe-engine-navcat'
import { ENGINE_BAKE, type CaseResult } from './recipe-engine-types'
import { playback } from './recipe-runtime-support'

function showResult(result: CaseResult, label: string): TraversalRun {
  const trace = result.crowdTrace
  if (trace) {
    let elapsed = 0
    return {
      step(dt) { elapsed += dt },
      frame() {
        const i = Math.min(trace.length - 1, Math.floor(elapsed * 60))
        return {
          phase: label + ' · native crowd trace 2×',
          detail: result.detail, shapes: result.shapes,
          verdict: i < trace.length - 1 ? 'running' : result.passed ? 'pass' : 'fail',
          bots: trace[i].map((feet, id) => ({ id: 'agent ' + id, feet, radius: ENGINE_BAKE.radius, height: ENGINE_BAKE.height }))
        }
      }
    }
  }
  if (result.path?.length) {
    return playback([{ phase: label, height: ENGINE_BAKE.height, points: result.path }], () => result.shapes,
      result.passed, result.detail, result.metrics)
  }
  let elapsed = 0
  return {
    step(dt) { elapsed += dt },
    frame: () => ({
      phase: label, detail: result.detail, shapes: result.shapes, bots: [],
      verdict: elapsed < 0.5 ? 'running' : result.passed ? 'pass' : 'fail'
    })
  }
}

export const engineRecipeScenarios: readonly TraversalScenario[] = engineRecipeDefinitions.map((definition) => ({
  id: definition.caseId.toLowerCase(),
  label: definition.label,
  cases: [definition.caseId],
  variants: definition.variants,
  create(variant) {
    const choice = definition.variants.find(({ id }) => id === variant)
    if (!choice) throw new Error('Unknown recipe variant ' + variant)
    return showResult(definition.run(buildEngineNavcat, variant), choice.label)
  }
}))
