import { Vector3 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// Tunables shared by client + server. The suite runs on BOTH sides from the very
// same code, so every position, duration and tolerance below has to live here
// rather than in a side-specific module — otherwise the two columns of the panel
// would not be comparing the same thing.
// ---------------------------------------------------------------------------

// Heartbeat cadence (server pulse) and the freshness window clients use to
// decide the server is actually alive (~3× the pulse interval).
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000

// --- The test lab ---------------------------------------------------------------
// Every suite entity is parked at LAB_Y, high above the walkable floor. The suite
// runs on the client too, and its entities carry MeshCollider (raycast targets
// need one) but never MeshRenderer: at 15 m up they are both invisible and out of
// the player's way, so a client-side run cannot block or trip anyone. 15 m also
// stays inside the single-parcel height budget (log2(1+1) × 20 = 20 m).
export const LAB_Y = 15

// Lanes inside the lab, kept apart so a tween test and a raycast test running
// back-to-back can never collide with each other's leftovers.
export const TWEEN_LANE_X = 3
export const RAY_LANE_X = 9

// --- Capability probe timing -----------------------------------------------------
// A host WITH the feature writes TweenState / RaycastResult within a frame or two.
// A host WITHOUT it never writes them at all, so the probe can only ever end on a
// timeout — this is that timeout. Generous enough to survive a slow server tick,
// short enough that a full unsupported-server run finishes in a few seconds.
export const PROBE_TIMEOUT_MS = 4000

// Hard ceiling the runner puts around EVERY test, so a test that waits on
// something the host will never deliver can't wedge the runner.
export const TEST_TIMEOUT_MS = 20000

// --- Tween test parameters -------------------------------------------------------
export const TWEEN_DURATION_MS = 2000
// Slack added on top of a tween's duration before we give up waiting for it.
export const TWEEN_SLACK_MS = 3000

// Distance a move tween covers. Long enough that the ~1-3 frame lag of the
// renderer's Transform write-back is small relative to the travel.
export const TWEEN_TRAVEL = 10

// Position tolerances, in metres.
export const POS_EPSILON = 0.15 // "landed on the end value"
// Max allowed deviation from the ideal LINEAR curve, as a fraction of the travel.
// The host writes the interpolated Transform back over CRDT, so a read trails the
// true position by ~1-3 frames (~0.05 of a 2 s tween). 0.15 absorbs that while
// still rejecting any real easing curve (EF_EASEINQUAD is off by 0.25 at t=0.5).
export const LINEARITY_TOLERANCE = 0.15
// Scale tolerance (metres) and rotation tolerance (as 1 - |dot| of the quaternions).
export const SCALE_EPSILON = 0.1
export const ROT_DOT_EPSILON = 0.002

// --- Raycast test parameters ------------------------------------------------------
// Three unit boxes in a row along +Z, used by the hit / query-all / distance tests.
// A default MeshCollider box is 1 m per side, so a box centred at z spans z±0.5.
export const RAY_ORIGIN_Z = 1
export const RAY_TARGET_Z = [4, 7, 10]
// Ray long enough to reach every target…
export const RAY_MAX_DISTANCE = 14
// …and short enough to fall short of the FIRST one (nearest face at z = 3.5,
// i.e. 2.5 m away), which is what the maxDistance test asserts.
export const RAY_SHORT_DISTANCE = 2

// Distance tolerance for an asserted hit length, in metres.
export const HIT_LENGTH_EPSILON = 0.2

// How long a raycast test waits for a freshly created MeshCollider to become
// raycastable before giving up. A collider is NOT visible to a ray on the tick its
// entity is created, and the headless server takes measurably longer to register one
// than the renderer does — waiting a single frame produced intermittent "2/3 boxes
// hit" / "CL_CUSTOM1 ray missed its own layer" failures against a server whose
// raycast was working. See the comment above casterSeeing() in suite/raycast.ts.
export const COLLIDER_SETTLE_MS = 2000

// --- The always-on live rig -------------------------------------------------------
// A server-tweened platform sliding along Z, and a server-cast continuous ray
// lying across its path. Registering a single beam break needs BOTH server-side
// features at once: the tween has to actually move the platform's Transform, and
// the raycast has to actually see it. On a server missing either, BEAM BREAKS
// stays 0 forever — that is the whole point of the rig.
export const RIG_Y = 1.5

// The server's platform lane, and the client's local twin next to it. The twin is
// driven by the client's own identical tween, so the two boxes are a direct
// side-by-side readout: gliding together = the server tweens; server box frozen
// at the start while the client box glides = it does not.
export const SERVER_LANE_X = 6.5
export const CLIENT_LANE_X = 9.5

export const PLATFORM_SCALE = Vector3.create(2, 0.3, 2)
export const PLATFORM_Z_START = 3
export const PLATFORM_Z_END = 13
export const PLATFORM_MS = 5000

// The beam lies across the platform's path at the midpoint of its travel, so a
// working rig breaks it twice per yoyo cycle.
export const BEAM_Z = 8
export const BEAM_X_START = 0.5
export const BEAM_LENGTH = 15

// How often the server samples its rig into the synced component. Deliberately
// low-rate: this is a status readout, not an animation channel — clients animate
// their own twin locally.
export const RIG_SAMPLE_HZ = 8

// Result detail strings are truncated to this before being written to a synced
// component. Two jobs: it keeps the results table well under the CRDT chunk cap,
// and it keeps a detail on ONE line in the panel — a wrapped detail overlaps the
// row below it, since React-ECS labels are laid out at a fixed height.
export const RESULT_DETAIL_MAX = 76
