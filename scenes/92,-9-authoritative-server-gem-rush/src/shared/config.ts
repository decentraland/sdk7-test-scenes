// Round pacing. Deliberately short — this is a teaching showcase, not a challenge.
export const LOBBY_SECONDS = 10
export const ROUND_SECONDS = 30
export const PODIUM_SECONDS = 6

// Gems per round and the chance a gem is a rare one (worth RARE_VALUE instead of 1).
export const GEM_COUNT = 6
export const RARE_CHANCE = 0.15
export const NORMAL_VALUE = 1
export const RARE_VALUE = 5

// A collect is only accepted if the player is within this many metres of the gem.
// This is the server-side anti-cheat radius, verified from the player's
// server-side Transform — never anything the client reported. Tight on purpose:
// the player has to genuinely walk up to a gem, so position actually gates
// collection instead of letting any click from across the parcel through.
export const COLLECT_RADIUS = 2

// Max ray length for the client's click handler on a gem. DELIBERATELY much larger
// than COLLECT_RADIUS: the client lets you CLICK a gem from across the parcel, but
// the server only ACCEPTS the collect within COLLECT_RADIUS. That gap is the point
// of this teaching scene — clicking a far gem sends the exact same "collectGem"
// intent a cheating client would hand-craft, and lets you watch the authoritative
// server reject it with in-scene feedback. Keep this well above COLLECT_RADIUS.
export const GEM_POINTER_MAX_DISTANCE = 16

// How many ranked entries the synced round scoreboard broadcasts (13 KB-cap safety).
export const MAX_SCOREBOARD = 8

// How many hall-of-fame entries are persisted / broadcast.
export const MAX_HALL_OF_FAME = 10

// Where gems may spawn: scene-local bounds on the single parcel (16 × 16 m),
// inset from the edges. Gems are rejection-sampled to keep at least
// MIN_GEM_SPACING metres apart so collecting requires actually moving.
export const GEM_FIELD = { minX: 2, maxX: 14, minZ: 2, maxZ: 14, y: 1 }
export const MIN_GEM_SPACING = 2.5

// Heartbeat cadence (server pulse) and the freshness window clients use to
// decide the server is actually alive (~3× the pulse interval).
export const HEARTBEAT_MS = 2000
export const HEARTBEAT_FRESHNESS_MS = 6000
