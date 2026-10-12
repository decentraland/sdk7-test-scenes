Test scene for the `openExplorerUi` restricted action and the `ExplorerUiEventsResult` lifecycle
stream the explorer writes back to the scene.

It covers four things that used to be broken or unobservable: the **open verdict** (a second call
must be refused, not granted twice), **`request_id` correlation** (a scene with several calls in
flight must be able to tell them apart), the **per-event tick** (an event must be stamped with the
tick it happened on, not the one it was drained on), and the boolean **`stopEmote`** returns.

## Reading the screen

Two HUD panels do the reporting, so nothing here needs a log tail — though every line is also
logged, under the `[openExplorerUi]`, `[explorerUiWait]`, `[explorerUiEvents]` and `[stopEmote]`
prefixes.

- **Right — "Call results".** What each call was *told*: green `OPENED`, yellow
  `WAS_ALREADY_OPEN`, red rejections.
- **Left — "ExplorerUiEventsResult".** What actually *happened* to the panels: one line per
  lifecycle event, with the panel, the kind, the tick and the request id. `CLOSED` has no verdict
  counterpart at all — it arrives unprompted, including when the player closes the panel with Esc.

The two panels are deliberately independent: a verdict says a request was accepted, an event says a
panel really appeared.

## Layout

2×2 parcels, base `80,-6`. Four rows running north from the spawn, local-space coordinates:

| Row | z | Cubes |
| --- | --- | --- |
| Panels | 6 | One per `ExplorerUi` value: MAP, SETTINGS, BACKPACK, CAMERA_REEL, COMMUNITIES, PLACES, EVENTS |
| Gates | 13 | DELAYED (x=8), DOUBLE CALL (x=16), INVALID 99 (x=24) |
| Wait helper | 20 | CLOSE, CHAIN, MATCH-OPENED, TIMEOUT-3s, DOUBLE (x=4,10,16,22,28) |
| stopEmote | 26 | TRIGGER EMOTE (x=12), STOP EMOTE (x=20) |

**Closing a panel is done with Esc.** There is no in-world button for it, and the scene never
closes a panel itself — that is the point of the `CLOSED` events.

## Test scenarios

### 1. Panels row — the happy path

Click any cube. The panel opens, the verdict is `OPENED (1)`, and the left HUD shows
`<PANEL> OPENED`. Press Esc: the panel closes and `<PANEL> CLOSED` appears with the **same request
id** as its open and a **later tick**.

None of these cubes send a `requestId`, so both events report `req 0` — the protocol's value for a
call that asked for no correlation.

### 2. On-start call — no user gesture

Fires automatically from `main()` when the scene loads, before any click. Expected verdict:
`REJECTED_NO_USER_GESTURE (5)`. If this one says `OPENED`, the gesture gate is not being applied.

### 3. DELAYED — the gesture window expires

Click the yellow cube and **do not touch anything** for 5 seconds. The label counts down, then the
call fires. Expected: `REJECTED_NO_USER_GESTURE (5)`, because the click that armed the countdown is
long out of the gesture window by then.

### 4. DOUBLE CALL — one panel, two verdicts, one id

Click the teal cube. It fires two calls back to back, as request **101** and **102**.

- Exactly **one** panel opens.
- Verdicts: `OPENED (1)` for the first, `WAS_ALREADY_OPEN (2)` for the second. Two `OPENED`s mean
  the verdict is being decided before the state that justifies it exists.
- The left HUD shows `MAP OPENED ... req 101` — the id of the call that actually *got* the panel.
  The refused call emits **no events at all**.
- Press Esc: `MAP CLOSED ... req 101`, same id, later tick.

Click it a second time and confirm the new session carries different ids from the first one.

### 5. INVALID (99) — unknown enum value

Click the dark red cube. `99` is not an `ExplorerUi` member, so the explorer cannot map it to a
panel. Expected: `REJECTED_FEATURE_DISABLED (4)`, answered immediately — this gate is synchronous
and must not cost a frame.

### 6. Wait helper row — `openExplorerUiAndWait`

