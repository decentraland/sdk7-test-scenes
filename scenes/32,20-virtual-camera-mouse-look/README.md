This scene showcases virtual camera control driven by mouse pointer delta while the pointer is locked.

It relies on `PrimaryPointerInfo.screenDelta`, which keeps reporting raw mouse delta even while the cursor
is locked (a renderer-side fix, shipped separately from this test scene). While the pointer is locked,
`screenCoordinates` reports the screen center and `worldRayDirection` reports the center ray.

Click the green box to activate the virtual camera and disable player input. Lock the pointer (click inside
the scene or use the HUD button) to start steering the camera with mouse movement: moving the mouse rotates
the camera's yaw/pitch. A ring of colored boxes and N/E/S/W text markers around the camera make the rotation
easy to follow.

Pressing F or right-clicking (IA_SECONDARY) while the camera is active exits mouse-look mode, restores
player input, and returns control to the default camera.

The HUD panel shows live pointer-lock status, the current screenDelta, and the accumulated yaw/pitch.
