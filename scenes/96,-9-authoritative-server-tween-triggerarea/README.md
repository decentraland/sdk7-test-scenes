# Authoritative Server — Tween & TriggerArea Capability Harness

A QA harness that answers one question about a **hammurabi-headless** build: does it
run the SDK's `Tween` and `TriggerArea` systems, or not?

The old headless server runs neither. A new build is supposed to. This scene is built
so the difference is unmissable from inside the scene, with no log-diffing and no
second scene to compare against — and so that a *partial* implementation reads as
partial rather than as either extreme.

## How it tells the two builds apart

The scene runs the **same 17-test suite twice** — once inside the headless server,
once locally inside your client — and shows the two runs as two columns of one table.
The suite lives in [`src/shared/suite/`](src/shared/suite) and neither side has its
own copy, so a row's `SRV` result and its `CLI` result are produced by literally the
same function.

That matters because of what an unsupported host actually does: **nothing**. It does
not throw, it does not warn. `Tween.setMove()` returns fine and the entity never
moves; `TriggerArea.setBox()` returns fine and `onTriggerEnter` never fires. There is
no error to catch — only an absence to measure. A single column of failures could mean
"the server lacks the feature" or "the harness is wrong". Two columns cannot:

| SRV | CLI | Reading |
| --- | --- | --- |
| ✗ | ✓ | **The server build is missing the feature.** The old server. |
| ✓ | ✓ | **The server build has it.** The new server. |
| ✗ | ✗ | The harness or the SDK build is at fault — *not* a server finding. |

The panel says exactly this in one sentence at the top, so the ✗/✗ case can never be
misreported as a server bug.

## Baseline: what the `auth-server` build scored

Measured in-world against `@dcl/sdk@auth-server`
(`7.26.1-32160793830.commit-0b97733`), Explorer `v0.169.0-alpha-main`. Re-measure on
your own build rather than trusting this table — it is here to show what a real reading
looks like:

| | SRV | CLI |
| --- | --- | --- |
| **TWEEN** | ✗ NOT SUPPORTED — 0/9 | ✓ SUPPORTED — 9/9 |
| **TRIGGER** | ✗ NOT SUPPORTED — 0/8 | ✓ SUPPORTED — 8/8 |

Neither system exists server-side: `TweenState` is never written and the entity's
`Transform` never moves; `TriggerAreaResult` is never written and no callback ever
fires, not even for the tween-free canary. Every client row passes with margin (the
`EF_LINEAR` curve deviates by 0.065 against a 0.15 tolerance; the stay stream ran at 37
callbacks/second), which is what licenses reading the server column as findings about
the server.

In-world this reads as: blue box frozen at the start, orange box gliding, **grey** zone,
and `ZONE ENTRIES: 0 / neither feature is live server-side`.

> An earlier revision of this scene covered **raycasts** instead of trigger areas and
> found them *already supported* server-side (6/8 — with `maxDistance` not honoured,
> repeatably). That is why the suite moved to trigger areas: raycasts were not the open
> question. If you need those numbers back, the raycast suite is in this scene's git
> history.

## Reading it in three levels

**1 — From across the parcel, without touching anything.** Two boxes should be sliding
along the floor: the blue one is moved by the **server's** tween, the orange one by
**your client's**. A translucent **trigger zone** straddles their path, and it turns
red while the *server's own* trigger area reports the *server's own* platform inside
it, with a `ZONE ENTRIES` counter floating above.

Registering a single entry needs **both** features at once — the tween has to carry
the platform into the volume, and the trigger area has to notice. So:

- Blue box gliding + zone flashing red + `ZONE ENTRIES` climbing → **new server**.
- Blue box frozen at the start, orange box gliding, `ZONE ENTRIES: 0` → **old server**.

The phases of the two boxes are independent — the client's twin starts when the scene
loads. Only "is it moving at all" is the signal.

**`ZONE ENTRIES: 0` does not mean "trigger areas are broken."** An entry needs *both*
halves, so the count alone cannot say which half failed. Both the in-world counter and
the panel therefore print a second line naming the cause.

### The canary, and why it has to exist

A `TriggerArea` reports **transitions only**. There is no per-tick "still nothing here"
answer of the kind a continuous raycast gives you, so an empty zone is genuinely
ambiguous between *"the platform never arrived"* and *"this host cannot detect anything
at all"* — and separating those two is the entire job of this scene.

