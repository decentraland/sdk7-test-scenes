import { Vector3 } from '@dcl/sdk/math'

// Badge ids as registered for this world with the badges service. The `tryAward` pad
// awards TEST_BADGE to whoever asks (platform proof); the target pad awards TARGET_BADGE
// only after the server-side position check (anti-cheat proof).
export const TEST_BADGE = 'test-badge'
export const TARGET_BADGE = 'target-badge'

// An address that is never in the room. Awarding to it must be refused by the platform:
// the engine falls back to guest signing and the badges service rejects the request.
export const ABSENT_ADDRESS = '0x000000000000000000000000000000000000dEaD'

// Scene-local positions (single parcel: x 0..16, z 0..16).
export const TRY_PAD_POSITION = Vector3.create(4, 1.2, 8)
export const TARGET_POSITION = Vector3.create(12, 1.2, 8)

// The server accepts `claimBadge` only from within this many metres of the target.
export const CLAIM_RADIUS = 2
