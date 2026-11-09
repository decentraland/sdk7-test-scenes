# Skybox Control — SDK7 test scene

Test scene for three independent SDK components, all valid only on `engine.RootEntity`:
`Skybox` (`PBSkybox`), `Sun` (`PBSun`) and `EnvironmentFog` (`PBEnvironmentFog`). **Any one of
the three being present puts the scene in control of the environment** — they don't need to be
set together, and each resets independently to the default time-of-day look when removed, when
the component is deleted, or when the player leaves the scene.

```ts
Skybox.createOrReplace(engine.RootEntity, {
  skyboxTexture: 'images/sky-a.png',
  skyColors: { zenith: constantGradient, horizon: constantGradient, nadir: constantGradient },
  clouds: { opacity: 0.3, speed: 0.01, color: constantGradient },
  stars: { brightness: 12 }
})
Sun.createOrReplace(engine.RootEntity, { color: gradient, visible: false, intensity: 0.5, direction: Vector3.create(0, -1, 0) })
EnvironmentFog.createOrReplace(engine.RootEntity, { color: gradient, density: 0.02 })

Skybox.deleteFrom(engine.RootEntity) // back to the default procedural sky + reflections
Sun.deleteFrom(engine.RootEntity) // back to the default directional light
EnvironmentFog.deleteFrom(engine.RootEntity) // back to the default fog
```

## `Skybox` (`PBSkybox`)

```ts
skyboxTexture?: string               // equirectangular 2:1 image source path (same rules as Texture.src)
skyColors?: { zenith?, horizon?, nadir?, rim?: ColorGradient }  // also drives ambient lighting
clouds?: { opacity?: number; speed?: number; color?: ColorGradient }
stars?: { brightness?: number }
```

- `skyboxTexture` replaces the visible sky with an equirectangular (latitude-longitude) 2:1
  panorama, given as a plain image source path (same rules as `Texture.src`). The Explorer
  always samples it with Repeat wrap and bilinear filtering. Cube-cross, 3x2 and six-face
  layouts are not supported. The sun and the fog are unaffected by the override, and the
  ambient light keeps following `skyColors`; reflections are derived from whichever sky is currently visible (procedural or
  texture).
- `skyColors`/`clouds`/`stars` customize the **procedural** sky. While `skyboxTexture` is set
  the panorama replaces the procedural sky: `clouds`/`stars` are inert and `skyColors` no longer
  color the sky, but **still drive the ambient light** (so it can be matched to the panorama).
  `Sun` and `EnvironmentFog` keep applying regardless of `skyboxTexture`.
- Ambient lighting is **derived from `skyColors`**: `zenith` feeds the sky ambient term,
  `horizon` the equator term, `nadir` the ground term. There's no separate ambient field.
- `skyColors.rim` is a narrow glow right on the horizon line (like a sunset glow). Unset, it
  follows `horizon` when that is set. None of the presets below set `rim` explicitly, to
  demonstrate this fallback — watch the horizon line pick up the `horizon` color.
- `clouds.opacity`/`clouds.speed` default to `1`/`0.01` rad/s; `clouds.color` tints the clouds.
- `stars.brightness` defaults to `4.62` and is only visible at night.

## `Sun` (`PBSun`)

```ts
color?: ColorGradient       // tints the directional light and the sun disc
visible?: boolean           // default true; false hides the sun/moon discs + lens flare, not the light
intensity?: number          // default 1, multiplier on the time-of-day light intensity
direction?: Vector3         // direction the light travels; set = fixed all day; unset/zero = time-of-day path
```

- `direction`: `(0,-1,0)` means the sun sits straight overhead. When set, the sun's *position*
  stays fixed all day, but its `color`/`intensity` still follow the time-of-day or gradient.
  Unset or zero resumes the normal time-of-day arc.
- `visible` only hides the sun/moon discs and the screen-space lens flare (which is otherwise
  still drawn over a Sky texture); the directional light itself keeps lighting the scene
  regardless. It's an independent manual toggle in this scene's UI — Environment presets only
  set `color`, never `visible` (so e.g. "True darkness" zeroes the light's color but leaves the
  disc on; click "Hidden" too for a fully dark sky).

