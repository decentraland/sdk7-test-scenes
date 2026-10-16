import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Every outfit in the scene, owned by the server: keys[i] wears the comma-joined wearables[i]
export const Outfits = engine.defineComponent('scene-wearables-auth::Outfits', {
  keys: Schemas.Array(Schemas.String),
  wearables: Schemas.Array(Schemas.String)
})

// Only the server may write the outfits; calling validateBeforeChange on a client errors
export function registerValidators(): void {
  if (!isServer()) return
  Outfits.validateBeforeChange((value) => value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase())
}
