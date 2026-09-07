import { AvatarNametag, engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import type { PBAvatarNametag } from '@dcl/sdk/ecs'
import type { Color3 } from '@dcl/sdk/math'

// Console prefix for the multiplayer verification logs below, so behavior can be diffed between
// the two clients running this scene.
export const MP_LOG_PREFIX = '[AvatarNametagTest][MP]'

interface RosterEntry {
  label: string
  labelColor: Color3
  backgroundColor: Color3
  // Optional: entries without it exercise the native derived border (per the proto docs: defaults
  // to backgroundColor, so the plate carries no visible border).
  borderColor?: Color3
}

// Fixed roster cycled deterministically over every connected player (local + remote), sorted by
// wallet address. Same address list -> same assignment on every client, independent of join
// order. Every entry's label color AND background color are both visibly distinct from every
// other entry, so two players standing next to each other are never confusable at a glance.
export const ALL_PLAYERS_ROSTER: RosterEntry[] = [
  // Exactly the "Blue" pill from the design-system reference (periwinkle bkg, white label),
  // so the in-world render can be compared against the Figma mock 1:1.
  { label: 'Blue', labelColor: { r: 1, g: 1, b: 1 }, backgroundColor: { r: 0.47, g: 0.56, b: 0.96 }, borderColor: { r: 0.78, g: 0.85, b: 1 } },
  { label: 'Student', labelColor: { r: 1, g: 1, b: 1 }, backgroundColor: { r: 0.1, g: 0.2, b: 0.6 } },
  { label: 'Janitor', labelColor: { r: 0.05, g: 0.05, b: 0.05 }, backgroundColor: { r: 0.6, g: 0.9, b: 0.6 } },
  { label: 'Guest', labelColor: { r: 1, g: 1, b: 1 }, backgroundColor: { r: 0.35, g: 0.35, b: 0.35 } }
]

// Set by the manual panel (src/ui.tsx) whenever the user applies or removes the "Player" target's
// nametag directly; while set, the auto-tag system below leaves the local player's AvatarNametag alone so
// it doesn't fight the panel. Cleared by the panel's "Clear (hide plate)" button, which hands
// control of the local player back to the auto system.
let playerManualOverride = false

export function isPlayerManualOverride(): boolean {
  return playerManualOverride
}

export function setPlayerManualOverride(value: boolean): void {
  playerManualOverride = value
}

// Toggled by the "Colors" button in the panel. ON applies labelColor/backgroundColor from the
// roster; OFF omits both fields so the renderer's native defaults are exercised instead, while
// still auto-assigning the same roster labels.
let useColors = true

export function isUseColorsOn(): boolean {
  return useColors
}

function colorsEqual(a: Color3 | undefined, b: Color3 | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b
  }
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function nametagsEqual(existing: PBAvatarNametag | null, desired: PBAvatarNametag): boolean {
  if (existing === null) {
    return false
  }
  return (
    existing.label === desired.label &&
    colorsEqual(existing.labelColor, desired.labelColor) &&
    colorsEqual(existing.backgroundColor, desired.backgroundColor) &&
    colorsEqual(existing.borderColor, desired.borderColor)
  )
}

// Applies the current roster (respecting the useColors toggle and the local player's manual
// override) to every connected player. Shared by the throttled system below and by the toggle
// button below, which calls it once immediately so flipping "Colors" feels instant instead of
// waiting out the throttle.
export function applyRosterToAllPlayers(): void {
  try {
    // Collect entities into a plain array first, then mutate. Calling createOrReplace while still
    // iterating engine.getEntitiesWith(...) is unsafe: replacing a component can move the entity
    // to a different archetype/bucket, which can invalidate the live query iterator mid-loop.
    const players: { entity: Entity; address: string }[] = []
    for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      players.push({ entity, address: identity.address })
    }
    players.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()))

    for (const [index, player] of players.entries()) {
      const { entity, address } = player

      if (entity === engine.PlayerEntity && isPlayerManualOverride()) {
        continue
      }

      const roster = ALL_PLAYERS_ROSTER[index % ALL_PLAYERS_ROSTER.length]
      const desired: PBAvatarNametag = useColors
        ? {
            label: roster.label,
            labelColor: roster.labelColor,
            backgroundColor: roster.backgroundColor,
            ...(roster.borderColor !== undefined ? { borderColor: roster.borderColor } : {})
          }
        : { label: roster.label }

      const existing = AvatarNametag.getOrNull(entity)
      if (nametagsEqual(existing, desired)) {
        continue
      }

      AvatarNametag.createOrReplace(entity, desired)
      console.log(
        `${MP_LOG_PREFIX} ${address.toLowerCase()} -> ${roster.label} (${useColors ? '+colors' : 'default'})`
      )
    }
  } catch (e) {
    console.log(`${MP_LOG_PREFIX} applyRosterToAllPlayers error: ${e}`)
  }
}

export function toggleUseColors(): void {
  useColors = !useColors
  applyRosterToAllPlayers()
}

const AUTO_TAG_INTERVAL_SECONDS = 1
let timeSinceLastRun = 0

function autoTagSystem(dt: number): void {
  timeSinceLastRun += dt
  if (timeSinceLastRun < AUTO_TAG_INTERVAL_SECONDS) {
    return
  }
  timeSinceLastRun = 0
  applyRosterToAllPlayers()
}

// Registers the always-on auto-tag system. Call once from index.ts's main(). Handles late joiners
// automatically -- every ~1s pass re-scans all connected players, so a remote player who joins
// after scene start still gets tagged on the next pass without anyone pressing a button.
export function registerAutoTagSystem(): void {
  engine.addSystem(autoTagSystem)
}
