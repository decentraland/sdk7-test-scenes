# Authoritative Server — Tween & Raycast Capability Harness

A QA harness that answers one question about a **hammurabi-headless** build: does it
run the SDK's `Tween` and `Raycast` systems, or not?

The old headless server does not. A new build is supposed to. This scene is built so
the difference is unmissable from inside the scene, with no log-diffing and no second
scene to compare against — and so that a *partial* implementation reads as partial
rather than as either extreme.

## How it tells the two builds apart

The scene runs the **same 17-test suite twice** — once inside the headless server,
once locally inside your client — and shows the two runs as two columns of one
table. The suite lives in [`src/shared/suite/`](src/shared/suite) and neither side
has its own copy, so a row's `SRV` result and its `CLI` result are produced by
literally the same function.

That matters because of what an unsupported host actually does: **nothing**. It does
not throw, it does not warn. `Tween.setMove()` returns fine and the entity simply
never moves; `Raycast.create()` returns fine and `RaycastResult` never appears. There
is no error to catch — only an absence to measure. A single column of failures could
mean "the server lacks the feature" or "the harness is wrong". Two columns cannot:

| SRV | CLI | Reading |
| --- | --- | --- |
| ✗ | ✓ | **The server build is missing the feature.** The old server. |
| ✓ | ✓ | **The server build has it.** The new server. |
| ✗ | ✗ | The harness or the SDK build is at fault — *not* a server finding. |

The panel says exactly this in one sentence at the top, so the ✗/✗ case can never be
misreported as a server bug.

## Baseline: what the `auth-server` build scored

Measured in-world against `@dcl/sdk@auth-server`
(`7.26.1-31714079767.commit-96e9a29`), Explorer `v0.169.0-alpha-main`. Re-measure on
your own build rather than trusting this table — it is here to show what a real
reading looks like, and because the raycast result was not what "the old server has
neither feature" would predict:

| | SRV | CLI | |
| --- | --- | --- | --- |
| **TWEEN** | ✗ NOT SUPPORTED — 0/9 | ✓ SUPPORTED — 9/9 | No tween system at all: `TweenState` is never written, and the entity's `Transform` never moves. |
| **RAYCAST** | ✓ SUPPORTED — 6/8 | ✓ SUPPORTED — 8/8 | Raycasts **do** work server-side. Probe, ray geometry, single-collider hit, `RQT_QUERY_ALL` and continuous re-casting all pass. |

Two server rows fail inside a working raycast implementation, and they mean different
things:

- **#13 `maxDistance` clipping — a genuine server defect.** A 2 m ray reported a hit
  at 2.50 m, repeatably, while the same test passes on the client. The server is not
  clipping rays to `maxDistance`.
- **#16 `Ray sees a tweened box` — collateral from the missing tween.** The raycast
  half is fine; there is simply no tween to move the box. Expect this row to clear by
  itself once tweens land.

Every client row passes with margin (the `EF_LINEAR` curve deviates by 0.035–0.047
against a 0.15 tolerance), which is what licenses reading the server column as
findings about the server.

## Reading it in three levels

**1 — From across the parcel, without touching anything.** Two boxes should be
sliding along the floor: the blue one is moved by the **server's** tween, the orange
one by **your client's**. A beam lies across their path and turns red when the
*server's own* continuous raycast sees the *server's own* platform, with a
`BEAM BREAKS` counter floating above it.

Registering a single beam break needs **both** features at once — the tween has to
actually move the platform's `Transform`, and the raycast has to resolve against that
moved transform in the same tick. So:

- Blue box gliding + beam flashing red + `BEAM BREAKS` climbing → **new server**.
- Blue box frozen at the start, orange box gliding, `BEAM BREAKS: 0` → **old server**.

**`BEAM BREAKS: 0` does not mean "raycasts are broken."** A break needs *both* halves —
the tween has to carry the platform into the ray, and the ray has to see it — so the
count alone cannot say which half failed. On the `auth-server` build above the beam
never breaks *even though its raycast is working perfectly*: the platform is parked at
`z = 3` (spanning `z 2..4`) and the beam sits 4 m away at `z = 8`, so there is simply
nothing to see. Both the in-world counter and the panel therefore print a second line
naming the cause — `platform frozen: no server tween / raycast IS live — N casts,
nothing to see`.

