extends SceneTree

const CrowdComparison = preload("res://crowd.gd")
const WARMUP_QUERIES := 100
const MEASURED_QUERIES := 500
const SNAP_EXTENTS := Vector3(0.55, 0.35, 0.55)
const ENDPOINT_EPSILON := 0.001
const MAX_SYNC_FRAMES := 120


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2:
		_fail("Usage: --script compare.gd -- <fixture.json> <report.json>")
		return

	var input := FileAccess.open(args[0], FileAccess.READ)
	if input == null:
		_fail("Cannot read fixture: " + args[0])
		return
	var fixture = JSON.parse_string(input.get_as_text())
	input.close()
	if not fixture is Dictionary or not fixture.has_all([
		"cellSize", "cellHeight", "open", "closed", "scenarios"
	]):
		_fail("Expected cellSize, cellHeight, open/closed meshes and scenarios")
		return

	var open_map := _load_map(fixture.open, fixture.cellSize, fixture.cellHeight)
	var closed_map := _load_map(fixture.closed, fixture.cellSize, fixture.cellHeight)
	for frame in range(MAX_SYNC_FRAMES):
		if _is_ready(open_map) and _is_ready(closed_map):
			break
		await physics_frame
	if not _is_ready(open_map) or not _is_ready(closed_map):
		_free_map(open_map)
		_free_map(closed_map)
		_fail("Godot navigation maps did not synchronize")
		return

	var observations: Array[Dictionary] = []
	for scenario in fixture.scenarios:
		var map: RID = open_map[0] if scenario.doorOpen else closed_map[0]
		observations.append(_measure(map, scenario))
	var report := {
		"backend": "godot",
		"runtime": "Godot " + str(Engine.get_version_info().string) + " headless",
		"scenarios": observations,
	}
	if fixture.has("crowd"):
		var crowd: Dictionary = await CrowdComparison.new().run(self, open_map[0], fixture.crowd)
		if crowd.is_empty():
			_free_map(open_map)
			_free_map(closed_map)
			_fail("Godot avoidance did not deliver velocities to every agent")
			return
		report["crowd"] = crowd
	_free_map(open_map)
	_free_map(closed_map)

	var output := FileAccess.open(args[1], FileAccess.WRITE)
	if output == null:
		_fail("Cannot write report: " + args[1])
		return
	output.store_string(JSON.stringify(report, "  ") + "\n")
	output.close()
	quit()


func _load_map(data: Dictionary, cell_size: float, cell_height: float) -> Array[RID]:
	var map := NavigationServer3D.map_create()
	NavigationServer3D.map_set_cell_size(map, cell_size)
	NavigationServer3D.map_set_cell_height(map, cell_height)
	NavigationServer3D.map_set_use_async_iterations(map, false)
	# Connect only the shared edges in the fixture. There are no extra joins across gaps.
	NavigationServer3D.map_set_use_edge_connections(map, false)
	NavigationServer3D.map_set_active(map, true)

	var mesh := NavigationMesh.new()
	mesh.cell_size = cell_size
	mesh.cell_height = cell_height
	var vertices := PackedVector3Array()
	for coords in data.vertices:
		vertices.append(_to_vector(coords))
	mesh.set_vertices(vertices)
	for indices in data.polygons:
		# Godot uses clockwise winding, corresponding to the inverse of the fixture.
		var polygon := PackedInt32Array(indices)
		polygon.reverse()
		mesh.add_polygon(polygon)
	var region := NavigationServer3D.region_create()
	NavigationServer3D.region_set_navigation_mesh(region, mesh)
	NavigationServer3D.region_set_map(region, map)
	return [map, region]


func _is_ready(handle: Array[RID]) -> bool:
	return (
		NavigationServer3D.map_get_iteration_id(handle[0]) > 0
		and NavigationServer3D.region_get_iteration_id(handle[1]) > 0
	)


func _free_map(handle: Array[RID]) -> void:
	NavigationServer3D.free_rid(handle[1])
	NavigationServer3D.free_rid(handle[0])


func _to_vector(coords: Array) -> Vector3:
	return Vector3(coords[0], coords[1], coords[2])


func _within_snap(point: Vector3, request: Vector3) -> bool:
	var delta := (point - request).abs()
	return delta.x <= SNAP_EXTENTS.x and delta.y <= SNAP_EXTENTS.y and delta.z <= SNAP_EXTENTS.z


func _route(
	map: RID,
	query: NavigationPathQueryParameters3D,
	result: NavigationPathQueryResult3D,
) -> PackedVector3Array:
	var start := NavigationServer3D.map_get_closest_point(map, query.start_position)
	var goal := NavigationServer3D.map_get_closest_point(map, query.target_position)
	if not _within_snap(start, query.start_position) or not _within_snap(goal, query.target_position):
		return PackedVector3Array()

	NavigationServer3D.query_path(query, result)
	var points := result.get_path()
	# Godot can return a partial path. Match the snapped goal before reporting completion.
	if points.is_empty() or points[-1].distance_to(goal) > ENDPOINT_EPSILON:
		return PackedVector3Array()
	return points


func _measure(map: RID, scenario: Dictionary) -> Dictionary:
	var params := NavigationPathQueryParameters3D.new()
	params.map = map
	params.start_position = _to_vector(scenario.start)
	params.target_position = _to_vector(scenario.goal)
	params.metadata_flags = 0
	params.path_postprocessing = NavigationPathQueryParameters3D.PATH_POSTPROCESSING_CORRIDORFUNNEL
	var result := NavigationPathQueryResult3D.new()
	for i in range(WARMUP_QUERIES):
		_route(map, params, result)
	var timings := PackedInt64Array()
	timings.resize(MEASURED_QUERIES)
	for i in range(MEASURED_QUERIES):
		var before := Time.get_ticks_usec()
		_route(map, params, result)
		timings[i] = Time.get_ticks_usec() - before
	timings.sort()

	var route := _route(map, params, result)
	var points: Array[Array] = []
	for point in route:
		points.append([point.x, point.y, point.z])
	var p95_index := ceili(MEASURED_QUERIES * 0.95) - 1
	return {
		"id": scenario.id,
		"status": "unreachable" if points.is_empty() else "complete",
		"points": points,
		"p95Ms": timings[p95_index] / 1000.0,
	}


func _fail(message: String) -> void:
	printerr(message)
	quit(1)
