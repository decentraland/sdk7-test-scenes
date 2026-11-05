import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// One outfit per key: a lower-case player address, or NPC_KEY for the mannequin.
// wearables[i] is the comma-joined list of wearable names that keys[i] wears.
export const Outfits = engine.defineComponent('scene-wearables-auth::Outfits', {
  keys: Schemas.Array(Schemas.String),
  wearables: Schemas.Array(Schemas.String)
})

export function registerValidators(): void {
  // validateBeforeChange errors on a client
  if (!isServer()) return
  Outfits.validateBeforeChange((value) => value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase())
}
