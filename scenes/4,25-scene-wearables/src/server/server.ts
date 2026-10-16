import { engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { NPC_KEY, WEARABLES } from '../shared/wearables'
import { room } from '../shared/messages'
import { Outfits } from '../shared/schemas'

const outfits = new Map<string, string[]>()
let outfitsEntity: Entity

export function startServer(): void {
  outfitsEntity = engine.addEntity()
  Outfits.create(outfitsEntity, { keys: [], wearables: [] })
  syncEntity(outfitsEntity, [Outfits.componentId])

  // The sender comes from the verified message context, never from the payload
  room.onMessage('toggleWearable', (data, context) => {
    if (!context || !(data.name in WEARABLES)) return
    const key = data.npc ? NPC_KEY : context.from.toLowerCase()
    const worn = outfits.get(key) ?? []
    outfits.set(key, worn.includes(data.name) ? worn.filter((n) => n !== data.name) : [...worn, data.name])
    publish()
  })

  room.onMessage('takeOffAll', (data, context) => {
    if (!context) return
    outfits.delete(data.npc ? NPC_KEY : context.from.toLowerCase())
    publish()
  })

  engine.addSystem(dropLeftPlayersSystem)
}

function publish(): void {
  const outfit = Outfits.getMutable(outfitsEntity)
  outfit.keys = [...outfits.keys()]
  outfit.wearables = [...outfits.values()].map((worn) => worn.join(','))
}

// A player who leaves the scene loses the outfit
let elapsed = 0
function dropLeftPlayersSystem(dt: number): void {
  elapsed += dt
  if (elapsed < 2) return
  elapsed = 0

  const present = new Set<string>([NPC_KEY])
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) present.add(identity.address.toLowerCase())

  let changed = false
  for (const key of [...outfits.keys()]) {
    if (present.has(key)) continue
    outfits.delete(key)
    changed = true
  }
  if (changed) publish()
}
