use std::{collections::HashMap, env, error::Error, fs, hint::black_box, sync::Arc, time::Instant};

use landmass::{
    Agent, Archipelago, ArchipelagoOptions, FromAgentRadius, Island, NavigationMesh, PathStep,
    PermittedAnimationLinks, PointSampleDistance3d, TargetReachedCondition, Transform, Vec3, XYZ,
};
use serde::{Deserialize, Serialize};

type Point = [f32; 3];

const HORIZONTAL_SNAP: f32 = 0.55;
const VERTICAL_SNAP: f32 = 0.35;
const WARMUPS: usize = 100;
const SAMPLES: usize = 500;

#[derive(Deserialize)]
struct Fixture {
    radius: f32,
    open: Mesh,
    closed: Mesh,
    scenarios: Vec<Scenario>,
    crowd: Option<CrowdFixture>,
}

#[derive(Deserialize)]
struct Mesh {
    vertices: Vec<Point>,
    polygons: Vec<Vec<usize>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Scenario {
    id: String,
    start: Point,
    goal: Point,
    door_open: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CrowdFixture {
    agents: Vec<CrowdAgent>,
    radius: f32,
    max_speed: f32,
    max_acceleration: f32,
    step_seconds: f32,
    steps: usize,
    arrival_radius: f32,
}

#[derive(Deserialize)]
struct CrowdAgent {
    start: Point,
    goal: Point,
}

#[derive(Serialize)]
struct Comparison {
    backend: &'static str,
    runtime: String,
    scenarios: Vec<ScenarioResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    crowd: Option<CrowdResult>,
}

#[derive(Serialize)]
struct ScenarioResult {
    id: String,
    status: Status,
    points: Vec<Point>,
    #[serde(rename = "p95Ms")]
    p95_ms: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CrowdResult {
    total: usize,
    arrived: usize,
    #[serde(rename = "p95Ms")]
    p95_ms: f64,
    min_center_distance: f32,
    overlap_steps: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
enum Status {
    Complete,
    Unreachable,
}

fn to_landmass([x, y, z]: Point) -> Vec3 {
    Vec3::new(x, -z, y)
}

fn to_sdk(point: Vec3) -> Point {
    [point.x, point.z, -point.y]
}

fn polygon_area(vertices: &[Vec3], polygon: &[usize]) -> Result<f32, Box<dyn Error>> {
    if polygon.len() < 3 {
        return Err("expected a polygon with at least three vertices".into());
    }
    let mut twice_area = 0.0;
    for (&a, &b) in polygon.iter().zip(polygon.iter().cycle().skip(1)) {
        let (a, b) = (
            vertices.get(a).ok_or("invalid polygon vertex index")?,
            vertices.get(b).ok_or("invalid polygon vertex index")?,
        );
        twice_area += a.x * b.y - b.x * a.y;
    }
    if !twice_area.is_finite() || twice_area == 0.0 {
        return Err("degenerate polygon in the horizontal plane".into());
    }
    Ok(twice_area)
}

fn archipelago(mesh: Mesh, radius: f32) -> Result<Archipelago<XYZ>, Box<dyn Error>> {
    let vertices: Vec<_> = mesh.vertices.into_iter().map(to_landmass).collect();
    let mut polygons = mesh.polygons;
    for polygon in &mut polygons {
        if polygon_area(&vertices, polygon)? < 0.0 {
            polygon.reverse();
        }
    }

    let nav_mesh = NavigationMesh {
        vertices,
        polygon_type_indices: vec![0; polygons.len()],
        polygons,
        height_mesh: None,
    }
    .validate()
    .map_err(|error| format!("landmass rejected the fixture mesh: {error:?}"))?;
    let mut world = Archipelago::new(ArchipelagoOptions::from_agent_radius(radius));
    world.add_island(Island::new(
        Transform {
            translation: Vec3::ZERO,
            rotation: 0.0,
        },
        Arc::new(nav_mesh),
    ));
    world.update(0.0);
    Ok(world)
}

fn within_snap(actual: Vec3, requested: Vec3) -> bool {
    let delta = (actual - requested).abs();
    delta.x <= HORIZONTAL_SNAP && delta.y <= HORIZONTAL_SNAP && delta.z <= VERTICAL_SNAP
}

fn snap_distance() -> PointSampleDistance3d {
    PointSampleDistance3d {
        horizontal_distance: HORIZONTAL_SNAP * 2.0_f32.sqrt(),
        distance_above: VERTICAL_SNAP,
        distance_below: VERTICAL_SNAP,
        vertical_preference_ratio: 1.0,
        animation_link_max_vertical_distance: VERTICAL_SNAP,
    }
}

fn route(
    world: &Archipelago<XYZ>,
    scenario: &Scenario,
    costs: &HashMap<usize, f32>,
) -> Option<Vec<Point>> {
    let snap = snap_distance();
    let start = to_landmass(scenario.start);
    let goal = to_landmass(scenario.goal);
    let from = world.sample_point(start, &snap).ok()?;
    let to = world.sample_point(goal, &snap).ok()?;
    if !within_snap(from.point(), start) || !within_snap(to.point(), goal) {
        return None;
    }

    let steps = world
        .find_path(&from, &to, costs, PermittedAnimationLinks::All)
        .ok()?;
    let mut points = vec![to_sdk(from.point())];
    for step in steps {
        let PathStep::Waypoint(point) = step else {
            // This fixture has no scripted links. A link needs a traversal action.
            return None;
        };
        let point = to_sdk(point);
        if points.last() != Some(&point) {
            points.push(point);
        }
    }
    within_snap(to_landmass(*points.last()?), goal).then_some(points)
}

fn p95_ms(durations: &mut [f64]) -> f64 {
    durations.sort_by(f64::total_cmp);
    durations[(durations.len() * 95).div_ceil(100) - 1]
}

fn run(
    world: &Archipelago<XYZ>,
    scenario: Scenario,
    costs: &HashMap<usize, f32>,
) -> ScenarioResult {
    for _ in 0..WARMUPS {
        black_box(route(world, &scenario, costs));
    }
    let mut durations = [0.0; SAMPLES];
    for duration in &mut durations {
        let start = Instant::now();
        black_box(route(world, &scenario, costs));
        *duration = start.elapsed().as_secs_f64() * 1000.0;
    }
    let (status, points) = match route(world, &scenario, costs) {
        Some(points) => (Status::Complete, points),
        None => (Status::Unreachable, Vec::new()),
    };
    ScenarioResult {
        id: scenario.id,
        status,
        points,
        p95_ms: p95_ms(&mut durations),
    }
}

fn run_crowd(
    world: &mut Archipelago<XYZ>,
    fixture: CrowdFixture,
) -> Result<CrowdResult, Box<dyn Error>> {
    if fixture.agents.len() < 2 || fixture.steps == 0 || fixture.step_seconds <= 0.0 {
        return Err("crowd fixture requires at least two agents and a positive duration".into());
    }
    let snap = snap_distance();
    let mut agents = Vec::with_capacity(fixture.agents.len());
    for spec in fixture.agents {
        let start = to_landmass(spec.start);
        let goal = to_landmass(spec.goal);
        let start = world
            .sample_point(start, &snap)
            .map_err(|error| format!("cannot sample crowd start: {error:?}"))?
            .point();
        let mut agent = Agent::create(
            start,
            Vec3::ZERO,
            fixture.radius,
            fixture.max_speed,
            fixture.max_speed,
        );
        agent.current_target = Some(goal);
        agent.target_reached_condition =
            TargetReachedCondition::Distance(Some(fixture.arrival_radius));
        agents.push((world.add_agent(agent), goal));
    }

    let mut durations = Vec::with_capacity(fixture.steps);
    let mut min_center_distance = f32::INFINITY;
    let mut overlap_steps = 0;
    let mut reached = vec![false; agents.len()];
    for _ in 0..fixture.steps {
        let start = Instant::now();
        world.update(fixture.step_seconds);
        durations.push(start.elapsed().as_secs_f64() * 1000.0);

        // The fixture is a flat deck. Landmass calculates velocities while
        // this controller applies them at the benchmark's common acceleration limit.
        for &(id, _) in &agents {
            let agent = world.get_agent_mut(id).expect("crowd agent still exists");
            let desired = agent.get_desired_velocity().truncate().extend(0.0);
            let velocity_change = (desired - agent.velocity)
                .clamp_length_max(fixture.max_acceleration * fixture.step_seconds);
            agent.velocity += velocity_change;
            agent.position += agent.velocity * fixture.step_seconds;
        }

        let mut min_this_step = f32::INFINITY;
        for (index, &(id, goal)) in agents.iter().enumerate() {
            let position = world
                .get_agent(id)
                .expect("crowd agent still exists")
                .position;
            reached[index] |= position.distance(goal) <= fixture.arrival_radius;
            for &(other, _) in &agents[index + 1..] {
                let other = world
                    .get_agent(other)
                    .expect("crowd agent still exists")
                    .position;
                min_this_step = min_this_step.min(position.truncate().distance(other.truncate()));
            }
        }
        min_center_distance = min_center_distance.min(min_this_step);
        if min_this_step < 2.0 * fixture.radius - 0.02 {
            overlap_steps += 1;
        }
    }
    Ok(CrowdResult {
        total: agents.len(),
        arrived: reached.into_iter().filter(|&reached| reached).count(),
        p95_ms: p95_ms(&mut durations),
        min_center_distance,
        overlap_steps,
    })
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args_os().skip(1);
    let fixture_path = args.next().ok_or("missing input fixture path")?;
    let result_path = args.next().ok_or("missing output result path")?;
    if args.next().is_some() {
        return Err("expected exactly two arguments: <fixture.json> <result.json>".into());
    }
    let fixture: Fixture = serde_json::from_slice(&fs::read(fixture_path)?)?;
    let mut open = archipelago(fixture.open, fixture.radius)?;
    let closed = archipelago(fixture.closed, fixture.radius)?;
    let costs = HashMap::new();
    let scenarios = fixture
        .scenarios
        .into_iter()
        .map(|scenario| {
            run(
                if scenario.door_open { &open } else { &closed },
                scenario,
                &costs,
            )
        })
        .collect();
    let crowd = fixture
        .crowd
        .map(|fixture| run_crowd(&mut open, fixture))
        .transpose()?;
    let result = Comparison {
        backend: "landmass",
        runtime: format!(
            "Native Rust release ({} {})",
            env::consts::OS,
            env::consts::ARCH
        ),
        scenarios,
        crowd,
    };
    fs::write(result_path, serde_json::to_vec_pretty(&result)?)?;
    Ok(())
}
