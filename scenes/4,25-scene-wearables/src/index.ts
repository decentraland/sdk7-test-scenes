import { isServer } from '@dcl/sdk/network'
import { startClient } from './client/client'
import { registerValidators } from './shared/schemas'
// These define components, so they must run at module load, before the engine seals
import './shared/avatar-scene-wearables'
import './shared/messages'

export async function main() {
  registerValidators()
  if (isServer()) {
    // Imported only on the server so server-only code stays out of the client path
    const { startServer } = await import('./server/server')
    startServer()
    return
  }
  startClient()
}
