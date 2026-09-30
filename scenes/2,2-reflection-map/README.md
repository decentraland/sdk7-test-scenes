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

## Environment groups (procedural sky)

`PBSkybox` also carries optional groups that customize the **procedural** sky (as opposed
to `skyboxTexture`, which replaces it outright):

```ts
sun?: { color?: ColorGradient; visible?: boolean }
skyColors?: { zenith?: ColorGradient; horizon?: ColorGradient; nadir?: ColorGradient }
fog?: { color?: ColorGradient }
clouds?: { opacity?: number; speed?: number }  // defaults 1 / 0.01
stars?: { brightness?: number }                 // default 4.62, only visible at night
```

- **`ColorGradient`** is `{ keys: ColorKey[] }`, and `ColorKey` is `{ time: number, color: Color4 }`.
  `time` is *normalized* time of day: `0` = 00:00, `0.5` = 12:00, `1` = 24:00.
- A **single-key** gradient is a constant color for the whole day. Multi-key gradients are
  interpolated in ascending `time` order; positions **before the first key or after the
  last one clamp** to that key's color (no midnight wrap-around).
- `color` is unclamped/HDR-capable — values above `1` are allowed (e.g. a noon sun key
  brighter than white) and alpha is ignored by every consumer.
- Ambient lighting is **derived from `skyColors`**: `zenith` feeds the sky ambient term,
  `horizon` the equator term, `nadir` the ground term. There's no separate ambient field.
- `sun.color` tints both the directional light and the visible sun disc.
- `sun.visible` (default `true`) hides the sun and moon discs **and** the screen-space lens flare, which
  is otherwise still drawn over a Sky texture; the directional light itself keeps lighting the scene.
- `skyColors`, `clouds` and `stars` are **inert while `skyboxTexture` is set** (the panorama
  replaces the procedural sky and stars/clouds live on it). `sun` and `fog` (and the ambient
  light they/`skyColors` drive) keep applying regardless of `skyboxTexture`.
- Every override — texture or procedural group — resets to the default time-of-day skybox
  when the player leaves the scene, the component is removed, or a field/group is unset.

The `Skybox` component's `PBSkybox`/group interfaces aren't exported as standalone types from
`@dcl/sdk/ecs` (only the `Skybox`/`SkyboxTime` component definitions are); the scene derives
the payload type from `Skybox.createOrReplace`'s own signature instead of redefining it
(`src/ui.tsx`, `SkyboxValue`/`EnvironmentPreset`).

## SkyboxTime (fixed time of day)

`SkyboxTime` is a separate LWW component (also read only on `engine.RootEntity`) that pins
the day/night clock the procedural sky, lighting and any `PBSkybox` gradient above are
evaluated against:

```ts
SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 12 * 3600 }) // noon, in seconds since 00:00
SkyboxTime.deleteFrom(engine.RootEntity) // back to the live/realm clock
```

## Scene content

A glossy tile floor, four metallic spheres of increasing roughness, a vertical mirror plane, four
material test cubes near spawn (matte white, glossy red, brushed gold, emissive blue) and **one point
`LightSource`** (warm, 8000 cd, 14 m range, shadows) with a small emissive sphere as its marker. The
light **orbits the player** (radius 3 m, 2.5 m up, ~0.8 rad/s) via a scene system, so in True
darkness it lights up whatever you walk towards; the cubes show diffuse falloff, a travelling
specular highlight, a metallic sheen and an unlit emissive reference side by side.
There is no in-world sign; the UI panel is the only control surface.

## What the scene demonstrates

The right-hand panel has four independent controls: **Sky** (A/B/None), **Reflection**
(A/B/None + an Invalid-src button), **Environment** (a preset selector) and **Time** (a
fixed-time selector). Every click composes the *current* selection of all four into a
single `Skybox.createOrReplace` call (only the selected fields/groups are included) plus a
separate `SkyboxTime` call, or calls `Skybox.deleteFrom` when Sky, Reflection **and**
Environment are all at their neutral value (`None`/`None`/`Default`):

| Sky      | Reflection  | Result                                                                |
|----------|-------------|------------------------------------------------------------------------|
| A or B   | None        | Custom sky, reflections **derived from the sky texture**               |
| None     | A or B      | Default procedural sky, custom reflection map                          |
| A or B   | A or B      | Custom sky and an independent, unrelated reflection map                |
| None     | None        | `Skybox.deleteFrom` (only if Environment is also `Default`) — default procedural sky and default reflections |
| any      | Invalid src | `reflectionMap` points at a non-existent file, to exercise the failure/fallback path |

### Environment presets (`src/ui.tsx`)

| Preset       | What it does                                                                                          | Expected look |
|--------------|--------------------------------------------------------------------------------------------------------|---------------|
| Default      | No groups sent — procedural sky stays at its ordinary time-of-day look.                                | Normal DCL sky. |
| Mars         | Constant warm orange/rust `skyColors` + `sun`, rust `fog`, `clouds.opacity = 0.3` with a dusty `clouds.color`. | Dusty rust-orange sky and horizon all day (the horizon rim follows the horizon color), thin sand-colored clouds, warm ambient. |
| Clear night  | `clouds.opacity = 0`, `stars.brightness = 12`, cool blue `sun.color`.                                  | No clouds, very bright stars once night falls (pair with Time = 00:00 to see it immediately). |
| Storm        | Dark grey constant `skyColors`, `clouds.opacity = 1` + slow `speed = 0.1` + dark `clouds.color`, grey `fog`, dim `sun`. | Heavy overcast dark-grey sky, clouds and fog all day, dim lighting, slow-drifting clouds. |
| Day ramp     | Multi-key `skyColors.horizon`, `sun.color` and `fog.color` gradients (dawn → noon → dusk → night), with an HDR (>1) noon sun key. | Colors visibly shift as `Time` moves through 00:00 → 06:00 → 12:00 → 18:00 → 00:00: deep blue night, pink-orange dawn/dusk, pale cyan/bright noon. |
| True darkness | Black `sun.color` + `sun.visible = false`, black `skyColors` (so the derived ambient and the horizon rim are black), black `fog`, `clouds.opacity = 0`, `stars.brightness = 0`. | Pitch black sky and lighting; the only illumination is the scene's own point `LightSource` (warm bulb at 8,3,8, shadows on) on the floor and spheres. |

Environment presets (except `sun`/`fog`) are inert while a Sky texture (A/B) is also
selected — pick Sky = None to see them clearly.

### Sun & moon row

`Visible` / `Hidden` toggles `sun.visible`. It merges with the current preset's `sun.color`, so e.g.
Mars + Hidden keeps the warm light but shows no disc, no moon and no flare. Try Hidden with Sky A:
the dim flare that shows through the texture disappears. `Visible` restores the defaults.

### Time row

`06:00 | 12:00 | 18:00 | 00:00 | Live`. The first four call `SkyboxTime.createOrReplace`
with `fixedTime` in seconds since 00:00; `Live` calls `SkyboxTime.deleteFrom` to resume the
realm's own clock.

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
