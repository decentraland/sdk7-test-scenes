# Tween Following Cube

A cube that chases the player, driven entirely by tweens aimed from the cube's
**current position**. A pad switches between the two ways of carrying that
motion, so the difference is visible side by side in one scene:

- **`setMoveContinuous` (default, green)** -- smooth.
- **`Move` tween re-created on every re-aim (red-orange)** -- visibly jittery.

Both modes use the **same** re-aim trigger (the player moving `MOVE_THRESHOLD`
= 0.1m), the same `CUBE_SPEED`, and the same stop rule. Only the kind of tween
differs, so whatever you see is attributable to the tween mode and not to how
often the scene re-aims.

## What's in the scene

1. **The follow cube.** Starts at `(3, 0.5, 6)` and chases you, stopping
   `STOP_DISTANCE` = 1m short. Its colour shows the active mode: green for
   `setMoveContinuous`, red-orange for `Move`.
2. **Mode pad (magenta, at `(13, 0.1, 3)` near spawn).** Click to switch modes.
   Switching drops the in-flight tween so the new mode starts clean. The label
   above it always names the active mode. `maxDistance: 20` (double the SDK
   default) keeps it clickable from most of the parcel.

## How to exercise it

1. Walk around. In the default green mode the cube glides after you smoothly.
2. Click the magenta pad to switch to `Move` mode -- the cube turns red-orange.
3. Walk around again. The cube now visibly stutters: it lurches forward, snaps
   back a little, lurches again.
4. Stand still in either mode. The cube settles 1m away and stops.

## Why `Move` jitters and `setMoveContinuous` does not

`Transform.get(cube).position` is the position the **renderer** last wrote back
to the scene over CRDT, so it trails the cube's true on-screen position by the
round trip (roughly 1-3 frames). `Move` mode declares that stale value as its
`start`; on receiving the new tween the renderer kills the running tweener and
applies that `start` immediately, so the cube snaps **backwards** to where it
was a few frames ago before resuming.

A single correction is imperceptible -- that is why a click-driven tween, fired
seconds apart, looks perfect. But at `MOVE_THRESHOLD` = 0.1m a walking player
(~3-4 m/s, so ~0.05-0.07m per frame) crosses the threshold about every **two
frames**, so the cube takes roughly 30 backward corrections per second. That
reads as jitter.

Raising the threshold or lowering the speed only makes the stutter coarser: the
frequency of replacement is the problem, not the tuning. **A `Tween` in `Move`
mode describes a discrete A-to-B motion; it is not a per-frame follow
primitive.**

`setMoveContinuous` avoids this because it hands the renderer a *direction and
a speed* rather than a start point. Continuous modes take their start from the
renderer's own live transform, so replacing one mid-motion cannot snap the cube
back -- there is no scene-supplied `start` to disagree with the renderer.

The trade-off: a continuous tween has no destination, so it never stops on its
own. The per-frame `STOP_DISTANCE` check is what ends the chase, and because
that removal has to round-trip to the renderer the cube can drift slightly
closer than 1m before halting.

(The third option, moving the `Transform` directly in a system, sidesteps the
round trip entirely and is the usual answer for continuous motion. It is
deliberately not demonstrated here -- this scene is about what the `Tween`
component can do.)
