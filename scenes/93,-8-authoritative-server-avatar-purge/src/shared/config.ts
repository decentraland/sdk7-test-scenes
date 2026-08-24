import { Vector3 } from '@dcl/sdk/math'

// Scene-local position of the clickable RED orb (the exploit trigger). The scene
// spans two parcels (93,-8 + 94,-8) → local bounds x:0..32, z:0..16, so this sits
// dead-centre.
export const ORB_POSITION = Vector3.create(16, 1.5, 8)

// Heartbeat cadence (server pulse) and the freshness window clients use to decide
// the authoritative server is actually alive (~3× the pulse interval). The scene
// keeps a minimal heartbeat only so the UI can show the server is live — there is
// no gameplay left beyond the purge exploit.
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000
