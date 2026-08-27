import { Vector3 } from "@dcl/sdk/math";

export const CONFIG = {
	DEBUG_LOGGING                    : false,

	// Model settings
	CREATOR_HUB_MODEL_TAG            : "SpectateModeTrigger",      // The "Tag" used in Creator Hub to identify the model that will trigger the spectate mode
	MAX_INTERACTION_DISTANCE         : 8,                          // Maximum distance the player can be from the model to interact with it
	INTERACTION_HOVER_TEXT           : "Interact",                 // The text that will be shown when the player is hovering over the model

	// Camera settings
	CAMERA_PIVOT_POINT               : Vector3.create(32, 8, 32),  // Center of your scene, high enough to have a good view
	CAMERA_BOUNDS_MARGIN             : 0.5,                        // Keep the camera this far inside the AABB
	CAMERA_SCENE_BOUNDS_MIN          : Vector3.create(0, 0, 0),    // VirtualCamera entities are disabled by the engine outside parcel bounds.
	CAMERA_SCENE_BOUNDS_MAX          : Vector3.create(64, 80, 64), // Match these to your scene.json parcels (this demo is 4x4 = 64x64, height ~log2(n+1)*20).

	CAMERA_PITCH_SPEED_DEG_PER_SECOND: 60,                         // Degrees per second the camera will pitch when the user is spectating
	CAMERA_PITCH_DEFAULT             : 45,                         // Default pitch of the camera
	CAMERA_PITCH_MIN                 : -25,                        // Minimum pitch of the camera
	CAMERA_PITCH_MAX                 : 80,                         // Maximum pitch of the camera

	CAMERA_YAW_DEFAULT               : 0,                          // Default yaw of the camera
	CAMERA_YAW_SPEED_DEG_PER_SECOND  : 90,                         // Degrees per second the camera will rotate when the user is spectating

	CAMERA_RAISE_SPEED               : 5,                          // Degrees per second the camera will raise when the user is spectating
	CAMERA_MAX_RAISE_OFFSET          : 5,

	CAMERA_LOWER_SPEED               : 5,                          // Degrees per second the camera will lower when the user is spectating
	CAMERA_MAX_LOWER_OFFSET          : 5,
	CAMERA_MAX_PLAYER_DISTANCE       : 32,                         // Maximum distance the camera can be from the player when following them
	CAMERA_MIN_PLAYER_DISTANCE       : 1,                          // Minimum distance the camera can be from the player when following them

	CAMERA_ZOOM_SPEED_PER_SECOND     : 0.5,                        // Speed per second the camera will zoom when the user is spectating

}
