// ---------------------------------------------------------------------------
// Version-aware identity tracking, to reproduce/diagnose the "server treats one
// player as another" (entity-swap) bug.
//
// An entity id packs two fields (ADR-117): version in bits 31..16, number in
// bits 15..0. The NUMBER is the reused slot; the VERSION/generation distinguishes
// successive occupants of that slot. ADR-245 requires the generation to be bumped
// when a number is reused, so a rejoining/new player gets a DISTINCT id and the
// scene re-streams a fresh PlayerIdentityData. If a host reuses a number WITHOUT
// bumping (or without clearing identity), the same packed id ends up bound to a
// different player — that is the swap.
// ---------------------------------------------------------------------------

export const RESERVED_STATIC_ENTITIES = 512

// ADR-117 packing. Note: for version > 0 the PACKED id exceeds 512 even though the
// NUMBER is reserved — so a reserved check MUST use the number, never the raw id.
export function entityNumber(id: number): number {
  return id & 0xffff
}
export function entityVersion(id: number): number {
  return (id >>> 16) & 0xffff
}
export function isAvatarNumber(id: number): boolean {
  return entityNumber(id) < RESERVED_STATIC_ENTITIES
}

export function shortAddress(address: string): string {
  if (!address || address.length < 12) return address || '???'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export type IdentityRow = { id: number; address: string }

// Detects the two shapes the swap takes, transition-based so it never spams:
//   1) the SAME packed id acquiring a DIFFERENT address — a slot reused with no
//      generation bump (or identity not cleared). A packed id should map to one
//      player forever, so any change is always an anomaly (no false positives).
//   2) one address held by TWO ids at once — a stale ghost alongside a fresh
//      entity for the same player.
export function createSwapDetector(maxWarnings = 12) {
  const addressById = new Map<number, string>() // entityId -> last-seen address (persistent)
  // addresses currently duplicated (already warned). Plain object, not a Set, to
  // avoid relying on Set/Map iteration downlevelling in the scene's tsconfig.
  let activeDuplicates: Record<string, true> = {}
  const warnings: string[] = []

  function warn(line: string): void {
    warnings.push(line)
    while (warnings.length > maxWarnings) warnings.shift()
  }

  function scan(rows: IdentityRow[]): void {
    // (1) same packed id, different address — persistent history, so it is caught
    // even across a leave/rejoin gap. addressById is only get/set, never iterated.
    for (const r of rows) {
      const prev = addressById.get(r.id)
      if (prev !== undefined && prev !== r.address) {
        warn(`#${entityNumber(r.id)} v${entityVersion(r.id)}: ${shortAddress(prev)} → ${shortAddress(r.address)}  (id reused, no gen bump)`)
      }
      addressById.set(r.id, r.address)
    }

    // (2) one address on multiple ids at once — warn only when it first appears.
    const idsByAddress: Record<string, number[]> = {}
    for (const r of rows) {
      const list = idsByAddress[r.address] || []
      list.push(r.id)
      idsByAddress[r.address] = list
    }
    const duplicatedNow: Record<string, true> = {}
    for (const address of Object.keys(idsByAddress)) {
      const ids = idsByAddress[address]
      if (ids.length > 1) {
        duplicatedNow[address] = true
        if (!activeDuplicates[address]) {
          warn(`${shortAddress(address)} on ${ids.map((i) => `#${entityNumber(i)}v${entityVersion(i)}`).join(', ')}  (duplicate)`)
        }
      }
    }
    activeDuplicates = duplicatedNow
  }

  // Ground-truth cross-check (server-side). `verifiedActiveLower` are addresses
  // proven connected by a comms-verified message (context.from) — the ONE channel
  // independent of the avatar CRDT. A verified sender that is NOT in the roster
  // means the server's player-tracking lost or misbound them: the "treats A as B"
  // swap, seen from the side the roster itself cannot lie about. Transition-gated.
  let activeMissing: Record<string, true> = {}
  function checkGroundTruth(rosterAddressesLower: string[], verifiedActiveLower: string[]): void {
    const inRoster: Record<string, true> = {}
    for (const a of rosterAddressesLower) inRoster[a] = true
    const missingNow: Record<string, true> = {}
    for (const a of verifiedActiveLower) {
      if (!inRoster[a]) {
        missingNow[a] = true
        if (!activeMissing[a]) warn(`${shortAddress(a)} is messaging but has NO avatar entity  (identity lost/swapped)`)
      }
    }
    activeMissing = missingNow
  }

  return { scan, checkGroundTruth, warnings }
}
