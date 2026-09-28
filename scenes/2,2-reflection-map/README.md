# Reflection Map & Skybox — SDK7 test scene

Test scene for the `Skybox` SDK component (`PBSkybox`), set on `engine.RootEntity`:

```ts
Skybox.createOrReplace(engine.RootEntity, {
  skyboxTexture: Material.Texture.Common({ src: 'images/sky-a.png', wrapMode: TextureWrapMode.TWM_REPEAT }),
  reflectionMap: Material.Texture.Common({ src: 'images/env-a.png', wrapMode: TextureWrapMode.TWM_REPEAT })
})
Skybox.deleteFrom(engine.RootEntity) // back to defaults
```

- `skyboxTexture` replaces the visible sky (an equirectangular 2:1 panorama). Time-of-day
  lighting (ambient, sun, fog) is unaffected by the override.
- `reflectionMap` replaces the reflection cubemap used by every reflective material in the
  scene (also equirectangular 2:1). If it is unset but `skyboxTexture` is set, reflections
  are derived from the skybox texture instead of the default environment.
- Only `Texture` (file) sources are supported for both fields.

## What the scene demonstrates

The right-hand panel exposes every combination as two independent selectors plus a
failure-path button. Every click composes the **current** selection of both selectors into
a single `Skybox.createOrReplace` call (only the selected fields are included), or calls
`Skybox.deleteFrom` when both selectors are `None`:

| Sky      | Reflection  | Result                                                                |
|----------|-------------|------------------------------------------------------------------------|
| A or B   | None        | Custom sky, reflections **derived from the sky texture**               |
| None     | A or B      | Default procedural sky, custom reflection map                          |
| A or B   | A or B      | Custom sky and an independent, unrelated reflection map                |
| None     | None        | `Skybox.deleteFrom` — default procedural sky and default reflections   |
| any      | Invalid src | `reflectionMap` points at a non-existent file, to exercise the failure/fallback path |

Reflections are visible on:
- a row of four metallic spheres (`roughness` 0 / 0.25 / 0.5 / 0.75) so you can see how the
  map holds up from a sharp mirror finish to a soft blur,
- a large vertical mirror-like plane,
- the glossy floor tiles (reused from `0,6-ui-zindex-and-opacity`).

## Orientation check (`images/sky-a.png`)

`sky-a.png` is a labelled daylight panorama meant to be checked against the compass:
- **N** (red square, texture centre, u≈0.5) — faces the default spawn/camera target direction.
- **E** (blue square, u≈0.75), **W** (green square, u≈0.25), **S** (yellow squares at the
  u=0/1 seam) sit 90° apart around the horizon band.
- A pale **UP** disc marks the zenith (top pole), a brown **DOWN** disc marks the nadir
  (bottom pole).

Walk around and look up/down in-world to confirm each marker lines up with the direction it
names. `sky-b.png` is a neon/night panorama (dark purple gradient, horizontal neon stripes,
a large moon) with no orientation markers — it's meant to contrast visually with `sky-a.png`
rather than to be direction-checked.

`env-a.png` is a warm indoor-style reflection map (orange/brown bands with bright "window"
rectangles) and `env-b.png` is a cold studio-style reflection map (grey with bright white
softbox rectangles) — both are meant to be visually distinct on the metallic surfaces.

## Running the scene

```
npm run start -- --explorer-alpha
```
