import {
  Billboard,
  BillboardMode,
  engine,
  Material,
  MeshRenderer,
  TextShape,
  Transform,
  VoiceChatModifierArea
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

export const PERFORMER_ADDRESS = '0x0000000000000000000000000000000000000000'
export const NEARBY_RANGE = 20

export type ZoneDefinition = {
  label: string
  center: Vector3
  size: Vector3
  color: Color4
  excludeIds?: string[]
  volumeScale?: number
  maxDistance?: number
  mute?: boolean
  isolate?: boolean
}

export type Hearing = { audible: boolean; reason: string; volume: number; range: number }

export const ZONES: ZoneDefinition[] = [
  {
    label: 'WHISPER 3m',
    center: Vector3.create(5, 2, 5),
    size: Vector3.create(6, 4, 6),
    color: Color4.create(0.2, 0.6, 1, 0.35),
    maxDistance: 3
  },
  {
    label: 'MUTE',
    center: Vector3.create(16, 2, 5),
    size: Vector3.create(6, 4, 6),
    color: Color4.create(1, 0.2, 0.2, 0.35),
    mute: true
  },
  {
    label: 'ISOLATION BOOTH',
    center: Vector3.create(27, 2, 5),
    size: Vector3.create(6, 4, 6),
    color: Color4.create(0.7, 0.3, 1, 0.35),
    isolate: true
  },
  {
    label: 'QUIET 0.3',
    center: Vector3.create(5, 2, 20),
    size: Vector3.create(8, 4, 8),
    color: Color4.create(1, 0.9, 0.2, 0.35),
    volumeScale: 0.3
  },
  {
    label: 'WHISPER + QUIET (most restrictive wins)',
    center: Vector3.create(10, 2, 20),
    size: Vector3.create(6, 4, 6),
    color: Color4.create(1, 0.5, 0.1, 0.35),
    maxDistance: 3
  },
  {
    label: 'STAGE: muted except PERFORMER_ADDRESS',
    center: Vector3.create(24, 2, 21),
    size: Vector3.create(8, 4, 8),
    color: Color4.create(0.2, 1, 0.4, 0.35),
    mute: true,
    excludeIds: [PERFORMER_ADDRESS]
  }
]

function spawnZone(zone: ZoneDefinition, index: number) {
  const entity = engine.addEntity()
  Transform.create(entity, { position: zone.center })
  VoiceChatModifierArea.create(entity, {
    area: zone.size,
    excludeIds: zone.excludeIds ?? [],
    volumeScale: zone.volumeScale,
    maxDistance: zone.maxDistance,
    mute: zone.mute,
    isolate: zone.isolate
  })

  const visual = engine.addEntity()
  Transform.create(visual, { position: zone.center, scale: zone.size })
  MeshRenderer.setBox(visual)
  Material.setPbrMaterial(visual, { albedoColor: zone.color })

  const label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(zone.center.x, zone.size.y + 1 + (index % 2) * 1.5, zone.center.z) })
  TextShape.create(label, { text: zone.label, fontSize: 2, textColor: Color4.White(), outlineWidth: 0.2 })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
}

export function spawnZones() {
  ZONES.forEach(spawnZone)
}

function isInside(zone: ZoneDefinition, position: Vector3) {
  return (
    Math.abs(position.x - zone.center.x) <= zone.size.x / 2 &&
    Math.abs(position.z - zone.center.z) <= zone.size.z / 2
  )
}

function isExcluded(zone: ZoneDefinition, address: string) {
  const lowered = address.toLowerCase()
  return (zone.excludeIds ?? []).some((id) => id.toLowerCase() === lowered)
}

export function zonesAffecting(position: Vector3, address: string): ZoneDefinition[] {
  return ZONES.filter((zone) => isInside(zone, position) && !isExcluded(zone, address))
}

function sharesIsolation(speakerZones: ZoneDefinition[], listenerZones: ZoneDefinition[]) {
  const speakerBooths = speakerZones.filter((zone) => zone.isolate)
  const listenerBooths = listenerZones.filter((zone) => zone.isolate)
  if (speakerBooths.length === 0) return listenerBooths.length === 0
  return speakerBooths.some((zone) => listenerBooths.includes(zone))
}

export function expectedHearing(speakerZones: ZoneDefinition[], listenerZones: ZoneDefinition[], distance: number): Hearing {
  const volume = Math.min(1, ...speakerZones.map((zone) => zone.volumeScale ?? 1))
  const range = Math.min(NEARBY_RANGE, ...speakerZones.map((zone) => zone.maxDistance ?? NEARBY_RANGE))

  if (speakerZones.some((zone) => zone.mute)) return { audible: false, reason: 'speaker muted', volume, range }
  if (!sharesIsolation(speakerZones, listenerZones)) return { audible: false, reason: 'isolated', volume, range }
  if (distance > range) return { audible: false, reason: `beyond ${range} m`, volume, range }
  return { audible: true, reason: 'audible', volume, range }
}
