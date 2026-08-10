# Tween From Current Position

> **Temporary local SDK link.** This scene currently points its `@dcl/sdk`
> (and `@dcl/ecs`, `@dcl/js-runtime`, `@dcl/react-ecs`, `@dcl/sdk-commands`)
> devDependencies at a local `js-sdk-toolchain` build
> (`fix/tween-state-invalidation`) that fixes a `tweenSystem.tweenCompleted()`
> false-positive on retarget. **Swap these back to published/CI packages
> before opening the PR.**

Proves that `Tween.setMove` can move an entity from its **current, live
position** to a new target -- including retargeting the destination while
the entity is still mid-travel -- as long as the tween's `start` argument is
built from `Transform.get(entity).position` rather than a hardcoded vector.

## Why this works

- Unity Explorer PUTs the tweened entity's `Transform` back to the scene over
  CRDT **every frame** a tween is active, so `Transform.get(entity).position`
  is the live, mid-flight position of the entity (at most one frame stale).
- `Tween.setMove(entity, start, end, duration, easing)` uses
  `createOrReplace` under the hood, which **always** resends the component
  (even if the bytes are identical), and the explorer kills and rebuilds the
  tweener the same frame it receives the update. So calling
  `Tween.setMove(entity, Transform.get(entity).position, newTarget, ...)`
  while a previous tween on that entity is still running retargets it
  smoothly from wherever it currently is -- no snap, no teleport.
- Omitting `start` does **not** mean "use the current position" -- a missing
  proto `Vector3` deserializes to `(0, 0, 0)` on the renderer side, which
  teleports the entity to the world origin. `start` must always be supplied
  explicitly.

## What's in the scene

1. **Centerpiece (back of the parcel).** A blue traveler cube plus 5 colored
   pads (RED, ORANGE, YELLOW, GREEN, BLUE). Clicking any pad sends the
   traveler there using its current live position as the tween start.
   Duration is a generous 2.5s specifically so you have time to click a
   *different* pad while the cube is mid-flight and watch it smoothly change
   direction instead of snapping back anywhere.
2. **"Come to me" pad (magenta, near spawn).** Tweens the same traveler cube
   from wherever it currently is to your current position (clamped to stay
   inside the parcel).
3. **Arrival feedback.** A system checks `tweenSystem.tweenCompleted(traveler)`
   every frame. On arrival the cube flashes gold and an "Arrived!" label
   appears above it; both reset the moment a new journey starts.

   This is also the in-world regression check for the `tweenSystem`
   completion fix: retargeting a running tween used to make
   `tweenCompleted()` false-positive (report "done" while the cube was still
   mid-flight), which is why an earlier version of this scene compared the
   live position against the target instead. With the fix,
   `tweenCompleted()` is the correct, intended API to use here.

All pads use `maxDistance: 20` -- double the SDK's default 10m click range --
so every pad stays clickable from anywhere in the parcel.

## How to exercise it

1. Click any of the 5 colored pads -- the traveler cube glides there over
   2.5 seconds and flashes gold with an "Arrived!" label when it lands.
2. While it's still moving, click a **different** colored pad. The cube
   should smoothly curve toward the new target from its current position --
   it must never jump or snap.
3. Click the magenta "come to me" pad at any time (including mid-travel) to
   redirect the traveler to your own position.
