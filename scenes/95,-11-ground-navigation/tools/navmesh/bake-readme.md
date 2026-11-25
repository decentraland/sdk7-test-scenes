# Bake walkable surfaces

Use Node 24. The optional bake tool only runs while preparing assets. Copy the resulting TypeScript data file to your scene and pass it to the SDK7 kit for the same backend.

```sh
node bake.mjs surfaces.json mesh.ts
```

The input uses SDK7 scene-local coordinate triples `[x, y, z]` and indexed triangles for each surface. Wind each surface so the normals face up in SDK7 coordinates. The sample contains the two-floor layout used by the starter. Export your walkable collision triangles into the same shape. Include obstacles or carve gaps in the authored surfaces as appropriate.

The optional top-level `settings` object overrides the baker defaults. For example, `{ "radius": 0.3, "height": 1.6, "climb": 0.3 }` describes an agent in metres. Rebuild when colliders, their transforms or effective bake settings change. Add your own tests for reachable and unreachable endpoints.

`SOURCE.json` records versions and checksums. The Detour bake kit uses the same stock WASM as the consumer kit.

Copy `measure.mjs` separately when you want Node timings for your prepared mesh. Give it the matching SDK7 runtime, mesh and a route list. The sample `routes.json` records expected outcomes for the supplied surfaces.

```sh
node measure.mjs path/to/src/navmesh/runtime.mjs mesh.ts routes.json
```

The report records initial open time and five timed query batches per route. Run the same route list against both engines. Profile update and crowd costs in your game separately.