So the rig carries a **canary**: a second, small trigger area with a prober that the
server slides in and out on a timer using **direct `Transform` writes rather than a
tween**.

To be clear about why, because the reason is not what it looks like: **a tweened
collider trips a trigger area perfectly well** — that is exactly what the zone measures
and what suite row #16 asserts. The canary avoids a tween because it has to be
*independent of* the tween system, not because a tween would fail to trip it. A
tween-driven canary would sit motionless on a tween-less host, report zero events, and
leave "no triggers" indistinguishable from "no tweens" — going silent on precisely the
server it exists to speak up about.

That gives three deliberately separable signals:

| Signal | needs tween | needs trigger | tells you |
| --- | --- | --- | --- |
| `ZONE ENTRIES` | ✓ | ✓ | the two working **together** |
| `Trigger canary events` | ✗ | ✓ | the trigger system **alone** |
| `TweenState` | ✓ | ✗ | the tween system **alone** |

Any single failure therefore stays attributable to the feature that caused it, which is
what lets the panel print *"trigger areas work (canary firing); the platform never moves
into the zone (no server tween)"* instead of leaving you to guess.

That gives the zone three colours, so a dead trigger system can never be mistaken for
a healthy-but-empty one:

| Zone | Meaning |
| --- | --- |
| **grey**, dim | The server never reported a trigger transition — not even for the canary. The zone is deaf. |
| **green** | Trigger system live, zone empty. |
| **red** | Trigger system live, and the platform is inside it right now. |

A grey zone indicts the trigger system, a frozen blue box indicts the tween, and they
are readable independently of each other.

**2 — The verdict banner.** Top of the panel: one line per feature, `SRV` verdict
beside `CLI` verdict, each with a pass tally, then the one-sentence conclusion.

**3 — The rows.** 17 rows, each with the SDK surface under test and a detail line per
side. On an unsupported server the `SRV` line names what never arrived
(`no TriggerAreaResult after 4000ms`), with the same test passing on the `CLI` line
beneath.

`RUN ALL · SRV` / `RUN ALL · CLI` re-run everything; the per-row `SRV` / `CLI` buttons
re-run one row. Both sides also auto-run once — the server when it boots, the client
when the scene loads — so walking in is enough.

## The verdict is probe-driven, not tally-driven

