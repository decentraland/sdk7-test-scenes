import { engine, Entity, InputAction, InputModifier, pointerEventsSystem, Transform } from "@dcl/sdk/ecs";
import { CONFIG } from "./config";
import { setupSpectateModeUI } from "./ui";
import { SM_Camera } from "./camera";
import { SM_PlayerInputs } from "./playerInputs";
import { onEnterSpectateMode, onExitSpectateMode } from "./events";
import { SM_TouchscreenControls } from "./touchscreenControls";

export namespace SpectateMode {
	
	// MARK: Vars
	let enabled      : boolean       = false
	//let cameraEntity : Entity | null = SpectateModeCamera.getCameraEntity()
	let trackedEntity: Entity | null = null
	

	// MARK: Init
	export function init() {
		if (CONFIG.DEBUG_LOGGING) { console.log('Spectate:Mode init') }
		
		// Add UI/Entity toggles
		setupSpectateModeUI()
		setupTaggedEntitiesPointerSystems()
	}
	

	// MARK: isEnabled
	export function isEnabled() { return enabled }


	// MARK: toggleSpectateMode
	export function toggleSpectateMode() {
		if (enabled) {
			//if (CONFIG.DEBUG_LOGGING) console.log('SpectateMode: toggleSpectateMode: enabling')
			disableSpectateMode()
		} else {
			//if (CONFIG.DEBUG_LOGGING) console.log('SpectateMode: toggleSpectateMode: disabling')
			enableSpectateMode()
		}
	}


	// MARK: setupPointer Systems
	function setupTaggedEntitiesPointerSystems() {
		const entities = engine.getEntitiesByTag(CONFIG.CREATOR_HUB_MODEL_TAG)
		
		for (const entity of entities) {
			pointerEventsSystem.onPointerDown({
				entity: entity,
				opts: { 
					button     : InputAction.IA_POINTER, 
					hoverText  : CONFIG.INTERACTION_HOVER_TEXT, 
					maxDistance: CONFIG.MAX_INTERACTION_DISTANCE
				}
			}, () => {
				if (CONFIG.DEBUG_LOGGING) console.log('SpectateMode: pointerEventsSystem: clicked')
				toggleSpectateMode()
			})
		}
	}


	// MARK: Enable SM
	function enableSpectateMode() {
		if (enabled) return

		if (CONFIG.DEBUG_LOGGING) console.log('SpectateMode: enableSpectateMode')
		enabled = true

		SM_Camera.activateCamera()
		SM_PlayerInputs.activate()
		SM_TouchscreenControls.activate()

		onEnterSpectateMode()
	}


	// MARK: Disable SM
	function disableSpectateMode() {
		if (!enabled) return

		if (CONFIG.DEBUG_LOGGING) console.log('SpectateMode: disableSpectateMode')
		enabled = false

		SM_Camera.deactivateCamera()
		SM_PlayerInputs.deactivate()
		SM_TouchscreenControls.deactivate()

		onExitSpectateMode()
	}

}
