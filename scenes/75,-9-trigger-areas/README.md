This test scene exercises the `TriggerArea` component end-to-end, including the new ENTER/EXIT-only wire contract and the SDK's per-tick `onTriggerStay` synthesis.

## Layout

The scene is a single parcel (`75,-9`). Local-space coordinates below.

- **`(8, 1.5, 8)`** — Smoke-test box trigger (semi-transparent blue, 2×2×2 m). New for the OnStay refactor. A floating `TextShape` shows live counters: `ENTER: X | STAY: Y | EXIT: Z`.
- **`(3 / 5, 1, 14.5)`** — Small "mini-cube" triggerer with a `CL_CUSTOM3` mesh collider. Moves between x=3 and x=5 on click of its sibling button at `(1, 1, 14.5)`.
- **`(5 / 8, 2, 14.5)`** — Monster GLTF (`models/Monster.glb`) with `visibleMeshesCollisionMask: CL_CUSTOM4`. Moves between x=8 and x=5 on click of its sibling button at `(10, 1, 14.5)`.
- **`(5, 1.5, 14.5)`** — Rotated white box trigger (3 m tall, 45° around Y) with collision mask `CL_PLAYER | CL_CUSTOM4`. Changes to a random color on every enter/exit.
- **`(8, 1, 10.5)`** — Clickable static sphere ("sphere spawn button"). Click it to spawn falling physics spheres above it; each spawned sphere is itself a `TriggerArea` and is destroyed on its own first `onTriggerEnter`.

## Test scenarios

### 1. Smoke-test trigger — per-tick OnStay synthesis (new in this PR)

Walk into the blue cube at `(8, 1.5, 8)`. Expected behavior:

- **1 `onTriggerEnter`** when you step in — cube flashes green, console logs `[trigger-areas] ENTER #1 frame=N triggerer=<entity>`.
- **~60 `onTriggerStay` callbacks per second** while you stand inside — console logs `[trigger-areas] STAY #K frame=M triggerer=<entity>` on every engine tick.
- **1 `onTriggerExit`** when you step out — cube reverts to blue, console logs `[trigger-areas] EXIT #1 frame=M triggerer=<entity>`.
- The floating `TextShape` label above the cube updates live with all three counters.

### 2. Clickable mini-cube — no trigger fires (collision-layer mismatch)

Click the cube button at `(1, 1, 14.5)`. The mini-cube triggerer moves to `x=5` and ends up inside the rotated white trigger at `(5, 1.5, 14.5)`. Expected behavior: **no trigger event fires**, no color change. This is correct: the moving cube has `MeshCollider.setBox(..., CL_CUSTOM3)` and the trigger only listens on `CL_PLAYER | CL_CUSTOM4`. Used to validate that the `collisionMask` filtering is honored end-to-end.

### 3. Clickable monster — color change via `CL_CUSTOM4`

Click the cube button at `(10, 1, 14.5)`. The Monster GLTF moves to `x=5` and overlaps the rotated white trigger. Expected behavior: the trigger fires `onTriggerEnter` and the trigger box changes to a random color; on the next click the monster moves back to `x=8`, fires `onTriggerExit`, and the trigger picks a new random color. Works because the monster's `visibleMeshesCollisionMask = CL_CUSTOM4` matches the trigger's mask. Console logs `<entity> DETECTED OnEnter/OnExit from other entity: <triggerer>`.

### 4. Player traversal — color change via `CL_PLAYER`

Walk into and back out of the rotated white trigger at `(5, 1.5, 14.5)`. Expected behavior: same as scenario 3 — the trigger picks a new random color on enter and another on exit. Validates the `CL_PLAYER` half of the trigger's collision mask. (And separately validates that the same `setupTriggerArea` helper works for both the player avatar and a scene-owned GLTF triggerer.)

### 5. Spawned falling spheres — trigger-on-triggerer collision

Click the static sphere at `(8, 1, 10.5)`. Each click spawns a translucent sphere ~2 m above it that falls under Cannon.js gravity. Each spawned sphere has its own `TriggerArea.setSphere(..., CL_POINTER)`, and the static button sphere has the default `MeshCollider` (which includes `CL_POINTER`). Expected behavior: the falling sphere drops, its trigger area detects the static button on first contact, and the sphere (plus its physics body) is removed. Used to validate that `TriggerArea` works correctly when the trigger and the triggerer roles are reversed (here the *spawned* entity is the trigger area, and the clickable static sphere acts as the triggerer).
