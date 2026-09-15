import { TeleportToRequest, teleportTo } from '~system/RestrictedActions'

import { Destination, TEST_SCENES_WORLD } from './destinations'

/**
 * Description of the last request this scene issued, rendered by the UI. `teleportTo` resolves with an
 * empty response, so the request is all the scene knows — the outcome is the client's prompt and, once
 * approved, the realm change and the landing parcel.
 */
let lastRequest = 'nothing yet'

export function getLastRequest(): string {
  return lastRequest
}

/**
 * The hub's own mode: the parcel together with the realm it belongs to. The client changes realm — or
 * stays if it is already there — and then lands on the parcel of that realm's grid.
 */
export function teleportToDestination(destination: Destination) {
  send(`${destination.title} — parcel ${destination.x},${destination.y} in ${TEST_SCENES_WORLD}`, {
    worldCoordinates: { x: destination.x, y: destination.y },
    realm: TEST_SCENES_WORLD
  })
}

/**
 * The pre-`realm` shape of the request: the parcel is read against whatever realm the player is in, so
 * from inside a world this lands on the world's own grid rather than on the named realm's.
 */
export function teleportToParcelOnly(destination: Destination) {
  send(`parcel ${destination.x},${destination.y} in the current realm`, {
    worldCoordinates: { x: destination.x, y: destination.y },
    realm: undefined
  })
}

/** A realm with no parcel: the client lands on that realm's default spawn point. */
export function teleportToRealmSpawn(realm: string) {
  send(`default spawn of ${realm}`, { worldCoordinates: undefined, realm })
}

/** A parcel in a realm this scene does not live in, so the teleport has to change realm to get there. */
export function teleportToOtherRealm(realm: string, x: number, y: number) {
  send(`parcel ${x},${y} in ${realm}`, { worldCoordinates: { x, y }, realm })
}

function send(description: string, body: TeleportToRequest) {
  lastRequest = description
  console.log(`teleportTo → ${description}`)
  teleportTo(body).catch((error) => console.error(`teleportTo failed: ${error}`))
}
