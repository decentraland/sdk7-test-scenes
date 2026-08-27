import { engine, InputModifier } from "@dcl/sdk/ecs"

// MARK: onEnterSpectateMode
/**
 * Called after spectate camera, inputs, and touchscreen controls are active.
 *
 * Intended extension point for follow-on scene logic (emit to other systems, analytics, extra UI).
 * Default behaviour disables avatar movement via InputModifier.
 */
export function onEnterSpectateMode() {
	console.log('onEnterSpectateMode')

	InputModifier.createOrReplace(engine.PlayerEntity, {
		mode: {
			$case: 'standard',
			standard: {
				disableAll: true,
			},
		},
	})
}


// MARK: onExitSpectateMode
/**
 * Called after spectate camera, inputs, and touchscreen controls are torn down.
 *
 * Intended extension point for follow-on scene logic.
 *
 * `SM_TouchscreenControls.deactivate()` has already reset `TouchScreenControls` on
 * `engine.RootEntity` to engine defaults (empty `touchInputs`). If this scene defines
 * its own custom touchscreen layout, re-apply it here or those controls will stay at defaults.
 */
export function onExitSpectateMode() {
	console.log('onExitSpectateMode')

	InputModifier.createOrReplace(engine.PlayerEntity, {
		mode: {
			$case: 'standard',
			standard: {
				disableAll: false,
			},
		},
	})
}
