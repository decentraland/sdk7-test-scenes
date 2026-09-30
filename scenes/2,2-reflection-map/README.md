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
- Both fields accept `Texture` (file) **and `VideoTexture`** sources
  (`Material.Texture.Video({ videoPlayerEntity })`); `AvatarTexture` is ignored. A video
  source is sampled live — reflections derived from a video follow it with a few frames of
  delay.

## Environment groups (procedural sky)

`PBSkybox` also carries optional groups that customize the **procedural** sky (as opposed
to `skyboxTexture`, which replaces it outright):

```ts
sun?: { color?: ColorGradient; visible?: boolean }
skyColors?: { zenith?: ColorGradient; horizon?: ColorGradient; nadir?: ColorGradient }
fog?: { color?: ColorGradient }
clouds?: { opacity?: number; speed?: number; texture?: TextureUnion }  // opacity/speed default 1 / 0.01
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
- `clouds.texture` replaces the default procedural cloud layer with an equirectangular 2:1
  image (also inert while `skyboxTexture` is set — see below). It accepts `Texture` and
  `VideoTexture` sources. Channels: **R** = cloud tint intensity (multiplied by `clouds.color`),
  **G** = opacity/coverage, **B** = a sun-highlight mask; a plain grayscale image works as a
  simple cloud mask (equal R/G, no highlight). Unset = default procedural clouds.
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
material test cubes near spawn (matte white, glossy red, brushed gold, emissive blue), **one point
`LightSource`** (warm, 8000 cd, 14 m range, shadows) with a small emissive sphere as its marker, and
one small looping **`VideoPlayer`** screen (`assets/video/video-example.mp4`, muted, looping,
`MeshRenderer.setPlane` at `(2, 1.6, 8)` on the west wall, mirroring the mirror plane's placement on
the east wall) so the video source used by the Sky/Reflection/Clouds "Video" buttons is also visible
playing directly on a screen. The
light **orbits the player** (radius 3 m, 2.5 m up, ~0.8 rad/s) via a scene system, so in True
darkness it lights up whatever you walk towards; the cubes show diffuse falloff, a travelling
specular highlight, a metallic sheen and an unlit emissive reference side by side.
There is no in-world sign; the UI panel is the only control surface.

## What the scene demonstrates

The right-hand panel has five independent controls: **Sky** (A/B/Video/None), **Reflection**
(A/B/Video/None + an Invalid-src button), **Clouds texture** (None/Texture/Video),
**Environment** (a preset selector) and **Time** (a fixed-time selector). Every click composes
the *current* selection of all of these into a single `Skybox.createOrReplace` call (only the
selected fields/groups are included) plus a separate `SkyboxTime` call, or calls
`Skybox.deleteFrom` when Sky, Reflection, Clouds texture **and** Environment are all at their
neutral value (`None`/`None`/`None`/`Default`):

| Sky      | Reflection  | Result                                                                |
|----------|-------------|------------------------------------------------------------------------|
| A or B   | None        | Custom sky, reflections **derived from the sky texture**               |
| None     | A or B      | Default procedural sky, custom reflection map                          |
| A or B   | A or B      | Custom sky and an independent, unrelated reflection map                |
| None     | None        | `Skybox.deleteFrom` (only if Reflection/Clouds/Environment are also neutral) — default procedural sky and default reflections |
| any      | Invalid src | `reflectionMap` points at a non-existent file, to exercise the failure/fallback path |
| Video    | any         | `skyboxTexture` samples the scene's `VideoPlayer` entity live (`Material.Texture.Video`) |
| any      | Video       | `reflectionMap` samples the same `VideoPlayer` entity live |

### Clouds texture row

`None` / `Texture` (`images/clouds-a.png`) / `Video` (the same `VideoPlayer` entity). Sets
`clouds.texture` while preserving whatever `clouds.opacity`/`speed`/`color` the current
Environment preset already sets (e.g. Mars + Clouds Texture keeps Mars' dusty tint and
0.3 opacity, but replaces the cloud shape with `clouds-a.png`'s mask). Only visible with
Sky = None (`clouds` is inert while `skyboxTexture` is set — see above); with Sky = Video,
selecting Clouds = Video maps the same live video into the cloud layer, with the mask's G
channel controlling how much of it shows through as coverage.

Expect: `Texture` shows two clusters of soft cloud-like blobs concentrated in the upper sky,
clearly different from the default Genesis cloud shapes. `Video` maps the raw video frame into
the cloud layer — since the video has no G-channel mask authored for this purpose, expect
either a faint/uneven cloud coverage or full-frame coverage depending on the video's own
green-channel content; it's meant to exercise the video-as-clouds-texture code path, not to look
like a natural sky.

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

### Video sky / reflection

Sky = Video shows the scene's looping `assets/video/video-example.mp4` mapped as the visible
sky (equirect-stretched — it will look distorted since the source clip isn't an equirect
panorama, that's expected). Reflection = None while Sky = Video derives reflections from that
same video frame, so the metallic spheres/mirror/floor show a blurry, delayed copy of the
video; Reflection = Video maps it directly instead (same source, no derivation step). In both
cases reflections update live but trail the sky by a few frames — that lag is the thing this
row is meant to demonstrate.

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

`clouds-a.png` is a 2048×1024 equirect clouds-texture test image (generated deterministically,
seed `20260930`, well under 1 MB): a black background with ~25 soft elliptical cloud blobs,
positioned with `v` (normalized zenith-to-nadir, image top = zenith = `v=1`) in the `0.55..0.9`
band — i.e. above the horizon but not at the zenith pole — so the pattern reads unmistakably as
an override of the default procedural clouds. Per blob: **G** (opacity/coverage) is a soft
Gaussian falloff; **R** (tint intensity) is the same falloff × 0.9; **B** (sun-highlight mask)
is a smaller Gaussian ellipse offset toward the blob's top-left (smaller column, smaller row).
The image wraps seamlessly at the `u=0/1` seam.

## Running the scene

```
npm run start -- --explorer-alpha
```
