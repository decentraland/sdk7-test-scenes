import { isServer } from '@dcl/sdk/network'
import { setupGems } from './client/gems'
import { setupClient } from './client/setup'
import { setupUi } from './client/ui'
import { registerValidators } from './shared/schemas'

// Static side-effect import: registerMessages() (in messages.ts) defines a
// component under the hood, so it MUST run during initial module load — before
// the engine seals. Reaching it only via a dynamic import() inside main() runs it
// too late ("Engine is already sealed"). schemas.ts is likewise statically
// imported above, so its defineComponent() calls also run at load time.
import './shared/messages'

// Single codebase, branched by isServer(). The server runs headlessly (no
// rendering) and holds full authority over the round state, gems and scores.
export async function main() {
  // Define the component write-guards. Internally guarded by isServer(), so this
  // is a no-op on clients. Runs synchronously before the first await, while the
  // engine is still open.
  registerValidators()

  if (isServer()) {
    // ONLY the server module is dynamically imported, so its server-only
    // dependency (@dcl/sdk/server → Storage) is never pulled into the client
    // bundle path. It defines no components at module scope, so loading it after
    // the seal is safe.
    const { startServer } = await import('./server/server')
    await startServer()
    return
  }

  setupClient()
  setupGems()
  setupUi()
}
