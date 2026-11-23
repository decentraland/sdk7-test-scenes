import { init } from 'recast-navigation'
import { expect, test } from 'vitest'
import { getSurfaces, OPPOSING_GROUPS } from '../src/arena'
import { createCrowdObserver, createNavcatCrowd, type CrowdRun } from '../src/crowd'
import { bakeNavcatMesh } from '../src/navigation'
import { createDetourCrowd } from './detour'

test.each(['navcat', 'detour'])('%s resolves six opposing agents on the upper deck', async (backend) => {
  const surfaces = getSurfaces(true)
  await init()
  const group: CrowdRun & { dispose?(): void } = backend === 'navcat'
    ? createNavcatCrowd(bakeNavcatMesh(surfaces))
    : createDetourCrowd(surfaces)
  try {
    const observer = createCrowdObserver()
    for (let step = 0; step < OPPOSING_GROUPS.steps; step++) {
      group.step(OPPOSING_GROUPS.stepSeconds)
      const positions = group.positions()
      expect(positions.every(([, y]) => Math.abs(y - 3) < 0.35)).toBe(true)
      observer.observe(positions)
    }
    expect(observer.metrics()).toMatchObject({ arrived: 6, overlapSteps: 0 })
  } finally {
    group.dispose?.()
  }
})