## `EnvironmentFog` (`PBEnvironmentFog`)

```ts
color?: ColorGradient
density?: number   // default 0.0005, exponential: fog = 1 - e^(-density * distance)
```

A scene cannot turn fog on or off — that's a player quality setting. With fog disabled in
Settings, `color`/`density` have no visible effect.

## `ColorGradient`

`ColorGradient` is `{ keys: ColorKey[] }`, and `ColorKey` is `{ time: number, color: Color4 }`.
`time` is *normalized* time of day: `0` = 00:00, `0.5` = 12:00, `1` = 24:00.

- A **single-key** gradient is a constant color for the whole day. Multi-key gradients are
  interpolated in ascending `time` order; positions **before the first key or after the last
  one clamp** to that key's color (no midnight wrap-around).
- `color` is unclamped/HDR-capable — values above `1` are allowed (e.g. a noon sun key brighter
  than white) and alpha is ignored by every consumer.

None of `PBSkybox`/`PBSun`/`PBEnvironmentFog` (nor `ColorGradient`) are exported as standalone
types from `@dcl/sdk/ecs` — only the `Skybox`/`Sun`/`EnvironmentFog`/`SkyboxTime` component
definitions themselves are. The scene derives each payload type from its own `createOrReplace`
signature instead of redefining it (`src/ui.tsx`: `SkyboxValue`/`SunValue`/`FogValue`/
`EnvironmentPreset`).

## SkyboxTime (fixed time of day)

`SkyboxTime` is a separate LWW component (also read only on `engine.RootEntity`) that pins the
day/night clock the procedural sky, lighting and any gradient above is evaluated against:

```ts
SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 12 * 3600 }) // noon, in seconds since 00:00
SkyboxTime.deleteFrom(engine.RootEntity) // back to the live/realm clock
```

## Scene content

A glossy tile floor, four metallic spheres of increasing roughness, a vertical mirror plane, and
four material test cubes near spawn (matte white, glossy red, brushed gold, emissive blue), plus
**one point `LightSource`** (warm, 8000 cd, 14 m range, shadows) with a small emissive sphere as
its marker. The light **orbits the player** (radius 0.75 m, 2.5 m up, 1 rad/s) via a scene
system, so with "True darkness" + Sun "Hidden" it is the only thing illuminating whatever you
walk towards; the cubes show diffuse falloff, a travelling specular highlight, a metallic sheen
and an unlit emissive reference side by side. There is no in-world sign; the UI panel is the
only control surface.

## What the scene demonstrates

The right-hand panel has nine rows, each independently settable, with its own `createOrReplace`/
`deleteFrom` call:

| Row | Component field(s) |
|-----|---------------------|
| Sky (A/B/None) | `Skybox.skyboxTexture` |
| Remove Skybox | forces `Skybox.deleteFrom` regardless of Sky/Environment |
| Environment preset | `Skybox.skyColors`/`clouds`/`stars` + `Sun.color` + `EnvironmentFog.color`/`density` |
| Sun & moon visibility | `Sun.visible` |
| Sun intensity | `Sun.intensity` |
| Sun direction | `Sun.direction` |
| Remove Sun | forces `Sun.deleteFrom` regardless of the Sun rows/Environment |
| Fog density | `EnvironmentFog.density` |
| Remove EnvironmentFog | forces `EnvironmentFog.deleteFrom` regardless of Fog density/Environment |
| Time | `SkyboxTime.fixedTime` (unrelated component, drives all of the above) |

Each component is created or deleted **independently**: e.g. selecting a Sky texture while
leaving Environment at "Default" and Fog at "Default" creates only `Skybox` — `Sun` and
`EnvironmentFog` stay absent (status line reads "Removed" for both, same as if the scene had
never set them). Try pairing opposite combinations — e.g. "Remove Skybox" + "Fog density: Thick"
— to see only `EnvironmentFog` present while the sky and sun stay at their defaults, confirming
the "any of the three present" activation rule doesn't require all three.

### Environment presets (`src/ui.tsx`)

