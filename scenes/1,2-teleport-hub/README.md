# Teleport Hub (`1,2`)

A hub for the other test scenes of the `sdk7testscenes.dcl.eth` world, built on the `realm` field that
[decentraland/protocol#477](https://github.com/decentraland/protocol/pull/477) added to `TeleportToRequest`.

A teleport request can now name the realm its parcel belongs to:

```ts
import { teleportTo } from '~system/RestrictedActions'

teleportTo({ worldCoordinates: { x: 80, y: -4 }, realm: 'sdk7testscenes.dcl.eth' })
```

Parcel coordinates only address one realm's grid, so before this field a scene inside a World had to fire
`changeRealm` and `teleportTo` as two independent requests — and `changeRealm` resolves when the change is
*accepted*, not when the new realm is live, so the teleport raced it. Carrying the realm on the teleport lets
the client sequence both: change realm, then land on the parcel there.

## What the scene does

- A ring of 12 clickable portals, one per destination scene, each labelled with its title and base parcel.
  Clicking one sends `teleportTo({ worldCoordinates: <base parcel>, realm: 'sdk7testscenes.dcl.eth' })`.
- A UI panel with the four request shapes side by side, so the difference is visible in one place:

  | Button | Request | Expected |
  | --- | --- | --- |
  | realm + parcel | `worldCoordinates` + `realm` | lands on that parcel of that realm — what the portals do |
  | parcel only | `worldCoordinates` | the parcel is read against the realm the player is already in |
  | realm only | `realm` | the realm's default spawn point |
  | another realm + parcel | `realm: 'genesis'` + `0,0` | leaves this world for Genesis City |

  The panel also shows the last request the scene issued. `teleportTo` resolves with an empty response, so
  the request is all the scene can report — the outcome is the client's prompt and where the player lands.

The destination list lives in [`src/destinations.ts`](src/destinations.ts); add an entry there (title plus
the destination's `scene.base`) to put another scene on the ring.

## Running it

```
npm install
npm run start
```

The preview is its own realm and the client refuses realm changes while running a local scene, so the
portals and the realm-carrying buttons only do their thing against the deployed world:

- Deep link: `decentraland://?dclenv=zone&realm=sdk7testscenes.dcl.eth&position=1,2`
- or `/goto sdk7testscenes.dcl.eth/1,2` from the chat once inside the zone environment

Restricted actions only run for the scene the player is standing in, so stay on the hub's parcel while
clicking.

## What to check in the client

- A portal click prompts, and on approval the player ends up on the destination parcel **of this world** —
  not on the same coordinates of Genesis City.
- The "parcel only" button, fired from inside the world, is the old behaviour: no realm is named, so the
  coordinates are resolved against the realm the player is in.
- The "another realm + parcel" button actually changes realm before landing.
- Because a realm-carrying teleport *is* a realm change, the client may show its change-realm consent
  prompt ("enter this World") rather than the place-preview teleport prompt — including for a destination
  inside the world the player is already in.

## SDK version note

`TeleportToRequest.realm` is not in a published `@dcl/sdk` yet, so
[`src/restricted-actions-realm.d.ts`](src/restricted-actions-realm.d.ts) merges the field into the ambient
`~system/RestrictedActions` declaration. The field itself needs no SDK support at runtime — `~system`
modules are provided by the client, and the scene passes the request object straight through. Delete that
file once the scene's `@dcl/sdk` declares `realm` on its own.
