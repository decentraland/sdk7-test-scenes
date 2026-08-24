import { isServer } from '@dcl/sdk/network'
import { setupClient } from './client/setup'
import { setupUi } from './client/ui'
import { registerValidators } from './shared/schemas'

// Static side-effect import: registerMessages() (in messages.ts) defines a
// component under the hood, so it MUST run during initial module load — before
// the engine seals — on both client and server.
import './shared/messages'

// Single codebase, branched by isServer(). The server runs headlessly (no
// rendering); here it does almost nothing — the scene exists only to reproduce
// the inbound DELETE_ENTITY avatar-purge bug (see src/client/repro-delete.ts).
export async function main() {
  // Define the heartbeat write-guard. Internally guarded by isServer(), so this
  // is a no-op on clients. Runs synchronously before the first await, while the
  // engine is still open.
  registerValidators()
  if (isServer()) {
    // ONLY the server module is dynamically imported so nothing server-only leaks
    // into the client bundle path. It defines no components at module scope, so
    // loading it after the engine seals is safe.
    const { startServer } = await import('./server/server')
    await startServer()
    return
  }
  setupClient()
  setupUi()
}
