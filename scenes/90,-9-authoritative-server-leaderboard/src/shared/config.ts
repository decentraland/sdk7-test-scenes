import { Vector3 } from '@dcl/sdk/math'

// Scene-local position of the clickable "score orb". The scene spans two parcels
// (90,-9 + 91,-9) → local bounds x:0..32, z:0..16, so this sits dead-centre.
export const ORB_POSITION = Vector3.create(16, 1.5, 8)

// A claim is only accepted if the player is within this many metres of the orb.
// This is the server-side anti-cheat radius — a client cannot score from afar.
export const CLAIM_RADIUS = 6

// How many ranked entries the synced leaderboard broadcasts to every client.
export const MAX_ENTRIES = 8

// Wallets allowed to reset the leaderboard (the `resetLeaderboard` message).
// Replace the placeholder with real admin address(es), lower-case. The SERVER
// enforces this list against the verified sender; the client only uses it to
// decide whether to show the reset button (see src/client/ui.tsx).
export const ADMINS = ['0x0000000000000000000000000000000000000000'].map((a) => a.toLowerCase())

// Heartbeat cadence (server pulse) and the freshness window clients use to
// decide the server is actually alive (~3× the pulse interval).
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000
