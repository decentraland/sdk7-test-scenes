This example scene makes usage of several `VirtualCamera` components and `MainCamera` to change the active virtual camera in the scene.

### SCENE TESTING
There are 4 entities with `VirtualCamera` up in the sky, they have a text shape marking the order in which they are used.

A system is listening to the Primary input key press ("E") to pass through those 4 cameras activating one after the other. So press 'E' and the cameras will be changing sequentially, after all the cameras have been toggled, the default character camera returns.

* Camera 1: A statically positioned top-down camera -> 89 degrees was used instead of 90 since the input controls are based on the camera forward/direction so if a perfect 80 degrees rotation is used, the input won't work as expected. 
* Camera 2: Another statically positioned camera.
* Camera 3: A static positioned camera that makes use of the `lookAt` property referencing the `engine.PlayerEntity` to always look at the player.
* Camera 4: A camera whose entity transform is tweened using a tween sequence. It uses the `lookAt` property referencing an invisible entity positioned at the center of the scene close to the ground.