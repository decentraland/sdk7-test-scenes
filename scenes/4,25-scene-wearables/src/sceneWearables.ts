/**
 * Scene wearables prototype: GLB wearables shipped in the scene's own content.
 *  - NPC mannequin: click cycles outfits (base URNs mixed with scene .glb paths).
 *  - Players (local + remote): synced SceneOutfit per player, applied as AvatarShape on each player entity.
 */
import {
  AvatarBase,
  AvatarShape,
  engine,
  Entity,
  PlayerIdentityData,
  Schemas,
  InputAction,
  MeshCollider,
  pointerEventsSystem,
  Transform
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity, isStateSyncronized, myProfile } from '@dcl/sdk/network'

const BASE = 'urn:decentraland:off-chain:base-avatars:'
const BASE_MALE = BASE + 'BaseMale'
const BASE_FEMALE = BASE + 'BaseFemale'
const BASE_FEMALE_LC = BASE_FEMALE.toLowerCase()
const DIR = 'wearables/'

export type SceneWearable = {
  name: string
  male: string
  female: string
}

const unisex = (dir: string, category: string): SceneWearable => {
  const p = `${DIR}${dir}/${dir}_${category}.glb`
  return { name: dir, male: p, female: p }
}
const split = (dir: string, category: string): SceneWearable => ({
  name: dir,
  male: `${DIR}${dir}/${dir}_m_${category}.glb`,
  female: `${DIR}${dir}/${dir}_f_${category}.glb`
})

export const SCENE_WEARABLES: SceneWearable[] = [
  split('green_hoodie', 'upper_body'),
  split('pride_tshirt', 'upper_body'),
  split('kilt', 'lower_body'),
  unisex('bear_slippers', 'feet'),
  unisex('matrix_sunglasses', 'eyewear'),
  unisex('laurel_wreath', 'tiara')
]

/**
 * Synced outfit beacon: one auto-id synced entity per join. SDK does NOT remove a player's synced entities on
 * leave, so stale beacons (same address, same networkId) linger; the one with the highest `rev` wins.
 * Stores logical wearable names only; each client resolves the m/f file from the TARGET player's body shape.
 */
const SceneOutfit = engine.defineComponent('scene-wearables::SceneOutfit', {
  address: Schemas.String,
  wearables: Schemas.Array(Schemas.String),
  rev: Schemas.Number
})

// Local player's outfit is the source of truth for self (works without a scene room); mirrored into the beacon.
let localWorn: string[] = []
let localRev = Date.now()
let myOutfit: Entity | undefined

const bumpRev = () => {
  localRev = Math.max(localRev + 1, Date.now())
}

const ensureMyOutfit = (): Entity | undefined => {
  if (myOutfit !== undefined) return myOutfit
  if (!isStateSyncronized()) return undefined
  if (myProfile.networkId === 0) return undefined // profile not fetched yet: syncEntity would throw
  const id = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  if (!id) return undefined
  const e = engine.addEntity()
  SceneOutfit.create(e, { address: id.address, wearables: localWorn.slice(), rev: localRev })
  syncEntity(e, [SceneOutfit.componentId])
  myOutfit = e
  return e
}

export const getWornNames = (): string[] => localWorn.slice()
export const isWorn = (name: string): boolean => localWorn.includes(name)

export const toggleWearable = (name: string) => {
  localWorn = localWorn.includes(name) ? localWorn.filter((n) => n !== name) : [...localWorn, name]
  bumpRev()
}

export const takeOffAll = () => {
  localWorn = []
  bumpRev()
}

const isFemale = (entity: Entity): boolean =>
  AvatarBase.getOrNull(entity)?.bodyShapeUrn?.toLowerCase() === BASE_FEMALE_LC

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

const mirrorLocalToBeacon = () => {
  const e = ensureMyOutfit()
  if (e === undefined) return
  const o = SceneOutfit.getOrNull(e)
  if (o && o.rev === localRev && sameList(o.wearables, localWorn)) return
  const w = SceneOutfit.getMutable(e)
  w.wearables = localWorn.slice()
  w.rev = localRev
}

// Reused per frame: best (max rev) beacon per lowercase address.
const bestByAddress = new Map<string, { rev: number; wearables: readonly string[] }>()
const seen = new Set<Entity>()
const paths: string[] = []
// Last applied per entity; address guards against recycled entity ids.
const applied = new Map<Entity, { address: string; paths: string[] }>()

