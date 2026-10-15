This example scene makes usage of `AvatarModifierArea` and `CameraModeArea`.

### SCENE TESTING

Camera Mode Area can be tested with 2 intersected camera mode areas, one for enforcing First Person Camera and the other one for enforcing Third Peron Camera. The clickable cube toggles repositioning one of the areas to the border of the scene to test leaving the scene while inside the area.

Avatar Modifier Area can be tested in the back of the scene, the clickable cube adds or removes your own user id in the area's excluded list.

Walking up to either cube shows a card at the bottom of the screen with what it tests, the steps and the expected result.

## Pooled Area Reuse

Regression scene for [unity-explorer PR #10428](https://github.com/decentraland/unity-explorer/pull/10428): an area that reused a pooled collider kept the scale of the collider's previous owner, so it covered only a small spot at its center. In a real scene this showed up as an `AvatarModifierArea` with `AMT_HIDE_AVATARS` that never hid anyone.

The explorer keeps one pool of colliders for `AvatarModifierArea`, `CameraModeArea` and `TriggerArea`. The case is at the front right of the scene, under the **POOLED AREA REUSE** sign:

- **Red box (donor)** — an `AvatarModifierArea` without modifiers, Transform scaled to its own area size (5x2x5), like the areas above.
- **Green box (recipient)** — an `AvatarModifierArea` with `AMT_HIDE_AVATARS`, Transform scale 1, area 5x4x5. It takes the donor's collider from the pool.
- **Blue box (probe)** — a `TriggerArea` sized by its Transform scale (5x4x5). It also takes the donor's collider from the pool.

Every step is logged with the `[pooledAreaReuse]` prefix.

### Open on zone

```sh
Decentraland.exe --dclenv zone --realm sdk7testscenes.dcl.eth --position 9,99 --skip-version-check
```

Run it on the PR build and on `dev`. On `dev` all checks below fail.

Both cases run from the **Modifier Areas — QA info** panel (top right, hold **Alt** to use it). It shows these instructions, both auto check results and the buttons named below.

### Auto check (**Run pooled area check**)

Click the button and wait about three seconds. The scene removes the red box, creates the blue probe, moves you inside the probe 0.5m from its edge, then shows the result in the panel:

- **PASS** (green): the probe reported you entering. Expected with the fix.
- **FAIL** (red): the probe did not notice you, because its collider kept the donor's scale and covers only a 1x2x1 spot in the middle. Expected on `dev`.

The probe is removed and the red box comes back, so the check can be repeated. A scene can't read whether an avatar is hidden, so the auto check uses a `TriggerArea` from the same pool instead of the green `AvatarModifierArea`. The manual check covers the hiding itself.

### Manual check (**Swap red / green box**)

1. Click the button: the red box disappears, the green box appears half a second later.
2. Switch to third person and walk into the green box away from its center.
   - **Fixed:** your avatar hides anywhere inside the green box.
   - **Broken:** your avatar stays visible and hides only in a 1m spot at the center.
3. Click again to bring the red box back, then repeat.

Do not run the auto check while the green box exists: it asks you to restore the red box first.

### Multiplayer check (two clients)

The boxes are not shared: each player sees only the boxes they created.

1. Player A clicks **Swap red / green box** to create the green box and watches from outside it.
2. Player B stands where player A sees the green box, near its edge, not at its center.
   - **Fixed:** player A does not see player B.
   - **Broken:** player A still sees player B.
3. Swap roles.

Whether player B is hidden depends on player A's build. To compare builds, run player A on the PR build once and on `dev` once.

## Area Scale Drift

Second regression covered by [unity-explorer PR #10428](https://github.com/decentraland/unity-explorer/pull/10428): `AvatarModifierArea` and `CameraModeArea` ignore their Transform scale only when they are created. Scaling the entity, or one of its parents, afterwards grew the area along with it.

The orange box appears at the back right of the scene only while the check runs. Every step is logged with the `[areaScaleDrift]` prefix.

### Auto check (**Run scale drift check**)

Click the button and wait about four seconds. The scene:

1. Creates a 2x2x2 `CameraModeArea` with Transform scale 1 (orange box). It forces the camera mode you are not in.
2. Scales the area entity to 2.5. The orange box is a separate entity and keeps the real area size.
3. Moves you to the area center. The camera must switch; if it does not, the check prints **NOT RUN**.
4. Moves you 2m from the center: outside the 2x2x2 area, inside the 5x5x5 area it turns into when it follows the scale.

Then it shows the result in the panel and removes the area:

- **PASS** (green): the camera switched back outside the box. Expected with the fix.
- **FAIL** (red): the camera stayed switched, the area grew with the entity scale. Expected on `dev`.

On a build without the pool fix (`dev`), run this check first after entering the scene. A collider that went back to the pool can come out with a smaller scale, so the area stays small even after it follows the entity scale and the check shows a false **PASS**.

## Run locally

```sh
npm install
npm run build
npm run start
```

Connect the Explorer to the local preview at `9,99`.
