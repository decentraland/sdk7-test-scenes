import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// Client → server request to run the exploit on the SERVER's engine. Empty
// payload — the server derives the requester from the verified context.from and
// purges every OTHER avatar. Running it server-side is what pushes the crafted
// DELETE_ENTITY across the scene→host boundary (crdtSendToRenderer), the one
// place hammurabi's guard denies it and bevy applies it.
export const Messages = {
  purgeOnServer: Schemas.Map({}),

  // Client → server liveness ping. Empty payload — its only purpose is to give the
  // server a comms-verified `context.from`, an identity source INDEPENDENT of the
  // avatar CRDT roster. The server's swap detector cross-checks recent verified
  // senders against its roster: a sender with no matching avatar entity is the
  // "player is provably here but the server can't see them" swap.
  ping: Schemas.Map({})
}

export const room = registerMessages(Messages)
