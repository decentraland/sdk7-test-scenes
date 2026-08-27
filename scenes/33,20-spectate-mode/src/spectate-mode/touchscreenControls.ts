import { engine, InputAction, TouchScreenControls } from '@dcl/sdk/ecs'


export namespace SM_TouchscreenControls {

	// MARK: activate
	/**
	 * Installs spectate-mode touchscreen buttons (next/prev, zoom or raise/lower).
	 */
	export function activate(hasTarget?: boolean) {
		TouchScreenControls.createOrReplace(engine.RootEntity, {
			hideJoystick : false,
			hideCrosshair: false,
			touchInputs  : [
				{ inputAction: InputAction.IA_ACTION_3, hide: false,
					icon: { tex: { $case: 'texture', texture: { 
						src: 'assets/images/spectate-mode/icon-next.png'
					} } }, },
				{ inputAction: InputAction.IA_ACTION_4, hide: false,
					icon: { tex: { $case: 'texture', texture: { 
						src: 'assets/images/spectate-mode/icon-previous.png'
					} } }, },
				{ inputAction: InputAction.IA_ACTION_5, hide: true  },
				{ inputAction: InputAction.IA_ACTION_6, hide: true  },
				{ inputAction: InputAction.IA_POINTER,  hide: true  },
				{ 
					inputAction: InputAction.IA_PRIMARY,
					hide: false,
					icon: { tex: { $case: 'texture', texture: { 
						src: hasTarget ? 'assets/images/spectate-mode/icon-zoomIn.png' : 'assets/images/spectate-mode/icon-down.png'
					} } },
				},
				{ 
					inputAction: InputAction.IA_SECONDARY,
					hide: false,
					icon: { tex: { $case: 'texture', texture: { 
						src: hasTarget ? 'assets/images/spectate-mode/icon-zoomOut.png' : 'assets/images/spectate-mode/icon-up.png' 
					} } },
				},
			],
		})
	}


	// MARK: deactivate
	/**
	 * Resets TouchScreenControls on the root entity to engine defaults (empty `touchInputs`).
	 *
	 * Host scenes with a custom touchscreen layout must re-apply it from `onExitSpectateMode`.
	 * This runs before that hook and will otherwise leave the default controls in place.
	 */
	export function deactivate() {
		TouchScreenControls.createOrReplace(engine.RootEntity, {
			hideJoystick : false,
			hideCrosshair: false,
			touchInputs  : [],
		})
	}
}