const collectBeacons = () => {
  bestByAddress.clear()
  for (const [, o] of engine.getEntitiesWith(SceneOutfit)) {
    const addr = o.address.toLowerCase()
    const cur = bestByAddress.get(addr)
    if (cur === undefined) bestByAddress.set(addr, { rev: o.rev, wearables: o.wearables })
    else if (o.rev > cur.rev) {
      cur.rev = o.rev
      cur.wearables = o.wearables
    }
  }
}

const outfitSystem = () => {
  mirrorLocalToBeacon()
  collectBeacons()
  seen.clear()
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    seen.add(entity)
    // Wait for AvatarBase so the body shape is known (avoids male-then-female double rebuild)
    if (!AvatarBase.has(entity)) continue
    const addr = identity.address.toLowerCase()
    const names = entity === engine.PlayerEntity ? localWorn : bestByAddress.get(addr)?.wearables
    const female = isFemale(entity)
    paths.length = 0
    if (names) {
      for (const n of names) {
        const w = WEARABLE_BY_NAME.get(n)
        if (w) paths.push(female ? w.female : w.male)
      }
    }
    const present = AvatarShape.has(entity)
    const prev = applied.get(entity)
    if (paths.length === 0) {
      if (present) AvatarShape.deleteFrom(entity)
      if (prev) {
        prev.address = addr
        prev.paths.length = 0
      } else applied.set(entity, { address: addr, paths: [] })
      continue
    }
    if (present && prev !== undefined && prev.address === addr && sameList(prev.paths, paths)) continue
    AvatarShape.createOrReplace(entity, { id: identity.address, wearables: paths.slice(), emotes: [] })
    applied.set(entity, { address: addr, paths: paths.slice() })
  }
  if (applied.size > seen.size) for (const k of Array.from(applied.keys())) if (!seen.has(k)) applied.delete(k)
}

const WEARABLE_BY_NAME = new Map(SCENE_WEARABLES.map((w) => [w.name, w]))

const m = (name: string) => SCENE_WEARABLES.find((w) => w.name === name)!.male

const BASE_LOOK = [
  BASE + 'eyes_00',
  BASE + 'eyebrows_00',
  BASE + 'mouth_00',
  BASE + 'casual_hair_01'
]

const OUTFITS: { label: string; wearables: string[] }[] = [
  { label: 'Hoodie + kilt', wearables: [...BASE_LOOK, m('green_hoodie'), m('kilt'), BASE + 'sneakers'] },
  { label: 'Pride + slippers + shades', wearables: [...BASE_LOOK, m('pride_tshirt'), BASE + 'cargo_shorts', m('bear_slippers'), m('matrix_sunglasses')] },
  { label: 'Wreath + hoodie (base pants)', wearables: [...BASE_LOOK, m('laurel_wreath'), m('green_hoodie'), BASE + 'safari_pants', BASE + 'sport_black_shoes'] },
  { label: 'Base only', wearables: [...BASE_LOOK, BASE + 'red_tshirt', BASE + 'safari_pants', BASE + 'sneakers'] }
]

let outfitIndex = 0
let npc: Entity | undefined

const applyOutfit = () => {
  if (!npc) return
  AvatarShape.createOrReplace(npc, {
    id: 'scene-wearables-npc',
    name: 'Mannequin',
    bodyShape: BASE_MALE,
    wearables: OUTFITS[outfitIndex].wearables,
    emotes: []
  })
}

export const getNpcOutfitLabel = (): string => OUTFITS[outfitIndex].label

export function setupSceneWearables() {
  engine.addSystem(outfitSystem)
  npc = engine.addEntity()
  // Faces the spawn area (-z)
  Transform.create(npc, { position: Vector3.create(8, 0, 10), rotation: { x: 0, y: 1, z: 0, w: 0 } })
  applyOutfit()

  // Avatar shapes have no collider; add an invisible one so the pointer can hit it
  const hit = engine.addEntity()
  Transform.create(hit, { parent: npc, position: Vector3.create(0, 0.9, 0), scale: Vector3.create(0.7, 1.8, 0.7) })
  MeshCollider.setBox(hit)
  pointerEventsSystem.onPointerDown(
    { entity: hit, opts: { button: InputAction.IA_POINTER, hoverText: 'Change outfit', maxDistance: 12 } },
    () => {
      outfitIndex = (outfitIndex + 1) % OUTFITS.length
      applyOutfit()
    }
  )
}