Two rows are marked `◆` — the **capability probes** (#0 `TweenState is written`,
#9 `TriggerAreaResult is written`). The banner's SUPPORTED / NOT SUPPORTED comes from
those two rows alone, never from the pass count, because "the host never wrote the
component" and "the host wrote it but got one detail wrong" are different findings that
must not average together. A host that passes its probe and fails other rows reads as
**SUPPORTED**, with a visible partial score and an amber conclusion pointing you at the
failing details — which is exactly the state a half-finished new build would be in.

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

### TriggerArea — `src/shared/suite/triggerarea.ts`

| # | Test | Under test | Pass means |
| --- | --- | --- | --- |
| ◆9 | TriggerAreaResult is written | `TriggerArea` → `TriggerAreaResult` | The host records a result at all |
| 10 | onTriggerEnter fires | `triggerAreaEventsSystem.onTriggerEnter` | `TAET_ENTER`, with `trigger.entity` = prober and `triggeredEntity` = area |
| 11 | onTriggerExit fires | `onTriggerExit` | A matching `TAET_EXIT` on the way out |
| 12 | onTriggerStay repeats | `onTriggerStay` | A per-tick stream while parked inside |
| 13 | collisionMask filtering | `ColliderLayer` | Fires for its own layer, silent for another |
| 14 | Volume from Transform.scale | `PBTriggerArea` + `Transform.scale` | Fires at a point inside the *scaled* box but outside an unscaled default |
| 15 | Sphere area | `TriggerArea.setSphere` | Enter and exit both fire on a sphere volume |
| 16 | Area sees a tweened box | Tween **+** TriggerArea | An area proven live by hand also fires for a tween-driven collider |

Row 16 is the interop row — the live rig in miniature, and the single row that answers
"can this server run a tween-driven, trigger-sensed mechanism at all?".

### Two API traps the suite deliberately pins down

- **`TriggerAreaResult` is a grow-only value set**, not a last-write-wins component
  (`maxElements: 100`, keyed by a `timestampFunction`). Its `.get()` has no `getOrNull`
  companion and throws when absent, so every read here is guarded by `.has()`. Never
  count events by set size either — it is capped and cumulative.
- **`result.trigger.entity` is what entered; `result.triggeredEntity` is the area.**
  The names invite the opposite reading, and a scene that mixes them up silently
  filters nothing. Row 10 asserts both.

### What the tests deliberately do *not* assert

- **The sphere's exact radius convention.** The protocol does not pin down whether the
  radius is `scale.x` or half of it, so row 15 asserts only that a sphere area
  completes an enter/exit cycle. Asserting a boundary would test the host against a
  rule it never agreed to.
- **Host-side `TAET_STAY`.** Row 12 exercises the host's ENTER plus the *SDK's* state
  machine: the SDK synthesizes stay callbacks per tick between a wire ENTER and a wire
  EXIT and ignores wire `TAET_STAY` entirely. The row says so.
- **Tight timing.** The host publishes the interpolated `Transform` back over CRDT, so
  a read trails the true position by ~1–3 frames. Tolerances in
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

The server prints its verdict as a banner at the end of every run, which is the line to
capture when recording which build was under test:

```
[SERVER] ══════════════════════════════════════════════
[SERVER]  TWEEN   : NOT SUPPORTED — 0/9 passed
[SERVER]  TRIGGER : NOT SUPPORTED — 0/8 passed
[SERVER] ══════════════════════════════════════════════
```

### Pointing it at a different server build

Nothing in the scene names a server version — it measures whatever build is running it.
To compare builds, deploy (or run) the same scene against each and record the two
banners. On an unsupported build a full run takes noticeably longer, because every row
spends its timeout waiting for something that never comes.

> **Dependency note.** `devDependencies` declares **only** `@dcl/sdk`. Do not add a
> direct `@dcl/js-runtime` — `@dcl/sdk` ships its own, and a second differently-versioned
> copy cannot be deduped, so both get installed and their ambient globals (`DEBUG`,
> `Entity`, `compositeFromLoader`, …) collide into ~19 `TS2451`/`TS2300` errors that fail
> the CI build. This bit this scene once already.

## How it is built

| Concept | Where |
| --- | --- |
| `isServer()` branching of a single codebase | `src/index.ts` |
| The suite itself — run verbatim by both sides | `src/shared/suite/` |
| Tick-driven waits, entity scopes, assertion helpers | `src/shared/harness.ts` |
| Shared run orchestration behind a `ResultSink` | `src/shared/runner.ts` |
| Server-authoritative synced components + `validateBeforeChange()` | `src/shared/schemas.ts` |
| Server-only `syncEntity()` of server-created entities | `src/server/server.ts` |
| The live rig: tweened platform, trigger zone, and the canary | `src/server/rig.ts` |
| Client sink, liveness heartbeat tracking | `src/client/state.ts` |
| Live-rig visualisation (server ghost, client twin, zone) | `src/client/setup.ts` |
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
- **Prove the mechanism live before concluding from its silence.** Every test whose
  pass condition is an *absence* (mask filtering, the off-layer prober) first drives a
  positive case through the same area. Skipping this is what made an earlier raycast
  version of this suite report a collider-registration race as a server bug, twice, with
  two consecutive runs disagreeing.
- **The lab sits at `y = 15`.** The suite runs on the client too, and its probers carry
  real colliders — 15 m up they are out of the player's way, and on `CL_CUSTOM4` /
  `CL_CUSTOM5` they are inert to player physics. Every test disposes its entities *and
  detaches its trigger callbacks* through an `entityScope()` in a `finally`; the
  callbacks live in an SDK-side map keyed by entity, so removing the entity alone would
  not unregister them.
- **The live rig's entities are not synced.** Syncing the platform would hand every
  client's own tween system a synced `Transform` to write back into (a feedback loop
  over the wire), and it would defeat the point: what clients need is the server's own
  *reading*, which is what the `LiveRig` component carries.
- **Client results never go over the wire.** Each client's column is a control run of
  its own renderer; a result that travelled from another machine would say nothing
  about this one.
