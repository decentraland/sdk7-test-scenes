import { AvatarBase, AvatarShape, engine, Entity, PlayerIdentityData, Schemas, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized, myProfile, syncEntity } from '@dcl/sdk/network'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

const BASE = 'urn:decentraland:off-chain:base-avatars:'
const BASE_FEMALE = (BASE + 'BaseFemale').toLowerCase()

// Scene wearables are content paths named `*_<category>.glb`; `_m_` / `_f_` mark per-body-shape models
const split = (name: string, category: string) => ({
  male: `wearables/${name}/${name}_m_${category}.glb`,
  female: `wearables/${name}/${name}_f_${category}.glb`
})
const unisex = (name: string, category: string) => {
  const path = `wearables/${name}/${name}_${category}.glb`
  return { male: path, female: path }
}

const WEARABLES: Record<string, { male: string; female: string }> = {
  green_hoodie: split('green_hoodie', 'upper_body'),
  pride_tshirt: split('pride_tshirt', 'upper_body'),
  kilt: split('kilt', 'lower_body'),
  bear_slippers: unisex('bear_slippers', 'feet'),
  matrix_sunglasses: unisex('matrix_sunglasses', 'eyewear'),
  laurel_wreath: unisex('laurel_wreath', 'tiara')
}
const NAMES = Object.keys(WEARABLES)

const NPC_BASE_LOOK = ['eyes_00', 'eyebrows_00', 'mouth_00', 'casual_hair_01', 'red_tshirt', 'safari_pants', 'sneakers'].map(
  (w) => BASE + w
)

// One synced outfit per player. The SDK keeps a leaver's synced entities, so the highest rev wins per address.
const Outfit = engine.defineComponent('scene-wearables::Outfit', {
  address: Schemas.String,
  wearables: Schemas.Array(Schemas.String),
  rev: Schemas.Number
})

type Target = 'me' | 'npc'
const worn: Record<Target, string[]> = { me: [], npc: [] }
let target: Target = 'me'
let rev = Date.now()
let myOutfit: Entity | undefined
let npc: Entity

const toPaths = (names: readonly string[], female: boolean) =>
  names.map((n) => (female ? WEARABLES[n].female : WEARABLES[n].male))

function toggle(name: string) {
  const list = worn[target]
  worn[target] = list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
  onChanged()
}

function takeOffAll() {
  worn[target] = []
  onChanged()
}

function onChanged() {
  if (target === 'npc') dressNpc()
  else rev = Math.max(rev + 1, Date.now())
}

function dressNpc() {
  AvatarShape.createOrReplace(npc, {
    id: 'scene-wearables-npc',
    name: 'Mannequin',
    bodyShape: BASE + 'BaseMale',
    // Scene wearables last: they replace the base look's items of the same category
    wearables: [...NPC_BASE_LOOK, ...toPaths(worn.npc, false)],
    emotes: []
  })
}

function syncMyOutfit() {
  if (myOutfit === undefined) {
    // syncEntity throws until the profile is fetched
    if (!isStateSyncronized() || myProfile.networkId === 0) return
    const identity = PlayerIdentityData.getOrNull(engine.PlayerEntity)
    if (!identity) return
    myOutfit = engine.addEntity()
    Outfit.create(myOutfit, { address: identity.address, wearables: [], rev: 0 })
    syncEntity(myOutfit, [Outfit.componentId])
  }
  if (Outfit.get(myOutfit).rev === rev) return
  const outfit = Outfit.getMutable(myOutfit)
  outfit.wearables = [...worn.me]
  outfit.rev = rev
}

const applied = new Map<Entity, string>()

// Every client dresses every player in the scene: itself from local state, the others from their synced outfits
function dressPlayersSystem() {
  syncMyOutfit()

  const latest = new Map<string, { rev: number; wearables: readonly string[] }>()
  for (const [, outfit] of engine.getEntitiesWith(Outfit)) {
    const address = outfit.address.toLowerCase()
    if ((latest.get(address)?.rev ?? -1) < outfit.rev) latest.set(address, outfit)
  }

  for (const [player, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    // Body shape picks the male / female model
    const avatarBase = AvatarBase.getOrNull(player)
    if (!avatarBase) continue

    const address = identity.address.toLowerCase()
    const names = player === engine.PlayerEntity ? worn.me : latest.get(address)?.wearables ?? []
    const paths = toPaths(names, avatarBase.bodyShapeUrn.toLowerCase() === BASE_FEMALE)

    // Player entity ids are recycled, so the address is part of the key
    const key = `${address}|${paths.join(',')}`
    if (applied.get(player) === key) continue
    applied.set(player, key)

    if (paths.length === 0) AvatarShape.deleteFrom(player)
    else AvatarShape.createOrReplace(player, { id: identity.address, wearables: paths, emotes: [] })
  }
}

const panel = () => (
  <UiEntity
    uiTransform={{ positionType: 'absolute', position: { top: 180, left: 80 }, width: 300, flexDirection: 'column', padding: 12 }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
  >
    <UiEntity uiTransform={{ flexDirection: 'row', width: '100%' }}>
      {(['me', 'npc'] as Target[]).map((t) => (
        <Button
          key={t}
          value={t === 'me' ? 'Me' : 'Mannequin'}
          variant={target === t ? 'primary' : 'secondary'}
          fontSize={16}
          uiTransform={{ width: '50%', height: 36 }}
          onMouseDown={() => (target = t)}
        />
      ))}
    </UiEntity>
    {NAMES.map((name) => (
      <Button
        key={name}
        value={name}
        variant={worn[target].includes(name) ? 'primary' : 'secondary'}
        fontSize={16}
        uiTransform={{ width: '100%', height: 36, margin: { top: 4 } }}
        onMouseDown={() => toggle(name)}
      />
    ))}
    <Button value="Take off all" fontSize={16} uiTransform={{ width: '100%', height: 36, margin: { top: 8 } }} onMouseDown={takeOffAll} />
    <Label value={`Worn: ${worn[target].join(', ') || '-'}`} fontSize={14} uiTransform={{ margin: { top: 8 } }} />
  </UiEntity>
)

export function main() {
  npc = engine.addEntity()
  Transform.create(npc, { position: Vector3.create(8, 0, 10), rotation: Quaternion.fromEulerDegrees(0, 180, 0) })
  dressNpc()

  engine.addSystem(dressPlayersSystem)
  ReactEcsRenderer.setUiRenderer(panel, { virtualWidth: 1920, virtualHeight: 1080 })
}