Each preset is split per component (`skybox`/`sun`/`fog`) so "Remove Sun" etc. still work while a
preset is selected — picking a *new* preset clears all three force-removed flags again.

| Preset       | What it does                                                                                          | Expected look |
|--------------|--------------------------------------------------------------------------------------------------------|---------------|
| Default      | No groups sent on any component — everything stays at its ordinary time-of-day look.                   | Normal DCL sky. |
| Mars         | Constant warm orange/rust `skyColors` + `sun.color`, rust `fog.color`, `clouds.opacity = 0.3` with a dusty `clouds.color`. | Dusty rust-orange sky and horizon all day (the horizon rim follows `horizon`), thin sand-colored clouds, warm ambient. |
| Clear night  | `clouds.opacity = 0`, `stars.brightness = 12`, cool blue `sun.color`. No fog override.                  | No clouds, very bright stars once night falls (pair with Time = 00:00 to see it immediately). |
| Storm        | Dark grey constant `skyColors`, `clouds.opacity = 1` + slow `speed = 0.1` + dark `clouds.color`, grey `fog.color` + `fog.density = 0.01`, dim `sun.color`. | Heavy overcast dark-grey sky, clouds and fog all day, dim lighting, slow-drifting clouds, thicker fog (~100 m until ~63% fogged). |
| Day ramp     | Multi-key `skyColors.horizon`, `sun.color` and `fog.color` gradients (dawn → noon → dusk → night), with an HDR (>1) noon sun key. | Colors visibly shift as `Time` moves through 00:00 → 06:00 → 12:00 → 18:00 → 00:00: deep blue night, pink-orange dawn/dusk, pale cyan/bright noon. |
| True darkness | Black `skyColors` (so the derived ambient and horizon rim are black too), `clouds`/`stars` off, black `sun.color`, black `fog.color`. | Pitch-black sky and ambient; the sun/moon disc is still drawn (color black — nearly invisible) unless you also click Sun "Hidden". The only real illumination is the scene's own point `LightSource`. |

Environment presets' `skybox` part (except the ambient it derives) is inert while a Sky texture
(A/B) is also selected — pick Sky = None to see `skyColors`/`clouds`/`stars` clearly. `sun`/`fog`
keep applying regardless of the Sky selection.

### Fog density row

`Default` / `Thick (0.02)` / `Ultra-thick (0.1)` / `Clear (0)` set `EnvironmentFog.density`
(exponential falloff per meter: `1/density` ≈ the distance until ~63% of the view is fogged, so
≈ 50 m / ≈ 10 m respectively). It merges with whatever `fog.color` the active Environment preset
already sets (e.g. Storm + Thick keeps Storm's grey fog tint but overrides its own `0.01`
density). `Default` leaves `density` unset — if the Environment preset sets its own density
(Storm), that applies; otherwise it falls back to the SDK default (`0.0005`, ≈ 2 km until ~63%
fogged). `Clear` sets `0` (no visible fog regardless of distance). Whether fog renders at all
remains a player quality setting — with fog disabled in Settings, none of these buttons have a
visible effect.

### Sun intensity / direction rows

`Sun.intensity` default/`0 (off)`/`0.5`/`2` is a multiplier on the renderer's time-of-day light
intensity (negative values clamp to 0 — not exercised here). `Sun.direction` "Time of day"
(unset) / "Overhead" `(0,-1,0)` / "Low east" `(-1,-0.3,0)` / "Low west" `(1,-0.3,0)` pins the
sun's position for the whole day when set (color/intensity still follow the time of day or the
active gradient) — "Low east"/"Low west" are useful for checking long shadows and grazing light
without waiting for sunrise/sunset.

### Time row

`06:00 | 12:00 | 18:00 | 00:00 | Live`. The first four call `SkyboxTime.createOrReplace` with
`fixedTime` in seconds since 00:00; `Live` calls `SkyboxTime.deleteFrom` to resume the realm's
own clock.

Reflections are visible on:
- a row of four metallic spheres (`roughness` 0 / 0.25 / 0.5 / 0.75) so you can see how the
  derived reflection holds up from a sharp mirror finish to a soft blur,
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

## Running the scene

```
npm run start -- --explorer-alpha
```
