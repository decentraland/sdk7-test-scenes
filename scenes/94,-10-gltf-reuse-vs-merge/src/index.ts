import {
	AssetLoad,
	assetLoadLoadingStateSystem,
	Billboard,
	BillboardMode,
	ColliderLayer,
	Entity,
	GltfContainer,
	InputAction,
	LoadingState,
	Material,
	MeshCollider,
	MeshRenderer,
	TextAlignMode,
	TextShape,
	Transform,
	engine,
	pointerEventsSystem,
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
	BAKED_ROW_OFFSET,
	BAKED_ROW_ROTATION_Y,
	BURST_COPIES,
	COLORS,
	COPIES,
	LAMPOST_SRC,
	MERGED_SRC,
	PACKED_SRC,
	PEDESTAL_Z,
	UTILITY_Z,
	burstSlotPosition,
	dupeSrc,
	slotPosition,
	stripOriginX,
} from './config'

type Station = {
	key: string
	title: string
	subtitle: string
	color: Color4
	/** What the reader should end up counting once this station is ON. */
	expectation: string
	spawn: (index: number) => Entity[]
}

const STATIONS: Station[] = [
	{
		key: 'baseline',
		title: 'A. BASELINE x1',
		subtitle: '1 entity, LampostSmall.glb',
		color: COLORS.baseline,
		expectation: 'the per-post cost of everything: 1 x (renderers, materials, meshes, textures)',
		spawn: (index) => [spawnLampost(slotPosition(index, 0), LAMPOST_SRC)],
	},
	{
		key: 'shared',
		title: 'B. SHARED x14',
		subtitle: '14 entities -> 1 .glb',
		color: COLORS.shared,
		expectation: '1x geometries + 1x textures vs BASELINE, but 14x renderers and 14x materials',
		spawn: (index) => range(COPIES).map((i) => spawnLampost(slotPosition(index, i), LAMPOST_SRC)),
	},
	{
		key: 'dupes',
		title: 'C. DUPES x14',
		subtitle: '14 entities -> 14 .glb files',
		color: COLORS.dupes,
		expectation: '14x downloads, 14x geometries and 14x textures vs SHARED — same renderers',
		spawn: (index) => range(COPIES).map((i) => spawnLampost(slotPosition(index, i), dupeSrc(i))),
	},
	{
		key: 'packed',
		title: 'D. PACKED x1',
		subtitle: '1 entity -> .glb with 14 objects',
		color: COLORS.packed,
		expectation: 'same renderers and draw calls as SHARED, in a single indivisible instantiate',
		spawn: (index) => [spawnBakedRow(index, PACKED_SRC)],
	},
	{
		key: 'merged',
		title: 'E. MERGED x1',
		subtitle: '1 entity -> .glb, meshes joined',
		color: COLORS.merged,
		expectation: 'the only station where draw calls drop: 1 renderer x its material slots',
		spawn: (index) => [spawnBakedRow(index, MERGED_SRC)],
	},
	{
		key: 'burst',
		title: 'F. BURST x50',
		subtitle: '50 entities -> 1 .glb, in one frame',
		color: COLORS.burst,
		expectation: 'copies appearing over several frames — asset creation is frame-budgeted',
		spawn: (index) => range(BURST_COPIES).map((i) => spawnLampost(burstSlotPosition(index, i), LAMPOST_SRC)),
	},
]

const spawnedByKey = new Map<string, Entity[]>()
const labelByKey = new Map<string, Entity>()

/** Station pedestals + labels that HIDE MARKERS removes. The three utility buttons stay. */
let markerEntities: Entity[] = []
let markersVisible = true

let preloadEntity: Entity | null = null

export function main() {
	buildMarkers()
	buildUtilityButtons()
	log('ready — click a pedestal to toggle its station. All stations start OFF.')
}

// ---------------------------------------------------------------- stations

function toggleStation(station: Station, index: number) {
	const spawned = spawnedByKey.get(station.key)

	if (spawned) {
		for (const entity of spawned) engine.removeEntity(entity)
		spawnedByKey.delete(station.key)
		log(`${station.title} OFF — removed ${spawned.length} entities`)
	} else {
		const entities = station.spawn(index)
		spawnedByKey.set(station.key, entities)
		log(`${station.title} ON — ${entities.length} entities. Expect: ${station.expectation}`)
	}

	refreshLabel(station)
}

function spawnLampost(position: Vector3, src: string): Entity {
	const entity = engine.addEntity()
	Transform.create(entity, { position })
	GltfContainer.create(entity, {
		src,
		// No colliders anywhere in this scene: they add bodies and GameObjects
		// that would show up in the numbers being compared.
		visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
		invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
	})
	return entity
}

function spawnBakedRow(stationIndex: number, src: string): Entity {
	const entity = engine.addEntity()
	Transform.create(entity, {
		position: Vector3.create(
			stripOriginX(stationIndex) + BAKED_ROW_OFFSET.x,
			BAKED_ROW_OFFSET.y,
			BAKED_ROW_OFFSET.z,
		),
		rotation: Quaternion.fromEulerDegrees(0, BAKED_ROW_ROTATION_Y, 0),
	})
	GltfContainer.create(entity, {
		src,
		visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
		invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
	})
	return entity
}