The same event stream consumed through the SDK helper instead of by hand. Both styles run side by
side, and every event the helper consumes must **still** appear in the left HUD.

| Cube | What it awaits | Expected |
| --- | --- | --- |
| CLOSE(MAP) | the panel close, collecting nothing | `CLOSED (0 collected)` after Esc |
| CHAIN(BACKPACK) | the close, collecting the whole chain | `CLOSED [opened+closed]` after Esc |
| MATCH-OPENED(PLACES) | only the open | `MATCHED` immediately, panel stays on screen |
| TIMEOUT-3s(SETTINGS) | close or 3 s, whichever comes first | `TIMEDOUT` if left alone, `CLOSED` if Esc is pressed first |
| DOUBLE(EVENTS) | two calls back to back | the reported one is `NOT_OPENED WAS_ALREADY_OPEN` |

### 7. User opens the panel first

Open any panel by hand (e.g. the backpack), then click the matching cube. Expected:
`WAS_ALREADY_OPEN (2)`, and — for the helper cubes — a `notOpened` outcome rather than a wait that
never resolves. A helper cube that hangs forever here is the regression this checks for.

### 8. stopEmote — `success` is a boolean

Click TRIGGER EMOTE (the avatar plays `robot`), then STOP EMOTE. Expected: the emote stops and the
right HUD shows `success=true typeof=boolean`.

`typeof=object` means the JS module is handing the scene an unresolved promise instead of the
boolean the protocol promises — the bug this row exists to catch.

### 9. Gesture sources � what counts as a user gesture

`openExplorerUi` is accepted only right after a user gesture. Three sources count; hover never does.

| Source | How to test | Expected |
| --- | --- | --- |
| 3D entity click | click any cube (`pointerEventsSystem`) | `OPENED (1)` |
| Scene UI click | click the blue "Open MAP (scene UI click)" button (bottom centre, React-ECS `onMouseDown`) | `OPENED (1)`, label `UI-CLICK(MAP)` |
| Global key, no entity target | press E (MAP), F (SETTINGS), 1 (BACKPACK), 2 (CAMERA_REEL), 3 (COMMUNITIES), 4 (PLACES) | `OPENED (1)`, label `KEY-<k>(...)` |

The keys are read with `inputSystem.isTriggered(IA_PRIMARY / IA_SECONDARY / IA_ACTION_3..6, PET_DOWN)`
and `openExplorerUi` is called in that same system tick. Hovering a cube or the UI button without
clicking must not open anything. `REJECTED_NO_USER_GESTURE (5)` on any of these means that source
is not recognised (explorer builds predating the UI/global-input gesture fix only accept entity clicks).
Press Esc to close a panel before the next key.

**Walking must not count (poll test).** Movement keys (WASD, Space/jump, Shift/walk, modifier, any-key)
are not gestures; only activation buttons (pointer, E, F, 1-4, Down or Up) are. To prove it:

1. Click "Poll openExplorerUi every tick: OFF" so it reads ON. Polling starts 1 s after the toggle,
   because the toggle click is itself a UI gesture and the first poll could legitimately open the map.
2. Wait 1 s, then close anything open with Esc.
3. Walk, jump and sprint without pressing E/F/1-4 or clicking. Expected on a fixed build: the map never
   opens and the panel counter ("poll: N rejected (no gesture), M opened") only grows "rejected".
   The `POLL(MAP)` HUD entry appears only on state changes or OPENED, not every tick.
4. Press E with nothing targeted while polling: the map should open (`POLL(MAP)` OPENED, counter "opened"
   +1), proving the gate still opens for real activation. Esc to close.

## SDK pin

Pinned to `7.29.1-35917671376.commit-046b268`, the first published build carrying
`openExplorerUiAndWait` ([js-sdk-toolchain#1543](https://github.com/decentraland/js-sdk-toolchain/pull/1543)).
It can move to a plain version range once that lands in a stable release.

The explorer side ([unity-explorer#10096](https://github.com/decentraland/unity-explorer/pull/10096))
is on `dev`. Against a client without it, scenarios 4, 7 and 8 fail and the request ids in the left
HUD all read `0`.
