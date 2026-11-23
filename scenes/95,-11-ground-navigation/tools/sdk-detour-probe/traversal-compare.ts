import type { Point } from '../../src/arena'
import { traversalCaseIds } from '../../src/traversal/catalog-coverage'
import { TRAVERSAL_SCENARIOS } from '../../src/traversal/registry'
import { createTraversalSimulation } from '../../src/traversal/simulation'
import { createTraversalNavigator, createTraversalRouter, traversalSurfaces, type AuthoredLink, type TraversalBackend } from './traversal-routing'

const backends = ['navcat', 'detour'] as const

export const TRAVERSAL_RUNS = TRAVERSAL_SCENARIOS.flatMap((scenario) => scenario.variants.flatMap((variant) =>
  (['reference', ...backends] as const).map((backend) => ({ scenario, variant, backend }))))

export function runTraversalComparison(record: typeof TRAVERSAL_RUNS[number], now: () => number) {
  const { backend, scenario, variant } = record
  const router = backend === 'reference' ? undefined : createTraversalRouter(backend, now)
  try {
    const simulation = createTraversalSimulation(scenario.create(variant.id, router?.route))
    let frame = simulation.frame()
    while (frame.verdict === 'running') frame = simulation.tick()
    return {
      backend, scenario: scenario.id, variant: variant.id, ticks: simulation.ticks(),
      caseIds: traversalCaseIds(scenario.id, variant.id),
      verdict: frame.verdict, phase: frame.phase, detail: frame.detail,
      probes: router?.probes ?? []
    }
  } finally {
    router?.dispose()
  }
}

type LinkFixture = {
  scenario: string
  variant: string
  from: Point
  to: Point
  links: readonly AuthoredLink[]
  radius: number
  height: number
  without?: number // Omit this link to validate that the chain cannot be bypassed.
}

const runupFrom: Point = [8, 1, 6.65]
const runupTo: Point = [8, 1, 9.55]
const firstJump: Point = [8, 1, 5]
const brake: Point = [8, 1, 7.8]
const lastJump: Point = [8, 1, 11]
const mantleFrom: Point = [8, 0.35, 5.3]
const mantleTo: Point = [8, 1.5, 7.85]
const shaftFrom: Point = [4.95, 1.45, 7]
const shaftTo: Point = [11.15, 1.9, 7]
const ladderFrom: Point = [8.2, 0.15, 6.35]
const ladderTo: Point = [7.35, 2.8, 6.5]
const recoveryFrom: Point = [4.95, 2, 6.25]
const recoveryTo: Point = [9.6, 2, 6.25]

const linkFixtures: readonly LinkFixture[] = [
  { scenario: 'run-up-jump', variant: 'ready', from: runupFrom, to: runupTo,
    links: [{ from: runupFrom, to: runupTo }], radius: 0.24, height: 1.65 },
  { scenario: 'chained-jumps', variant: 'room-to-brake', from: firstJump, to: lastJump,
    links: [{ from: firstJump, to: brake }, { from: brake, to: lastJump }], radius: 0.24, height: 1.65, without: 1 },
  { scenario: 'mantle-clearance', variant: 'clear', from: mantleFrom, to: mantleTo,
    links: [{ from: mantleFrom, to: mantleTo }], radius: 0.25, height: 1.8 },
  { scenario: 'contested-ladder', variant: 'clear', from: ladderFrom, to: ladderTo,
    links: [{ from: ladderFrom, to: ladderTo, bidirectional: true }], radius: 0.24, height: 0.8 },
  { scenario: 'interrupted-jump', variant: 'clear', from: recoveryFrom, to: recoveryTo,
    links: [{ from: recoveryFrom, to: recoveryTo }], radius: 0.24, height: 0.8 },
  // The two handholds are controller states, so the navmesh sees one action between walkable floors.
  { scenario: 'ledge-transfer', variant: 'clear', from: shaftFrom, to: shaftTo,
    links: [{ from: shaftFrom, to: shaftTo }], radius: 0.25, height: 1.8 }
]

export const TRAVERSAL_LINK_RUNS = linkFixtures.flatMap((fixture) => backends.map((backend) => ({ fixture, backend })))

export function runTraversalLinkComparison({ fixture, backend }: typeof TRAVERSAL_LINK_RUNS[number]) {
  const scenario = TRAVERSAL_SCENARIOS.find((item) => item.id === fixture.scenario)!
  const surfaces = traversalSurfaces(scenario.create(fixture.variant).frame().shapes, fixture.height)
  function query(links: readonly AuthoredLink[], snap = false) {
    const navigator = createTraversalNavigator(backend, surfaces, fixture.radius, fixture.height, links, snap)
    try {
      return {
        forward: navigator.route(fixture.from, fixture.to).status === 'complete',
        reverse: navigator.route(fixture.to, fixture.from).status === 'complete'
      }
    } finally {
      navigator.dispose?.()
    }
  }
  const rawAnchors = query(fixture.links)
  const enabled = query(fixture.links, true)
  const disabled = query(fixture.without === undefined ? [] : fixture.links.filter((_, i) => i !== fixture.without), true)
  const reverseExpected = fixture.links.every((link) => link.bidirectional === true)
  return {
    backend, scenario: fixture.scenario, rawAnchors, enabled, disabled,
    verdict: enabled.forward && enabled.reverse === reverseExpected && !disabled.forward && !disabled.reverse ? 'pass' : 'fail'
  }
}
