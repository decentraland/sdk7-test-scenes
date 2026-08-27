import { engine, Entity, MainCamera, PBVirtualCamera, TouchScreenControls, Transform, VirtualCamera } from "@dcl/sdk/ecs"
import { Quaternion, Vector3 } from "@dcl/sdk/math"

import { CONFIG } from "./config"
import { SM_PlayerRoster } from "./playerRoster"
import { SM_TouchscreenControls } from "./touchscreenControls"


export namespace SM_Camera {

	let r      : Entity | null          = null // root entity, used for yaw and position
	let e      : Entity | null          = null // camera entity, used for pitch and distance
	let v      : PBVirtualCamera | null = null

	let zoom   : number                 = 0.5
	let pitch  : number                 = CONFIG.CAMERA_PITCH_DEFAULT
	let yaw    : number                 = CONFIG.CAMERA_YAW_DEFAULT
	let yOffset: number                 = 0

	let targetEntity: Entity | null = null


	// MARK: getZoom
	/** Current zoom in the 0–1 range. */
	export function getZoom(): number { return zoom }


	// MARK: getPitch
	/** Current pitch in degrees. */
	export function getPitch(): number { return pitch }


	// MARK: getYaw
	/** Current yaw in degrees. */
	export function getYaw(): number { return yaw }


	// MARK: getYOffset
	/** Current vertical offset in meters. */
	export function getYOffset(): number { return yOffset }


	// MARK: getCameraEntity
	/**
	 * Returns the virtual camera entity, creating the root/camera pair if needed.
	 */
	export function getCameraEntity(): Entity {
		if (r && e && v) return e

		r = engine.addEntity()
		Transform.create(r, {
			position: CONFIG.CAMERA_PIVOT_POINT,
			rotation: Quaternion.fromEulerDegrees(0, CONFIG.CAMERA_YAW_DEFAULT, 0)
		})

		e = engine.addEntity()
		Transform.create(e, {
			parent  : r,
			rotation: Quaternion.fromEulerDegrees(CONFIG.CAMERA_PITCH_DEFAULT, 0, 0)
		})

		VirtualCamera.create(e, {})
		v = VirtualCamera.getMutableOrNull(e)
		if (!v) console.error("SM_Camera: getCameraEntity: virtual camera not found")

		return e
	}


	// MARK: activateCamera
	/**
	 * Activates the virtual camera and starts the follow/orbit update system.
	 */
	export function activateCamera() {
		const cam = getCameraEntity()

		zoom    = 0.5
		pitch   = CONFIG.CAMERA_PITCH_DEFAULT
		yaw     = CONFIG.CAMERA_YAW_DEFAULT
		yOffset = 0

		const tr = Transform.getMutableOrNull(r!)
		const te = Transform.getMutableOrNull(cam)
		if (!tr || !te) {
			console.error("SM_Camera: activateCamera: camera transform not found")
			return
		}
		tr.position = CONFIG.CAMERA_PIVOT_POINT
		tr.rotation = Quaternion.fromEulerDegrees(0, CONFIG.CAMERA_YAW_DEFAULT, 0)
		te.position = Vector3.Zero()
		te.rotation = Quaternion.fromEulerDegrees(CONFIG.CAMERA_PITCH_DEFAULT, 0, 0)

		if (!v) {
			console.error("SM_Camera: activateCamera: virtual camera not found")
			return
		}

		MainCamera.createOrReplace(engine.CameraEntity, {
			virtualCameraEntity: cam,
		})

		engine.addSystem(sys_UpdateCameraPosition)
	}


	// MARK: deactivateCamera
	/**
	 * Clears the virtual camera binding and removes camera entities.
	 */
	export function deactivateCamera() {
		if (!e && !r) return

		// Must clear MainCamera before deleting the VirtualCamera entity —
		// otherwise the engine keeps binding to a dead entity and the view
		// falls through to the player's feet.
		const mainCamera = MainCamera.getMutableOrNull(engine.CameraEntity)
		if (mainCamera) {
			mainCamera.virtualCameraEntity = undefined
		}

		if (e) engine.removeEntity(e)
		if (r) engine.removeEntity(r)
		e             = null
		r             = null
		v             = null
		targetEntity  = null
		yOffset       = 0

		engine.removeSystem(sys_UpdateCameraPosition)
	}


	// MARK: Yaw
	/**
	 * Rotates the camera yaw by amount scaled to degrees per second.
	 */
	export function Yaw(amount: number) {
		yaw += amount * CONFIG.CAMERA_YAW_SPEED_DEG_PER_SECOND
		yaw  = yaw % 360
	}


	// MARK: Zoom
	/**
	 * Zooms the follow camera by amount, clamped to 0–1.
	 */
	export function Zoom(amount: number) {
		zoom += amount * CONFIG.CAMERA_ZOOM_SPEED_PER_SECOND
		zoom  = Math.max(0, Math.min(1, zoom))
	}


