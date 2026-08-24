import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { createAvatarPurger } from '../shared/purge'
import { createSwapDetector, entityNumber, entityVersion } from '../shared/swaps'

// ---------------------------------------------------------------------------
// CLIENT-side half of the exploit + the roster the UI renders.
//
// purgeOtherAvatars() injects a crafted DELETE_ENTITY into THIS client's own
// scene engine (via the shared injector transport), wiping every remote avatar
// from the client's ECS view. This is host-independent — it happens below the
// scene↔host boundary where hammurabi's guard lives — which is why it looks the
// same on every server package. The host-distinguishing half runs on the SERVER
// (see server.ts, triggered by the purgeOnServer message).
//
// Repeatable: re-scans on every call, so avatars that join later are hit too.
// ---------------------------------------------------------------------------

const purger = createAvatarPurger('client')

// One row of the live "PlayerIdentityData + Transform" roster, shared by the
// console dump and the on-screen UI panel.
export type RosterRow = {
  id: number
  number: number
  version: number
  address: string
  x: number
  z: number
  isMe: boolean
}

let purgeTotal = 0
export function getPurgeTotal(): number {
  return purgeTotal
}

// Client-side swap detector over this browser's own player entities. Surfaces the
// same "id reused with a new address" / "one address on two ids" anomalies as the
// server, from the viewpoint of a client.
const clientSwaps = createSwapDetector()
export function getClientWarnings(): string[] {
  return clientSwaps.warnings
}

// Scan the local roster for swaps ~once a second. Called from setupClient().
let swapAcc = 0
export function startSwapWatch(): void {
  engine.addSystem((dt: number) => {
    swapAcc += dt
    if (swapAcc < 1) return
    swapAcc = 0
    const remote = playerEntityRoster().filter((r) => !r.isMe)
    clientSwaps.scan(remote.map((r) => ({ id: r.id, address: r.address })))
  })
}

function isMine(entity: Entity): boolean {
  return entity === engine.PlayerEntity || entity === engine.CameraEntity || entity === engine.RootEntity
}

// The full live result of getEntitiesWith(PlayerIdentityData, Transform) — every
// entity holding both components, self included. This is what the UI panel shows.
export function playerEntityRoster(): RosterRow[] {
  const rows: RosterRow[] = []
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const id = PlayerIdentityData.getOrNull(entity)
    const t = Transform.getOrNull(entity)
    rows.push({
      id: entity as number,
      number: entityNumber(entity as number),
      version: entityVersion(entity as number),
      address: id?.address ?? '???',
      x: t ? t.position.x : 0,
      z: t ? t.position.z : 0,
      isMe: isMine(entity)
    })
  }
  return rows.sort((a, b) => a.id - b.id)
}

// Fire the client-local exploit: inject a DELETE_ENTITY for every non-local
// avatar currently in this client's ECS. Returns how many were targeted.
export function purgeOtherAvatars(): number {
  dumpRoster('BEFORE')
  const targets = purger.purge()

  if (targets.length === 0) {
    console.log('[exploit/client] no other avatars present — nothing to purge (invite a second player, then click again)')
    return 0
  }
  for (const victim of targets) {
    console.log('[exploit/client] injected DELETE_ENTITY for #' + (victim as number))
  }
  purgeTotal += targets.length

  // receiveMessages() runs on the next tick; log the resulting roster then.
  let ticks = 0
  const reportSystem = () => {
    if (ticks++ < 2) return
    dumpRoster('AFTER ')
    engine.removeSystem(reportSystem)
  }
  engine.addSystem(reportSystem)

  return targets.length
}

// Print the FULL PlayerIdentityData+Transform roster so the before/after diff
// shows exactly which rows the inbound DELETE_ENTITY removed.
function dumpRoster(when: string): void {
  const roster = playerEntityRoster()
  const rows = roster.map(
    (r) => `  #${r.number} v${r.version} [${r.address} (${r.x.toFixed(1)},${r.z.toFixed(1)})]${r.isMe ? ' <-- me' : ''}`
  )
  console.log(
    `[exploit/client] ${when} getEntitiesWith(PlayerIdentityData, Transform) — ${roster.length} entit${roster.length === 1 ? 'y' : 'ies'}:`
  )
  console.log(rows.join('\n') || '  (none)')
}
