import {
  engine,
  AudioEffectZone,
  MeshRenderer,
  Material,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'

import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'

const ZONE_SIZE = Vector3.create(6, 4, 6)

function createZone(
  position: { x: number; y: number; z: number },
  effect: NonNullable<Parameters<typeof AudioEffectZone.create>[1]>['effect'],
  label: string,
  color: { r: number; g: number; b: number }
) {
  const zoneEntity = engine.addEntity()

  Transform.create(zoneEntity, {
    position: Vector3.create(position.x, position.y, position.z),
    scale: ZONE_SIZE
  })

  AudioEffectZone.create(zoneEntity, { area: ZONE_SIZE, effect })

  MeshRenderer.setBox(zoneEntity)
  Material.setPbrMaterial(zoneEntity, {
    albedoColor: Color4.create(color.r, color.g, color.b, 0.25)
  })

  const labelEntity = engine.addEntity()
  Transform.create(labelEntity, {
    position: Vector3.create(position.x, position.y + ZONE_SIZE.y / 2 + 1, position.z),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0)
  })
  TextShape.create(labelEntity, {
    text: label,
    fontSize: 3,
    textColor: Color4.create(color.r, color.g, color.b, 1)
  })

  const floorEntity = engine.addEntity()
  Transform.create(floorEntity, {
    position: Vector3.create(position.x, 0.01, position.z),
    scale: Vector3.create(ZONE_SIZE.x, 0.02, ZONE_SIZE.z)
  })
  MeshRenderer.setBox(floorEntity)
  Material.setPbrMaterial(floorEntity, {
    albedoColor: Color4.create(color.r, color.g, color.b, 0.5)
  })
}

// --- Parcel "4,0" (x: 0–16, z: 0–16): Silence + Despatialize side by side ---

createZone(
  { x: 5, y: 2, z: 8 },
  { $case: 'silence' as const, silence: {} },
  'SILENCE\nAll voice muted',
  { r: 0.8, g: 0.15, b: 0.15 }
)

createZone(
  { x: 11, y: 2, z: 8 },
  { $case: 'despatialize' as const, despatialize: {} },
  'DESPATIALIZE\n2D mono audio',
  { r: 0.15, g: 0.4, b: 0.8 }
)

// --- Parcel "5,0" (x: 16–32, z: 0–16): Amplify ---

createZone(
  { x: 24, y: 2, z: 8 },
  { $case: 'amplify' as const, amplify: { volumeMultiplier: 3, distanceMultiplier: 2 } },
  'AMPLIFY\nvol x3  dist x2',
  { r: 0.15, g: 0.75, b: 0.2 }
)

// --- Parcel "4,1" (x: 0–16, z: 16–32): Reverb ---

createZone(
  { x: 8, y: 2, z: 24 },
  { $case: 'reverb' as const, reverb: { preset: 3 /* RP_CAVE */ } },
  'REVERB\nCave preset',
  { r: 0.6, g: 0.2, b: 0.8 }
)

// --- Parcel "5,1" (x: 16–32, z: 16–32): Echo ---

createZone(
  { x: 24, y: 2, z: 24 },
  { $case: 'echo' as const, echo: {} },
  'ECHO\nAudioEchoFilter',
  { r: 0.9, g: 0.6, b: 0.1 }
)
