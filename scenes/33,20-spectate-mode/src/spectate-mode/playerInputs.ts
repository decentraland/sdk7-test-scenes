import { engine, InputAction, inputSystem, PointerEventType } from "@dcl/sdk/ecs"

import { SM_Camera } from "./camera"
import { SM_PlayerRoster } from "./playerRoster"
import { isMobile } from "@dcl/sdk/platform"


export namespace SM_PlayerInputs {

	// MARK: activate
	/**
	 * Starts watching spectate camera inputs.
	 */
	export function activate() {
		engine.addSystem(sys_WatchPlayerInput)
	}


	// MARK: deactivate
	/**
	 * Stops watching spectate camera inputs.
	 */
	export function deactivate() {
		engine.removeSystem(sys_WatchPlayerInput)
	}


	// MARK: sys_WatchPlayerInput
	function sys_WatchPlayerInput(dt: number) {
		const hasTarget = SM_PlayerRoster.getCurrentPlayerUserId()
		if (inputSystem.isPressed(InputAction.IA_FORWARD)) {
			  hasTarget ? SM_Camera.Pitch(dt)  : SM_Camera.Pitch(-dt)
		}
		if (inputSystem.isPressed(InputAction.IA_BACKWARD)) {
			 hasTarget ? SM_Camera.Pitch(-dt) : SM_Camera.Pitch(dt)
		}

		if (inputSystem.isPressed(InputAction.IA_LEFT)) {
			  hasTarget ? SM_Camera.Yaw(dt)  : SM_Camera.Yaw(-dt)
		}
		if (inputSystem.isPressed(InputAction.IA_RIGHT)) {
			 hasTarget ? SM_Camera.Yaw(-dt) : SM_Camera.Yaw(dt)
		}

		if (inputSystem.isPressed(InputAction.IA_PRIMARY)) {
			hasTarget ? SM_Camera.Zoom(-dt) : isMobile() ? SM_Camera.Lower(dt) : SM_Camera.Raise(dt)
		}
		if (inputSystem.isPressed(InputAction.IA_SECONDARY)) {
			hasTarget ? SM_Camera.Zoom(dt) : isMobile() ? SM_Camera.Raise(dt) : SM_Camera.Lower(dt)
		}

		if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) SM_Camera.CycleTarget(1)
		if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) SM_Camera.CycleTarget(-1)
	}

}
