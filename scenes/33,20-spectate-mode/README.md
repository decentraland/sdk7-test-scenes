# Spectate Mode

This scene showcases a spectate / free-cam mode: the player toggles from avatar movement into a free-roaming
or player-following virtual camera. It is the reference implementation for the **spectate-mode** pattern
(a simplified rewrite of [stom66/dcl-spectate-mode](https://github.com/stom66/dcl-spectate-mode)).

Click the green box (or the HUD button) to enter spectate mode. This activates a **two-entity camera rig** —
a root entity owning world position + yaw, with a child entity owning pitch + orbit offset and the
`VirtualCamera` — and freezes the avatar with `InputModifier` (`disableAll: true`) so the movement keys drive
the camera instead:

- **W/S** pitch, **A/D** yaw
- **Mouse** rotates the camera while the pointer is locked (via `PrimaryPointerInfo.screenDelta`, the same
  pattern as the `32,20-virtual-camera-mouse-look` scene) — lock with the HUD button, unlock with Esc
- **E/F** zoom in/out while following a player, or raise/lower the camera in free-cam
- **1/2** cycle through the players in the scene (tracked with `onEnterScene`/`onLeaveScene`); cycling past
  the last player returns to free-cam

The engine disables `VirtualCamera` entities that leave the scene's parcel bounds, so while following a
player the orbit distance is clamped every frame to stay inside the scene AABB (`maxDistanceInBounds` in
`src/spectate.ts`).

Toggling off clears `MainCamera.virtualCameraEntity` **before** removing the rig entities (removing first
leaves the engine bound to a dead entity and the view falls to the player's feet), then restores avatar input.

A status panel (top right) shows whether spectate mode is active, the pointer-lock state, and the number of
players in the scene. While spectating, a bottom HUD shows the key bindings and the current follow target's
display name (resolved with `getPlayer()`).
