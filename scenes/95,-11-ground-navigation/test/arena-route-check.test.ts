import { describe, expect, it } from 'vitest'
import { evaluateArenaRoute } from '../src/arena-route-check'
import { SCENARIOS, type Scenario } from '../src/arena'

describe('authored arena route oracle', () => {
  const open = SCENARIOS[0]

  it('accepts walking from the floor to the eastern ramp and bridge', () => {
    expect(evaluateArenaRoute(open, {
      status: 'complete',
      points: [open.start, [12.4, 0, 3], [12.4, 3, 9], open.goal]
    })).toBe('pass')
  })

  it('rejects a route in the air even with correct endpoints and a crossing on the right side', () => {
    expect(evaluateArenaRoute(open, {
      status: 'complete',
      points: [open.start, [12.4, 3, 6.6], open.goal]
    })).toBe('route segment leaves walkable support')
  })

  it('rejects loss of support inside a segment between valid points', () => {
    const scenario: Scenario = {
      id: 'closed-ramp-gap', start: [12.5, 2, 7], goal: [12.5, 2.5, 8], expected: 'complete', doorOpen: false
    }
    expect(evaluateArenaRoute(scenario, { status: 'complete', points: [scenario.start, scenario.goal] }))
      .toBe('route segment leaves walkable support')
  })

  it('requires room for the foot radius along the edge of a slab', () => {
    const scenario: Scenario = {
      id: 'exposed-edge', start: [2.1, 0, 2.5], goal: [2.1, 0, 3.5], expected: 'complete', doorOpen: true
    }
    expect(evaluateArenaRoute(scenario, { status: 'complete', points: [scenario.start, scenario.goal] }))
      .toBe('route footprint lacks edge clearance')
  })
})
