import {
  engine,
  AudioEffectZone,
  MeshRenderer,
  Material,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'

import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'

// --- SILENCE ZONE ---
const silenceZoneEntity = engine.addEntity()
const zoneSize = Vector3.create(6, 4, 6)

Transform.create(silenceZoneEntity, {
  position: Vector3.create(8, 2, 8)
})

AudioEffectZone.create(silenceZoneEntity, {
  area: zoneSize,
  effect: { $case: 'silence' as const, silence: {} }
})

// Translucent red cube to visualize the zone
MeshRenderer.setBox(silenceZoneEntity)
Material.setPbrMaterial(silenceZoneEntity, {
  albedoColor: Color4.create(0.8, 0.15, 0.15, 0.3)
})

// Label above the zone
const labelEntity = engine.addEntity()
Transform.create(labelEntity, {
  position: Vector3.create(8, 5, 8),
  rotation: Quaternion.fromEulerDegrees(0, 0, 0)
})
TextShape.create(labelEntity, {
  text: 'SILENCE ZONE\nVoice chat is muted inside',
  fontSize: 3,
  textColor: Color4.Red()
})

// Floor marker to show zone boundary
const floorEntity = engine.addEntity()
Transform.create(floorEntity, {
  position: Vector3.create(8, 0.01, 8),
  scale: Vector3.create(6, 0.02, 6)
})
MeshRenderer.setBox(floorEntity)
Material.setPbrMaterial(floorEntity, {
  albedoColor: Color4.create(0.8, 0.15, 0.15, 0.5)
})
