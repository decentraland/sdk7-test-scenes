import { AvatarBase, engine, Entity, PlayerIdentityData, PlayerVoiceState, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { speakingChanges } from './speaking'
import { expectedHearing, Hearing, NEARBY_RANGE, ZoneDefinition, zonesAffecting } from './zones'

const YES_COLOR = Color4.create(0.4, 1, 0.4, 1)
const NO_COLOR = Color4.create(1, 0.45, 0.45, 1)
const MUTED_COLOR = Color4.create(0.75, 0.75, 0.75, 1)

type PlayerSnapshot = {
  entity: Entity
  name: string
  position: Vector3
  zones: ZoneDefinition[]
}

function snapshot(entity: Entity): PlayerSnapshot | null {
  const transform = Transform.getOrNull(entity)
  if (!transform) return null
  const address = PlayerIdentityData.getOrNull(entity)?.address ?? ''
  const name = AvatarBase.getOrNull(entity)?.name || `${address.slice(0, 6)}…${address.slice(-4)}`
  return { entity, name, position: transform.position, zones: zonesAffecting(transform.position, address) }
}

function speakingText(entity: Entity) {
  const state = PlayerVoiceState.getOrNull(entity)
  const toggles = speakingChanges(entity)
  if (!state) return { text: `no PlayerVoiceState · toggles ${toggles}`, color: NO_COLOR }
  return state.isSpeaking
    ? { text: `SPEAKING · toggles ${toggles}`, color: YES_COLOR }
    : { text: `silent · toggles ${toggles}`, color: MUTED_COLOR }
}

function zonesText(zones: ZoneDefinition[]) {
  return zones.length === 0 ? 'zones: none' : `zones: ${zones.map((zone) => zone.label).join(', ')}`
}

function hearingText(prefix: string, hearing: Hearing) {
  if (!hearing.audible) return { text: `${prefix}: NO (${hearing.reason})`, color: NO_COLOR }
  return { text: `${prefix}: YES · volume ${hearing.volume.toFixed(2)} · range ${hearing.range} m`, color: YES_COLOR }
}

function Line(props: { text: string; color?: Color4; size?: number }) {
  const size = props.size ?? 14
  return (
    <Label
      value={props.text}
      fontSize={size}
      color={props.color ?? Color4.White()}
      textAlign="middle-left"
      uiTransform={{ width: '100%', height: size + 8 }}
    />
  )
}

function PlayerRows(props: { me: PlayerSnapshot; other: PlayerSnapshot; key: string }) {
  const { me, other } = props
  const distance = Vector3.distance(me.position, other.position)
  const speaking = speakingText(other.entity)
  const youHear = hearingText('you hear them', expectedHearing(other.zones, me.zones, distance))
  const theyHear = hearingText('they hear you', expectedHearing(me.zones, other.zones, distance))
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: 8 } }}>
      <Line text={`${other.name} · ${distance.toFixed(1)} m`} size={16} />
      <Line text={speaking.text} color={speaking.color} />
      <Line text={zonesText(other.zones)} color={MUTED_COLOR} />
      <Line text={youHear.text} color={youHear.color} />
      <Line text={theyHear.text} color={theyHear.color} />
    </UiEntity>
  )
}

function VoiceDebugPanel() {
  const me = snapshot(engine.PlayerEntity)
  if (!me) return null

  const others: PlayerSnapshot[] = []
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (entity === engine.PlayerEntity) continue
    const other = snapshot(entity)
    if (other) others.push(other)
  }

  const speaking = speakingText(me.entity)
  const myVoice = expectedHearing(me.zones, me.zones, 0)
  const myVoiceText = myVoice.audible
    ? `your voice: volume ${myVoice.volume.toFixed(2)} · range ${myVoice.range} m`
    : `your voice: ${myVoice.reason}`

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 160, right: 20 },
          width: 520,
          flexDirection: 'column',
          padding: 12
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
      >
        <Line text="NEARBY VOICE DEBUG" size={18} />
        <Line text={`you: ${me.name}`} size={16} />
        <Line text={speaking.text} color={speaking.color} />
        <Line text={zonesText(me.zones)} color={MUTED_COLOR} />
        <Line text={myVoiceText} color={myVoice.audible ? YES_COLOR : NO_COLOR} />
        <Line text={`players here: ${others.length}`} size={16} />
        {others.length === 0 ? (
          <Line text="nobody else here: join with a second client to test hearing" color={MUTED_COLOR} />
        ) : (
          others.map((other) => <PlayerRows key={`${other.entity}`} me={me} other={other} />)
        )}
        <Line text={`expected values come from zone geometry and a ~${NEARBY_RANGE} m Nearby range`} color={MUTED_COLOR} size={12} />
      </UiEntity>
    </UiEntity>
  )
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(VoiceDebugPanel, { virtualWidth: 1920, virtualHeight: 1080 })
}
