extends RefCounted

class Agent:
	var handle: RID
	var position: Vector3
	var goal: Vector3
	var requested_goal: Vector3
	var reached := false
	var safe_velocity := Vector3.ZERO
	var callbacks := 0

	func receive_velocity(value: Vector3) -> void:
		safe_velocity = value
		callbacks += 1


func run(tree: SceneTree, map: RID, fixture: Dictionary) -> Dictionary:
	var dt: float = fixture.stepSeconds
	var radius: float = fixture.radius
	var max_speed: float = fixture.maxSpeed
	var max_velocity_change: float = fixture.maxAcceleration * dt
	var arrival_radius: float = fixture.arrivalRadius
	var prior_tick_rate := Engine.physics_ticks_per_second
	Engine.physics_ticks_per_second = roundi(1.0 / dt)
	var agents: Array[Agent] = []
	for setup in fixture.agents:
		var agent := _create_agent(map, setup, fixture)
		agents.append(agent)

	var minimum_distance := INF
	var overlap_steps := 0
	for step in range(int(fixture.steps)):
		var prior_callback := agents[0].callbacks
		for agent in agents:
			var remaining := agent.goal - agent.position
			remaining.y = 0.0
			var desired := remaining.limit_length(max_speed * dt) / dt
			if remaining.length() < arrival_radius * 0.5:
				desired = Vector3.ZERO
			var preferred := agent.safe_velocity.move_toward(desired, max_velocity_change)
			NavigationServer3D.agent_set_position(agent.handle, agent.position)
			NavigationServer3D.agent_set_velocity(agent.handle, preferred)
		# Each agent receives a velocity from Godot's own 2D RVO solver, then the
		# benchmark integrates it once at the fixture timestep.
		await tree.physics_frame
		if agents[0].callbacks == prior_callback:
			await tree.physics_frame
		for agent in agents:
			if agent.callbacks <= prior_callback:
				_free_agents(agents)
				Engine.physics_ticks_per_second = prior_tick_rate
				return {}
			agent.position = NavigationServer3D.map_get_closest_point(
				map, agent.position + agent.safe_velocity * dt
			)
			if agent.position.distance_to(agent.requested_goal) <= arrival_radius:
				agent.reached = true
		var closest_this_step := _min_horizontal_distance(agents)
		minimum_distance = minf(minimum_distance, closest_this_step)
		if closest_this_step < 2.0 * radius - 0.02:
			overlap_steps += 1

	var arrived := 0
	for agent in agents:
		if agent.reached:
			arrived += 1
	_free_agents(agents)
	Engine.physics_ticks_per_second = prior_tick_rate
	return {
		"total": agents.size(),
		"arrived": arrived,
		"minCenterDistance": minimum_distance,
		"overlapSteps": overlap_steps,
	}


func _create_agent(map: RID, setup: Dictionary, fixture: Dictionary) -> Agent:
	var agent := Agent.new()
	agent.position = NavigationServer3D.map_get_closest_point(map, _to_vector(setup.start))
	agent.requested_goal = _to_vector(setup.goal)
	agent.goal = NavigationServer3D.map_get_closest_point(map, agent.requested_goal)
	agent.handle = NavigationServer3D.agent_create()
	NavigationServer3D.agent_set_map(agent.handle, map)
	NavigationServer3D.agent_set_position(agent.handle, agent.position)
	NavigationServer3D.agent_set_radius(agent.handle, fixture.radius)
	NavigationServer3D.agent_set_height(agent.handle, fixture.height)
	NavigationServer3D.agent_set_max_speed(agent.handle, fixture.maxSpeed)
	NavigationServer3D.agent_set_neighbor_distance(agent.handle, 2.5)
	NavigationServer3D.agent_set_max_neighbors(agent.handle, 8)
	NavigationServer3D.agent_set_time_horizon_agents(agent.handle, 1.0)
	NavigationServer3D.agent_set_use_3d_avoidance(agent.handle, false)
	NavigationServer3D.agent_set_avoidance_enabled(agent.handle, true)
	NavigationServer3D.agent_set_avoidance_callback(agent.handle, agent.receive_velocity)
	return agent


func _free_agents(agents: Array[Agent]) -> void:
	for agent in agents:
		NavigationServer3D.free_rid(agent.handle)


func _min_horizontal_distance(agents: Array[Agent]) -> float:
	var closest := INF
	for i in range(agents.size()):
		for j in range(i):
			var delta: Vector3 = agents[i].position - agents[j].position
			closest = minf(closest, Vector2(delta.x, delta.z).length())
	return closest


func _to_vector(coords: Array) -> Vector3:
	return Vector3(coords[0], coords[1], coords[2])
