# Add ground navigation to an SDK7 scene

Copy `src/navmesh` from this archive into your existing scene. The selected engine and its dependencies are already in `runtime.mjs`. The project needs its normal SDK7 dependencies.

To try the example, add the import and call inside your existing entry point.

```ts
import { startNavigationExample } from './navmesh/examples/starter'

export function main() {
  startNavigationExample()
}
```

Open the scene in Explorer. The yellow NPC should reach the marker on the upper floor. The label reports **PASS**, including the unreachable control on the isolated platform. The `[navmesh-two-floors]` log reports import and the timed query batch.

Copy only the runtime files and `types.ts` if you already have your own controller. Open the prepared mesh once, reuse the navigator to query XYZ scene-local coordinates, then dispose it before discarding it.

```ts
import { openNavigation } from './navmesh/runtime.mjs'
import mesh from './navmesh/examples/mesh'

const navigator = await openNavigation(mesh)
const route = navigator.route([12.4, 0, 2.6], [8, 3, 11.5])
if (route.status === 'complete') {
  // Feed route.points to your NPC controller.
}
navigator.dispose()
```

Keep your scene settings and entrypoint. Keep a copy of the notices under `licenses/` with distributed code. `SOURCE.json` records versions and checksums. To update, replace the runtime and declarations as a unit, regenerate your prepared mesh with the matching bake kit and test your routes. Keep game geometry, behaviour and settings outside the copied folder.