	// MARK: Pitch
	/**
	 * Pitches the camera by amount, clamped to config min/max.
	 */
	export function Pitch(amount: number) {
		pitch += amount * CONFIG.CAMERA_PITCH_SPEED_DEG_PER_SECOND
		pitch  = Math.max(CONFIG.CAMERA_PITCH_MIN, Math.min(CONFIG.CAMERA_PITCH_MAX, pitch))
	}


	// MARK: Raise
	/**
	 * Raises the camera along Y while spectating.
	 */
	export function Raise(amount: number) {
		yOffset += amount * CONFIG.CAMERA_RAISE_SPEED
		yOffset  = Math.min(CONFIG.CAMERA_MAX_RAISE_OFFSET, yOffset)
	}


	// MARK: Lower
	/**
	 * Lowers the camera along Y while spectating.
	 */
	export function Lower(amount: number) {
		yOffset -= amount * CONFIG.CAMERA_LOWER_SPEED
		yOffset  = Math.max(-CONFIG.CAMERA_MAX_LOWER_OFFSET, yOffset)
	}


	// MARK: CycleTarget
	/**
	 * Cycles the follow target by indexDelta (can return to free-cam).
	 */
	export function CycleTarget(indexDelta: number) {
		SM_PlayerRoster.updatePlayerIndex(indexDelta)
		targetEntity = SM_PlayerRoster.getCurrentPlayerEntity()
		yOffset      = 1

		SM_TouchscreenControls.activate(targetEntity !== null)
	}


	// MARK: maxDistanceInBounds
	/** Furthest t along origin+t*dir that stays inside the scene AABB (origin assumed inside). */
	function maxDistanceInBounds(
		origin: Vector3,
		dir   : Vector3,
		bMin  : Vector3,
		bMax  : Vector3
	): number {
		let tMax = Number.POSITIVE_INFINITY

		const clampAxis = (
			o  : number,
			d  : number,
			min: number,
			max: number
		) => {
			if (Math.abs(d) < 1e-8) {
				if (o < min || o > max) tMax = 0
				return
			}
			if (d > 0) tMax = Math.min(tMax, (max - o) / d)
			else       tMax = Math.min(tMax, (min - o) / d)
		}

		clampAxis(origin.x, dir.x, bMin.x, bMax.x)
		clampAxis(origin.y, dir.y, bMin.y, bMax.y)
		clampAxis(origin.z, dir.z, bMin.z, bMax.z)

		return Math.max(0, tMax)
	}


	// MARK: sys_UpdateCameraPosition
	function sys_UpdateCameraPosition() {
		if (!r || !e) return
		const tr = Transform.getMutableOrNull(r)
		const te = Transform.getMutableOrNull(e)
		if (!tr || !te) return

		let targetPosition = CONFIG.CAMERA_PIVOT_POINT
		if (targetEntity) {
			targetPosition = Transform.getOrNull(targetEntity)?.position ?? CONFIG.CAMERA_PIVOT_POINT
			targetPosition = Vector3.add(targetPosition, Vector3.create(0, yOffset, 0))
		}
		tr.position = Vector3.lerp(tr.position, targetPosition, 0.1)

		const targetRotation = Quaternion.fromEulerDegrees(0, yaw, 0)
		tr.rotation = Quaternion.slerp(tr.rotation, targetRotation, 0.1)

		te.rotation = Quaternion.slerp(te.rotation, Quaternion.fromEulerDegrees(pitch, 0, 0), 0.1)

		if (!targetEntity) {
			te.position = Vector3.lerp(te.position, Vector3.create(0, yOffset, 0), 0.1)
		} else {
			const pitchRad = pitch * (Math.PI / 180)
			const dirLocal = Vector3.create(0, Math.sin(pitchRad), -Math.cos(pitchRad))

			let d = (CONFIG.CAMERA_MAX_PLAYER_DISTANCE - CONFIG.CAMERA_MIN_PLAYER_DISTANCE) * zoom + CONFIG.CAMERA_MIN_PLAYER_DISTANCE

			const m    = CONFIG.CAMERA_BOUNDS_MARGIN
			const bMin = Vector3.add(CONFIG.CAMERA_SCENE_BOUNDS_MIN, Vector3.create(m, m, m))
			const bMax = Vector3.subtract(CONFIG.CAMERA_SCENE_BOUNDS_MAX, Vector3.create(m, m, m))
			const dirWorld = Vector3.rotate(dirLocal, tr.rotation)
			const maxD = maxDistanceInBounds(tr.position, dirWorld, bMin, bMax)
			d = Math.min(d, maxD)

			te.position = Vector3.lerp(te.position, Vector3.scale(dirLocal, d), 0.1)

			const curLen = Vector3.length(te.position)
			if (curLen > maxD && curLen > 1e-6) {
				te.position = Vector3.scale(te.position, maxD / curLen)
			}
		}
	}

}
