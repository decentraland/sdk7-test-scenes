import { Billboard, engine, Entity, Material, MeshRenderer, PlayerIdentityData, PlayerVoiceState, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const SPEAKING_COLOR = Color4.Green()
const SILENT_COLOR = Color4.Gray()

type SpeakingMarker = { entity: Entity; isSpeaking: boolean; changes: number }

const markers = new Map<Entity, SpeakingMarker>()

export function speakingChanges(player: Entity) {
  return markers.get(player)?.changes ?? 0
}

function paintMarker(marker: SpeakingMarker, isSpeaking: boolean) {
  marker.isSpeaking = isSpeaking
  Material.setBasicMaterial(marker.entity, { diffuseColor: isSpeaking ? SPEAKING_COLOR : SILENT_COLOR })
}

function createMarker(player: Entity): SpeakingMarker {
  const entity = engine.addEntity()
  Transform.create(entity, { parent: player, position: Vector3.create(0, 2.4, 0), scale: Vector3.create(0.3, 0.3, 0.3) })
  MeshRenderer.setPlane(entity)
  Billboard.create(entity)
  const marker = { entity, isSpeaking: false, changes: 0 }
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
    if (isSpeaking === marker.isSpeaking) continue
    marker.changes++
    paintMarker(marker, isSpeaking)
  }
}

export function setupSpeakingMarkers() {
  engine.addSystem(speakingMarkerSystem)
}