// ---------------------------------------------------------------- markers

function buildMarkers() {
	markerEntities = []

	STATIONS.forEach((station, index) => {
		const position = Vector3.create(stripOriginX(index) + 2.5, 0.6, PEDESTAL_Z)
		const { pedestal, label } = createButton(position, station.color, () => toggleStation(station, index))

		labelByKey.set(station.key, label)
		markerEntities.push(pedestal, label)
		refreshLabel(station)
	})
}

function destroyMarkers() {
	for (const entity of markerEntities) engine.removeEntity(entity)
	markerEntities = []
	labelByKey.clear()
}

function toggleMarkers(markersLabel: Entity) {
	markersVisible = !markersVisible

	if (markersVisible) buildMarkers()
	else destroyMarkers()

	TextShape.getMutable(markersLabel).text = markersVisible ? 'HIDE MARKERS' : 'SHOW MARKERS'
	log(`markers ${markersVisible ? 'shown' : 'hidden'} — station pedestals and labels are ${markersVisible ? 'in' : 'out of'} the counts`)
}

function refreshLabel(station: Station) {
	const label = labelByKey.get(station.key)
	if (!label) return

	const on = spawnedByKey.has(station.key)
	TextShape.getMutable(label).text = `${station.title}\n${station.subtitle}\n${on ? '[ ON ]' : '[ off ]'}`
}

// --------------------------------------------------------------- utilities

function buildUtilityButtons() {
	const clear = createButton(Vector3.create(12, 0.6, UTILITY_Z), COLORS.utility, () => clearAll())
	TextShape.getMutable(clear.label).text = 'CLEAR ALL'

	const markers = createButton(Vector3.create(16, 0.6, UTILITY_Z), COLORS.utility, () => toggleMarkers(markers.label))
	TextShape.getMutable(markers.label).text = 'HIDE MARKERS'

	const preload = createButton(Vector3.create(20, 0.6, UTILITY_Z), COLORS.utility, () => preloadLampost())
	TextShape.getMutable(preload.label).text = 'PRELOAD\nLampostSmall.glb'
}

function clearAll() {
	for (const [key, entities] of spawnedByKey) {
		for (const entity of entities) engine.removeEntity(entity)
		spawnedByKey.delete(key)
	}

	for (const station of STATIONS) refreshLabel(station)
	log('all stations cleared')
}

/**
 * Warms the shared source so a later BURST spawns clones of a resident
 * template instead of 50 cache misses. Only meaningful as the first thing you
 * do after a scene reload — see the README.
 */
function preloadLampost() {
	if (preloadEntity) {
		log('preload already requested this session')
		return
	}

	preloadEntity = engine.addEntity()
	AssetLoad.create(preloadEntity, { assets: [LAMPOST_SRC] })
	assetLoadLoadingStateSystem.registerAssetLoadLoadingStateEntity(preloadEntity, (state) => {
		log(`preload ${state.asset} -> ${loadingStateName(state.currentState)}`)
	})
	log(`preload requested for ${LAMPOST_SRC}`)
}

// ------------------------------------------------------------------ pieces

function createButton(
	position: Vector3,
	color: Color4,
	onClick: () => void,
): { pedestal: Entity; label: Entity } {
	const pedestal = engine.addEntity()
	Transform.create(pedestal, { position, scale: Vector3.create(1.2, 1.2, 1.2) })
	MeshRenderer.setBox(pedestal)
	MeshCollider.setBox(pedestal, ColliderLayer.CL_POINTER)
	Material.setPbrMaterial(pedestal, { albedoColor: color })

	const label = engine.addEntity()
	Transform.create(label, { position: Vector3.create(position.x, position.y + 1.6, position.z) })
	TextShape.create(label, {
		text: '',
		fontSize: 3,
		textColor: Color4.White(),
		outlineColor: Color4.Black(),
		outlineWidth: 0.15,
		textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
	})
	Billboard.create(label, { billboardMode: BillboardMode.BM_Y })

	pointerEventsSystem.onPointerDown(
		{ entity: pedestal, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle', maxDistance: 12 } },
		onClick,
	)

	return { pedestal, label }
}

/** `LoadingState` is a const enum, so it has no runtime reverse mapping. */
function loadingStateName(state: LoadingState): string {
	switch (state) {
		case LoadingState.UNKNOWN:
			return 'UNKNOWN'
		case LoadingState.LOADING:
			return 'LOADING'
		case LoadingState.NOT_FOUND:
			return 'NOT_FOUND'
		case LoadingState.FINISHED_WITH_ERROR:
			return 'FINISHED_WITH_ERROR'
		case LoadingState.FINISHED:
			return 'FINISHED'
	}
}

function range(count: number): number[] {
	const out: number[] = []
	for (let i = 0; i < count; i++) out.push(i)
	return out
}

function log(message: string) {
	console.log(`[gltf-reuse-vs-merge] ${message}`)
}
