import { BillboardMode, engine } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { createBillboardCard, createInfoSign } from './labels'
import { createOrbitingSphere, createSpinningOrbitTarget, Updatable } from './orbitingTargets'
import { createLifecycleStation } from './stationC'

const updatables: Updatable[] = []

export function main() {
  createInfoSign(
    Vector3.create(8, 5.5, 0.5),
    'Billboard targetEntity demo\nWalk between stations A-E to compare behaviors'
  )

  setupStationA()
  setupStationB()
  setupStationC()
  setupStationD()
  setupStationE()

  engine.addSystem((dt: number) => {
    for (const update of updatables) update(dt)
  })
}

/** A - No targetEntity: default behavior, always faces the camera. */
function setupStationA() {
  createBillboardCard(Vector3.create(3, 1.5, 3), 'A', Color4.create(0.2, 0.5, 1, 1), {})
  createInfoSign(
    Vector3.create(3, 3.3, 3),
    'STATION A\nNo targetEntity\nFaces the camera (default)'
  )
}

/** B - targetEntity points at a sphere orbiting nearby: the billboard tracks the moving target. */
function setupStationB() {
  const orbitCenter = Vector3.create(7, 2, 8)
  const [sphere, update] = createOrbitingSphere(orbitCenter, 2.5, 1.2, Color4.create(1, 0.85, 0.2, 1))
  updatables.push(update)

  createBillboardCard(Vector3.create(3, 1.5, 8), 'B', Color4.create(0.2, 1, 0.4, 1), { targetEntity: sphere })
  createInfoSign(
    Vector3.create(3, 3.3, 8),
    'STATION B\ntargetEntity = orbiting sphere\nTracks the moving target'
  )
}

/** C - targetEntity points at an entity that is periodically deleted and respawned: the
 *  billboard freezes while the target is absent, and resumes tracking once it exists again. */
function setupStationC() {
  const card = createBillboardCard(Vector3.create(3, 1.5, 13), 'C', Color4.create(1, 0.3, 0.3, 1), {})
  const update = createLifecycleStation(card, Vector3.create(7, 2, 13), Color4.create(1, 0.3, 0.3, 1), Vector3.create(3, 3.3, 13))
  updatables.push(update)

  createInfoSign(
    Vector3.create(3, 4.6, 13),
    'STATION C\ntargetEntity = entity that is deleted/respawned\nFreezes while absent, resumes when it exists again'
  )
}

/** D - billboardMode comparison: two billboards target the same spinning/orbiting entity.
 *  D1 uses BM_Y (yaw only, ignores the target's roll). D2 uses BM_ALL (also follows Z roll). */
function setupStationD() {
  const orbitCenter = Vector3.create(11, 3, 5)
  const [target, update] = createSpinningOrbitTarget(orbitCenter, 1.5, 1, 90, Color4.create(0.8, 0.4, 1, 1))
  updatables.push(update)

  createBillboardCard(Vector3.create(8, 1.5, 5), 'D1', Color4.create(0.5, 0.7, 1, 1), {
    targetEntity: target,
    billboardMode: BillboardMode.BM_Y
  })
  createInfoSign(Vector3.create(8, 3.3, 5), 'STATION D1\nbillboardMode: BM_Y\nYaws to face target, ignores its roll')

  createBillboardCard(Vector3.create(14, 1.5, 5), 'D2', Color4.create(1, 0.7, 0.5, 1), {
    targetEntity: target,
    billboardMode: BillboardMode.BM_ALL
  })
  createInfoSign(Vector3.create(14, 3.3, 5), 'STATION D2\nbillboardMode: BM_ALL\nAlso follows target Z roll')
}

/** E - targetEntity = engine.CameraEntity: documented to be equivalent to leaving it unset. */
function setupStationE() {
  createBillboardCard(Vector3.create(11, 1.5, 10), 'E', Color4.create(1, 1, 0.3, 1), {
    targetEntity: engine.CameraEntity
  })
  createInfoSign(
    Vector3.create(11, 3.3, 10),
    'STATION E\ntargetEntity = engine.CameraEntity\nSame as unset - faces the camera'
  )
}
