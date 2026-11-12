import {
  AvatarAnchorPointType,
  AvatarAttach,
  AvatarBase,
  Billboard,
  engine,
  Entity,
  PlayerIdentityData,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

// AvatarBase.talking has three states: undefined = the engine does not report voice activity
// (e.g. Nearby voice chat disabled), false = not talking, true = talking.
type TalkingState = 'no data' | 'silent' | 'talking'

type Marker = { address: string; anchor: Entity; label: Entity; state: TalkingState }

const COLORS: Record<TalkingState, Color4> = {
  'no data': Color4.Gray(),
  silent: Color4.White(),
  talking: Color4.Green()
}

const markers = new Map<Entity, Marker>()

function resolveState(player: Entity): TalkingState {
  const talking = AvatarBase.getOrNull(player)?.talking
  if (talking === undefined) return 'no data'
  return talking ? 'talking' : 'silent'
}

function paint(player: Entity, marker: Marker, state: TalkingState) {
  marker.state = state
  TextShape.createOrReplace(marker.label, { text: state, fontSize: 3, textColor: COLORS[state] })
  console.log(`[talking] ${AvatarBase.getOrNull(player)?.name || player}: ${state}`)
}

// Parenting to a remote player's entity does not work: the engine only writes its Transform for the
// scene to read, so a child of it falls back to the scene root. AvatarAttach by address follows every avatar.
function createMarker(player: Entity): Marker | undefined {
  const address = PlayerIdentityData.getOrNull(player)?.address
  if (!address) return undefined

  const anchor = engine.addEntity()
  AvatarAttach.create(anchor, { avatarId: address, anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG })

  const label = engine.addEntity()
  Transform.create(label, { parent: anchor, position: Vector3.create(0, 0.6, 0) })
  Billboard.create(label)

  return { address, anchor, label, state: 'no data' }
}

function talkingMarkerSystem() {
  for (const [player, marker] of markers) {
    // player entity ids are reused, so a new address on the same entity needs a new marker
    if (AvatarBase.has(player) && PlayerIdentityData.getOrNull(player)?.address === marker.address) continue
    engine.removeEntity(marker.label)
    engine.removeEntity(marker.anchor)
    markers.delete(player)
  }

  for (const [player] of engine.getEntitiesWith(AvatarBase)) {
    let marker = markers.get(player)

    if (!marker) {
      marker = createMarker(player)
      if (!marker) continue
      markers.set(player, marker)
      paint(player, marker, resolveState(player))
      continue
    }

    const state = resolveState(player)
    if (state !== marker.state) paint(player, marker, state)
  }
}

export function main() {
  engine.addSystem(talkingMarkerSystem)
}
