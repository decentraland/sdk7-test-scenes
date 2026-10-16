import { AvatarBase, AvatarShape, engine, Entity, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { room } from '../shared/messages'
import { Outfits } from '../shared/schemas'
import { NPC_KEY, WEARABLE_NAMES, WEARABLES } from '../shared/wearables'

const BASE = 'urn:decentraland:off-chain:base-avatars:'
const BASE_FEMALE = (BASE + 'BaseFemale').toLowerCase()
const NPC_BASE_LOOK = ['eyes_00', 'eyebrows_00', 'mouth_00', 'casual_hair_01', 'red_tshirt', 'safari_pants', 'sneakers'].map(
  (w) => BASE + w
)

let npc: Entity
let editNpc = false
// Latest server state; `undefined` until the server's outfits have synced
let outfits: Map<string, string[]> | undefined
const NO_OUTFITS = new Map<string, string[]>()
const applied = new Map<Entity, string>()

export function startClient() {
  npc = engine.addEntity()
  Transform.create(npc, { position: Vector3.create(8, 0, 10), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })

  engine.addSystem(dressAvatarsSystem)
  ReactEcsRenderer.setUiRenderer(panel, { virtualWidth: 1920, virtualHeight: 1080 })
}

function readOutfits(): Map<string, string[]> | undefined {
  for (const [, synced] of engine.getEntitiesWith(Outfits)) {
    const result = new Map<string, string[]>()
    synced.keys.forEach((key, i) => result.set(key, synced.wearables[i].split(',').filter((n) => n in WEARABLES)))
    return result
  }
  return undefined
}

const toPaths = (names: readonly string[], female: boolean) =>
  names.map((n) => (female ? WEARABLES[n].female : WEARABLES[n].male))

// Applies the server's outfits: every client dresses every player in the scene and the mannequin the same way
function dressAvatarsSystem() {
  outfits = isStateSyncronized() ? readOutfits() : undefined
  const current = outfits ?? NO_OUTFITS

  dress(npc, NPC_KEY, toPaths(current.get(NPC_KEY) ?? [], false), (paths) =>
    AvatarShape.createOrReplace(npc, {
      id: 'scene-wearables-npc',
      name: 'Mannequin',
      bodyShape: BASE + 'BaseMale',
      // Scene wearables last: they replace the base look's items of the same category
      wearables: [...NPC_BASE_LOOK, ...paths],
      emotes: []
    })
  )

  for (const [player, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    // Body shape picks the male / female model
    const avatarBase = AvatarBase.getOrNull(player)
    if (!avatarBase) continue

    const address = identity.address.toLowerCase()
    const paths = toPaths(current.get(address) ?? [], avatarBase.bodyShapeUrn.toLowerCase() === BASE_FEMALE)

    // Player entity ids are recycled, so the address is part of the key
    dress(player, address, paths, () => {
      if (paths.length === 0) AvatarShape.deleteFrom(player)
      else AvatarShape.createOrReplace(player, { id: identity.address, wearables: paths, emotes: [] })
    })
  }
}

function dress(entity: Entity, key: string, paths: string[], write: (paths: string[]) => void) {
  const state = `${key}|${paths.join(',')}`
  if (applied.get(entity) === state) return
  applied.set(entity, state)
  write(paths)
}

function wornByTarget(): string[] {
  if (editNpc) return outfits?.get(NPC_KEY) ?? []
  const me = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  return me ? outfits?.get(me.address.toLowerCase()) ?? [] : []
}

const panel = () => {
  const ready = outfits !== undefined
  const worn = wornByTarget()
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 180, left: 80 }, width: 300, flexDirection: 'column', padding: 12 }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <UiEntity uiTransform={{ flexDirection: 'row', width: '100%' }}>
        {[false, true].map((isNpc) => (
          <Button
            key={isNpc ? 'npc' : 'me'}
            value={isNpc ? 'Mannequin' : 'Me'}
            variant={editNpc === isNpc ? 'primary' : 'secondary'}
            fontSize={16}
            uiTransform={{ width: '50%', height: 36 }}
            onMouseDown={() => (editNpc = isNpc)}
          />
        ))}
      </UiEntity>
      {WEARABLE_NAMES.map((name) => (
        <Button
          key={name}
          value={name}
          variant={worn.includes(name) ? 'primary' : 'secondary'}
          fontSize={16}
          disabled={!ready}
          uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
          onMouseDown={() => room.send('toggleWearable', { npc: editNpc, name })}
        />
      ))}
      <Button
        value="Take off all"
        fontSize={16}
        disabled={!ready}
        uiTransform={{ width: '100%', height: 36, margin: { top: 8 } }}
        onMouseDown={() => room.send('takeOffAll', { npc: editNpc })}
      />
      <Label
        value={ready ? `Worn: ${worn.join(', ') || '-'}` : 'Waiting for the server…'}
        fontSize={14}
        uiTransform={{ margin: { top: 8 } }}
      />
    </UiEntity>
  )
}
