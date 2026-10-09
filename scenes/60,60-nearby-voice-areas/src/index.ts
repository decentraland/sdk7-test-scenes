import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  Material,
  MeshRenderer,
  PlayerIdentityData,
  PlayerVoiceState,
  TextShape,
  Transform,
  VoiceChatModifierArea
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const PERFORMER_ADDRESS = '0x0000000000000000000000000000000000000000'

type ZoneDefinition = {
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

const ZONES: ZoneDefinition[] = [
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

ZONES.forEach(spawnZone)

const SPEAKING_COLOR = Color4.Green()
const SILENT_COLOR = Color4.Gray()

type SpeakingMarker = { entity: Entity; isSpeaking: boolean }

const markers = new Map<Entity, SpeakingMarker>()

function paintMarker(marker: SpeakingMarker, isSpeaking: boolean) {
  marker.isSpeaking = isSpeaking
  Material.setBasicMaterial(marker.entity, { diffuseColor: isSpeaking ? SPEAKING_COLOR : SILENT_COLOR })
}

function createMarker(player: Entity): SpeakingMarker {
  const entity = engine.addEntity()
  Transform.create(entity, { parent: player, position: Vector3.create(0, 2.4, 0), scale: Vector3.create(0.3, 0.3, 0.3) })
  MeshRenderer.setPlane(entity)
  Billboard.create(entity)
  const marker = { entity, isSpeaking: false }
  paintMarker(marker, false)
  return marker
}

function speakingMarkerSystem() {
  const players = new Set<Entity>([engine.PlayerEntity])
  for (const [player] of engine.getEntitiesWith(PlayerIdentityData)) players.add(player)

  for (const [player, marker] of markers) {
    if (players.has(player)) continue
    engine.removeEntity(marker.entity)
    markers.delete(player)
  }

  for (const player of players) {
    let marker = markers.get(player)
    if (!marker) {
      marker = createMarker(player)
      markers.set(player, marker)
    }
    const isSpeaking = PlayerVoiceState.getOrNull(player)?.isSpeaking ?? false
    if (isSpeaking !== marker.isSpeaking) paintMarker(marker, isSpeaking)
  }
}

engine.addSystem(speakingMarkerSystem)
