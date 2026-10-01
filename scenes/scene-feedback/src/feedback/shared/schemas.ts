import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Pulsed by the server every HEARTBEAT_MS. room.send is fire-and-forget and the
// room can be "ready" while the server is still cold-booting, so clients only
// open a Question once they have seen this value advance.
export const ServerHeartbeat = engine.defineComponent('feedback::Heartbeat', {
  beatAt: Schemas.Int64
})

export function registerValidators(): void {
  if (!isServer()) return
  ServerHeartbeat.validateBeforeChange(
    (value) => value.senderAddress.toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()
  )
}