The beam's colour is a **separate, independent** signal, and it has three states so
that a dead raycast can never be mistaken for a healthy one:

| Beam | Meaning |
| --- | --- |
| **grey**, unlit | The server never answered a raycast. The beam is blind; its colour says nothing about the platform. |
| **green** | Casting every tick, path clear. |
| **red** | Casting every tick, and it can see the platform. |

So a grey beam indicts the raycast, a frozen blue box indicts the tween, and they are
readable independently of each other.

The phases of the two boxes are independent — the client's twin starts when the scene
loads. Only "is it moving at all" is the signal.

**2 — The verdict banner.** Top of the panel: one line per feature, `SRV` verdict
beside `CLI` verdict, each with a pass tally, then the one-sentence conclusion.

**3 — The rows.** 17 rows, each with the SDK surface under test and a detail line per
side. On an unsupported server the `SRV` line names what never arrived
(`no TweenState after 4000ms`), with the same test passing on the `CLI` line beneath.

`RUN ALL · SRV` / `RUN ALL · CLI` re-run everything; the per-row `SRV` / `CLI` buttons
re-run one row. Both sides also auto-run once — the server when it boots, the client
when the scene loads — so walking in is enough.

## The verdict is probe-driven, not tally-driven

Two rows are marked `◆` — the **capability probes** (#0 `TweenState is written`,
#9 `RaycastResult is written`). The banner's SUPPORTED / NOT SUPPORTED comes from
those two rows alone, never from the pass count, because "the host never wrote the
component" and "the host wrote it but got one detail wrong" are different findings
that must not average together. A host that passes its probe and fails other rows
reads as **SUPPORTED**, with a visible partial score and an amber conclusion pointing
you at the failing details — which is exactly the state a half-finished new build
would be in.

## The tests

`◆` = capability probe.

### Tween — `src/shared/suite/tween.ts`

| # | Test | Under test | Pass means |
| --- | --- | --- | --- |
| ◆0 | TweenState is written | `Tween.setMove` → `TweenState` | The component appears at all |
| 1 | Transform write-back | `Transform.get()` mid-tween | A sample lands strictly between start and end |
| 2 | Tween completes | `TweenState.state` | Reaches `TS_COMPLETED` **and** lands on the end value |
| 3 | EF_LINEAR curve | `EasingFunction` | Every mid-flight sample tracks the linear curve |
| 4 | Rotate mode | `Tween.setRotate` | Final rotation matches (compared as \|dot\|, quaternions being double-covered) |
| 5 | Scale mode | `Tween.setScale` | Final scale matches |
| 6 | `tweenCompleted()` helper | `tweenSystem.tweenCompleted` | Fires exactly once |
| 7 | TweenSequence chaining | `sequence[]` | Ends at the **second** leg's end |
| 8 | TL_YOYO looping | `TweenSequence.loop` | Reaches the far end and comes back |

### Raycast — `src/shared/suite/raycast.ts`

| # | Test | Under test | Pass means |
| --- | --- | --- | --- |
| ◆9 | RaycastResult is written | `Raycast` → `RaycastResult` | A result arrives for a **miss**, with `hits: []` |
| 10 | Ray origin & direction | `globalTarget` mode | `globalOrigin` and normalized `direction` are correct |
| 11 | Hits a MeshCollider | `RQT_HIT_FIRST` | One hit with the right `entityId` and `length` |
| 12 | RQT_QUERY_ALL | `RaycastQueryType` | All three boxes are in `hits[]` |
| 13 | maxDistance clipping | `PBRaycast.maxDistance` | A too-short ray answers with zero hits |
| 14 | collisionMask filtering | `ColliderLayer` | A `CL_PHYSICS` ray misses a `CL_CUSTOM1` box; a `CL_CUSTOM1` ray hits it |
| 15 | continuous re-casting | `PBRaycast.continuous` | `tickNumber` keeps advancing |
| 16 | Ray sees a tweened box | Tween **+** Raycast | A ray that provably saw a box loses it once a tween carries it away |

Row 16 is the interop row — the live rig in miniature, and the single row that
answers "can this server run a tween-driven, raycast-sensed mechanism at all?".

### What the tests deliberately do *not* assert

- **Hit ordering.** The protocol guarantees none (`RQT_HIT_FIRST` is documented as
  "first, not necessarily the closest"), so #12 asserts membership only. Asserting a
  sort would fail a compliant host.
- **`TS_COMPLETED` in #4/#5.** Those rows own the rotate/scale claim; #2 owns the
  completion claim. A host that lands the value but skips the state passes #4/#5 and
  says so in the detail.
- **A collider being raycastable on the tick it was created.** It is not, and the
  headless server takes longer to register one than the renderer does. Every raycast
  test waits for proof the host can see its collider (`casterSeeing()`), and every
  test whose pass condition is a *miss* proves the collider is visible **first** —
  otherwise an unregistered collider makes it pass for the wrong reason. Skipping this
  produced two consecutive server runs that disagreed on rows 12 and 14.
- **Tight timing.** The host publishes the interpolated `Transform` back over CRDT,
  so a read trails the true position by ~1–3 frames. Tolerances in
  [`src/shared/config.ts`](src/shared/config.ts) absorb that while still rejecting a
  wrong easing curve — `EF_EASEINQUAD` is off by 0.25 at the midpoint against a 0.15
  tolerance.

## Running it locally

The local multiplayer server needs **Node 22 or 24** (on Node 20 it exits silently).

```bash
nvm use 24
npm install
npm start
```

Server-side logs, including the verdict banner, stream via:

```bash
npm run server-logs
```

The server prints its verdict as a banner at the end of every run, which is the line
to capture when recording which build was under test:

```
[SERVER] ══════════════════════════════════════════════
[SERVER]  TWEEN   : NOT SUPPORTED — 0/9 passed
[SERVER]  RAYCAST : NOT SUPPORTED — 0/8 passed
[SERVER] ══════════════════════════════════════════════
```

### Pointing it at a different server build

Nothing in the scene names a server version — it measures whatever build is running
it. To compare builds, deploy (or run) the same scene against each and record the two
banners. On an unsupported build a full run takes noticeably longer, because every
row spends its `PROBE_TIMEOUT_MS` waiting for a component that never comes.

## How it is built

| Concept | Where |
| --- | --- |
| `isServer()` branching of a single codebase | `src/index.ts` |
| The suite itself — run verbatim by both sides | `src/shared/suite/` |
| Tick-driven waits, entity scopes, assertion helpers | `src/shared/harness.ts` |
| Shared run orchestration behind a `ResultSink` | `src/shared/runner.ts` |
| Server-authoritative synced components + `validateBeforeChange()` | `src/shared/schemas.ts` |
| Server-only `syncEntity()` of server-created entities | `src/server/server.ts` |
| The always-on tween + raycast live rig | `src/server/rig.ts` |
| Client sink, liveness heartbeat tracking | `src/client/state.ts` |
| Live-rig visualisation (server ghost, client twin, beam) | `src/client/setup.ts` |
| Two-column React-ECS panel | `src/client/ui.tsx` |

### Design notes worth knowing before editing

- **Every wait is driven by an engine system**, not `timers.setTimeout` — see
  `harnessSystem` in `src/shared/harness.ts`. A system tick is the one clock the
  renderer and the headless runner definitely share, and "wait for the host to write
  component X" only ever means "wait for more ticks".
- **`tweenSystem.tweenCompleted()` must be polled from a real system.** The SDK's own
  tween bookkeeping system sits at priority `-Infinity`, i.e. it runs *last* in the
  frame and consumes the one-shot flag; a poll from a promise continuation lands after
  the whole system loop and would always miss it. Hence `pollInSystem()`.
- **The lab sits at `y = 15`.** The suite runs on the client too, and its raycast
  targets need real `MeshCollider`s — 15 m up they are out of the player's way, and
  they carry no `MeshRenderer` so nothing unexplained floats overhead. Every test
  disposes its entities through an `entityScope()` in a `finally`.
- **The live rig's entities are not synced.** Syncing the platform would hand every
  client's own tween system a synced `Transform` to write back into (a feedback loop
  over the wire), and it would defeat the point: what clients need is the server's own
  *reading* of where its platform is, which is what the `LiveRig` component carries.
- **The rig's hit edge is detected every frame, published at 8 Hz.** The platform
  crosses the beam in a fraction of a second, so an 8 Hz detector would regularly step
  straight over a crossing and report zero breaks on a *working* server.
- **Client results never go over the wire.** Each client's column is a control run of
  its own renderer; a result that travelled from another machine would say nothing
  about this one.
