import { AvatarBase, Billboard, engine, Entity, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

// AvatarBase.talking has three states: undefined = the engine does not report voice activity
// (e.g. Nearby voice chat disabled), false = not talking, true = talking.
type TalkingState = 'no data' | 'silent' | 'talking'

type Marker = { label: Entity; state: TalkingState }

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
  console.log(`[talking] ${AvatarBase.getOrNull(player)?.name ?? player}: ${state}`)
}

function talkingMarkerSystem() {
  for (const [player, marker] of markers) {
    if (AvatarBase.has(player)) continue
    engine.removeEntity(marker.label)
    markers.delete(player)
  }

  for (const [player] of engine.getEntitiesWith(AvatarBase)) {
    let marker = markers.get(player)

    if (!marker) {
      const label = engine.addEntity()
      Transform.create(label, { parent: player, position: Vector3.create(0, 2.6, 0) })
      Billboard.create(label)
      marker = { label, state: 'no data' }
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
