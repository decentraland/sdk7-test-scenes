import { isServer } from '@dcl/sdk/network'
import { setupClient } from './client/setup'
import { setupUi } from './client/ui'
import { registerValidators } from './shared/schemas'

// Static side-effect import: registerMessages() (in messages.ts) defines a
// component under the hood, so it MUST run during initial module load — before
// the engine seals. Reaching it only via a dynamic import() inside main() runs it
// too late ("Engine is already sealed"). schemas.ts is likewise statically
// imported above, so its defineComponent() calls also run at load time.
import './shared/messages'

// Single codebase, branched by isServer(). Both branches run the SAME test suite
// from src/shared/suite — that is the whole design: the server's column and the
// client's column are only comparable because neither side has its own copy of the
// tests. The server additionally owns the live rig.
export async function main() {
  // Define the component write-guards. Internally guarded by isServer(), so this
  // is a no-op on clients. Runs synchronously before the first await, while the
  // engine is still open.
  registerValidators()

  if (isServer()) {
    // ONLY the server module is dynamically imported, so nothing server-specific is
    // pulled into the client bundle path. It defines no components at module scope,
    // so loading it after the seal is safe.
    const { startServer } = await import('./server/server')
    await startServer()
    return
  }

  setupClient()
  setupUi()
}
