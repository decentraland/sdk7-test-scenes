/**
 * The world all the scenes of this repository are deployed to — every `scene.json` here carries it as
 * `worldConfiguration.name`, and it is what the hub passes as the `realm` of a teleport request.
 */
export const TEST_SCENES_WORLD = 'sdk7testscenes.dcl.eth'

export type Destination = {
  /** Label shown on the portal and on the hover text. */
  title: string
  /** Base parcel of the destination scene. */
  x: number
  y: number
}

/** Far from the hub on the world's grid, so a request that resolves against the wrong realm is obvious. */
export const RESTRICTED_ACTIONS_SCENE: Destination = { title: 'Restricted Actions', x: 80, y: -4 }

/**
 * A curated selection of the scenes deployed to this world, taken from each scene's `scene.json`
 * (`display.title` and `scene.base`). Add an entry to put another scene on the ring.
 */
export const DESTINATIONS: Destination[] = [
  { title: 'Cube Spawner', x: 0, y: 0 },
  { title: 'Particle System', x: 0, y: 7 },
  { title: 'Billboard Target', x: 1, y: 1 },
  { title: 'Virtual Cameras', x: 2, y: 22 },
  { title: 'Emote Finish', x: 4, y: 23 },
  { title: 'Avatar Nametag', x: 4, y: 24 },
  { title: 'Testing Gallery', x: 52, y: -52 },
  { title: '3D Models', x: 54, y: -55 },
  RESTRICTED_ACTIONS_SCENE,
  { title: 'Audio Visualization', x: 88, y: -10 },
  { title: 'Avatar Masks', x: 88, y: -13 },
  { title: 'GLTF Reuse vs Merge', x: 94, y: -10 }
]
