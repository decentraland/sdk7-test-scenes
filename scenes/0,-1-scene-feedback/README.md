# Scene Feedback

Asks players a Question with a labelled 1–5 rating and an optional comment, at moments the
creator picks. **Submit** (or **Next** in a Group) with nothing answered passes on the Question; **Skip** and × close. Every Response —
submitted or skipped — ends up as a row of a CSV that the Authoritative Server keeps in scene
Storage.

This scene is the example: a tiny coin hunt ([src/game.tsx](src/game.tsx)) that asks Questions
mid-round, after a round, and as a two-Question series. Its [questions.ts](src/playtest-feedback/questions.ts)
shows the three kinds of Question: from the bank, your own on a shared scale, your own on your own scale.

## Add it to your scene

Requires `@dcl/sdk@auth-server` and `"authoritativeMultiplayer": true` in `scene.json` (only the
server can write Storage; see the [Multiplayer Server docs](https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers)).

1. Copy the [src/playtest-feedback/](src/playtest-feedback) folder into your `src/`, and the
   [assets/playtest-feedback/](assets/playtest-feedback) folder (the panel's images) into your `assets/`.
2. Edit [src/playtest-feedback/questions.ts](src/playtest-feedback/questions.ts) — the only file to touch:

   ```ts
   export const DEBUG = true // "Ask <id>" buttons top-left, for you only; turn off before release

   export const QUESTIONS = {
     playMore: QUESTION_BANK.motivation.playMore, // from the bank, as is
     buyingUpgrade: {                             // your own
       text: 'How easy or difficult was it to buy an upgrade?',
       scale: 'EASE', // labels of the five answers: a code from lib/shared/scales.ts, or your own five
       commentPrompt: 'What most affected your rating? (optional)' // leave out for rating only
     }
   } satisfies Record<string, QuestionSpec>
   ```

3. Pick a mode, or use both (below): **dynamic** — the Intro on arrival, then Questions
   asked during play — or **static** — a batch the player opens themselves. Importing
   `feedback` is the whole setup: it starts by itself on the client and the server, no call
   in `main()` needed. The trigger names the moment and goes to the CSV:

   ```ts
   import { feedback } from './playtest-feedback'

   // dynamic: the Intro first, on arrival; a yes makes the player a participant
   void feedback.intro('scene-enter')
   void feedback.ask('buyingUpgrade', 'after-first-purchase')

   // a Group: one panel, one Question after another, with a "1/3" progress bar
   void feedback.ask(['nextGoal', 'playMore', 'worthIt'], 'hunt-complete')

   // or wait for the player, e.g. to resume the game afterwards
   const result = await feedback.ask('playMore', 'round-2-complete')
   ```

With `authoritativeMultiplayer` your `main()` runs on the server too. If your scene has no
server logic, start it with `if (isServer()) return` so the scene code runs only for players.

To update to a newer version, replace `src/playtest-feedback/lib/` and `assets/playtest-feedback/` with the new
ones; `questions.ts` stays yours.

`ask()` queues the Question and shows it once nothing else is on screen and the server is up
(~15 s on a cold start). It resolves to `submitted`, `skipped` or `not-shown`: already shown at
this trigger this visit (pass `{ repeat: true }` to allow it), the server did not come up within
2 minutes, or the player closed the Group before reaching it.
A Group resolves to one result per id, in the same order. A typo in the id is a compile error.

In a Group, **Next** and **Back** move between Questions and keep the answers on the player's
side; **Submit** on the last one sends them all ("Completed" replaces the progress bar once it
is answered). Next or Submit with nothing answered counts the Question as skipped; Submit with
nothing answered in the whole Group just closes it. **Skip** (first Question only) and × close the
Group: what was answered with Next is still sent, the Question on screen counts as skipped, and
the ones never reached get no Response.

The comment field is shown when the Question has a `commentPrompt` and the call does not turn
it off:

- A Question without `commentPrompt` is always rating only, e.g. one meant for a quick tap
  mid-play. A Group can mix such Questions with commented ones.
- The call's `comment` option picks the Questions that show it: `false` for none, or a list of
  ids for only those. The same Question can be asked with a comment at one trigger and without
  at another:

  ```ts
  void feedback.ask('playMore', 'mid-round', { comment: false })
  // a Group where only playMore shows the comment field
  void feedback.ask(['nextGoal', 'playMore', 'worthIt'], 'hunt-complete', { comment: ['playMore'] })
  ```

### Dynamic: participants, then Questions during play

Each visit a player is a playtest **participant** (`in`), said no (`out`), or neither yet
(`unknown`). `ASK_PARTICIPANTS_ONLY` in `questions.ts` decides who gets the Questions of `ask()`:

| `ASK_PARTICIPANTS_ONLY` | `in` | `unknown` | `out` |
|---|---|---|---|
| `true` (the demo) | shown | not shown | not shown |
| `false` | shown | shown | not shown |

Two ways to make a player a participant:

- **The Intro**: `feedback.intro(trigger)` — the creator introduces themselves and asks whether
  the player wants to give feedback. **Give feedback** → `in`, **Skip** or × → `out`. Call it
  first thing on arrival (the demo does it at the top of `main()` in
  [src/index.ts](src/index.ts)); it shows right away, without waiting for the server. Until it
  is answered, the game's Questions wait behind it. It shows once per visit, only while the
  player is `unknown`, and resolves to `accepted`, `declined` or `not-shown`.
- **`feedback.enroll(trigger)`**: `in` without the Intro, e.g. for players you picked yourself.
  Not in the demo. Call it once you know the player's wallet (`getPlayer()` from
  `@dcl/sdk/players`, which may take a few frames after `main()`); an Intro still waiting for
  an answer is then dropped. Each enrollment is a CSV row too (`ratingLabel` `enrolled`):

  ```ts
  const TESTERS = ['0x0000000000000000000000000000000000000001'] // lowercase
  const wallet = getPlayer()?.userId?.toLowerCase()
  if (wallet && TESTERS.includes(wallet)) feedback.enroll('tester')
  ```

`feedback.participation()` returns the current state. Set the Intro's title, text and an
optional picture with `INTRO` in `questions.ts` (`null`: no Intro). Each answer to the Intro is
a CSV row (`questionId` `intro`), so you can count how many players agree to answer.

### Static: a batch the player opens

When the player chooses to give feedback — a button, a 3D kiosk, an area they walk into — call
`feedback.leaveFeedback(batch, trigger)` with a batch prepared for it: Questions that make sense
out of context. Every call shows the Intro, then the batch as one Group, any number of times per
visit, whatever the player said to the dynamic Intro. A call while the previous one is still
open or waiting is ignored. The demo wires it three ways in
[src/leave-feedback.tsx](src/leave-feedback.tsx):

```ts
const LEAVE_FEEDBACK_BATCH = ['worthIt', 'playMore', 'coinSpotting'] as const

// 2D: a button, here top-right in its own renderer
<UiEntity onMouseDown={() => void feedback.leaveFeedback(LEAVE_FEEDBACK_BATCH, 'ui-button')}> … </UiEntity>
ReactEcsRenderer.addUiRenderer(engine.addEntity(), LeaveFeedbackButton, { screenInset: 'interactable' })

// 3D: a clickable object
pointerEventsSystem.onPointerDown({ entity: kiosk, opts: { hoverText: 'Leave feedback' } },
  () => void feedback.leaveFeedback(LEAVE_FEEDBACK_BATCH, 'kiosk'))

// an area: on entering it
if (inside && !wasInside) void feedback.leaveFeedback(LEAVE_FEEDBACK_BATCH, 'feedback-area')
```

The demo's button has the panel's primary button style (ruby, rounded, bold caps). Its
renderer's `screenInset: 'interactable'` keeps it inside the area the explorer's HUD leaves free,
so the minimap or chat never covers it.

The panel uses its own UI renderer, so your `ReactEcsRenderer.setUiRenderer` stays yours.

## Question bank

[src/playtest-feedback/lib/bank.ts](src/playtest-feedback/lib/bank.ts): 20 Questions selected for the pilot, in
sections (`coreMechanic`, `coreLoop`, `social`, `motivation`, `world`, `technical`). Each comes
with its rating scale, the moment it is meant for, what the answer tells you, and its code in
[QUESTION_BANK.md](QUESTION_BANK.md). The 14 scales are in [src/playtest-feedback/lib/shared/scales.ts](src/playtest-feedback/lib/shared/scales.ts),
shortened to fit under a tile. A Question can also carry five labels of its own. All 113 candidate
Questions: [QUESTION_BANK.md](QUESTION_BANK.md); ready-made sets and when to ask what: [QUESTION_GUIDE.md](QUESTION_GUIDE.md).

## Tips

More on timing, wording and reading the answers: [QUESTION_GUIDE.md](QUESTION_GUIDE.md).

- **Make it about your game.** Bank texts use generic words — *the main activity*, *the goal*,
  *the rewards*, *the important objects*. Players answer better when they recognise what is
  asked, so swap them for your own. A reworded Question goes under your own id, with its own
  `commentPrompt` (it usually repeats the same generic word):

  ```ts
  // bank: repeatLoop 'How enjoyable was repeating the main activity?'
  coinRounds: {
    text: 'How enjoyable was collecting coins round after round?',
    scale: 'ENJOY',
    commentPrompt: 'What made the later rounds more or less fun? (optional)'
  }
  ```

  The demo does this: `coinSpotting` in [questions.ts](src/playtest-feedback/questions.ts) is bank
  `objectContrast` about coins.
- **Never change a live Question's text under the same id** — answers to different wordings
  would share it. New wording, new id.
- **Ask at a natural pause**: after a round, a purchase, a death screen — not mid-jump or
  mid-fight. The demo asks `coinSpotting` after the first coin on purpose, to show a mid-round call;
  pick calmer moments for real Questions.
- **Not only winners.** Players who gave up or lost are the ones you learn the most from; trigger
  on leaving or failing too, not just on completing.
- **Few Questions per visit**: one outcome Question (`playMore`, `comeBack` or `worthIt`) plus two or three
  focused ones. Never all 20.

## Test

1. `worldConfiguration.name` in `scene.json` is the target World. `npm install`, `npm run deploy`.
2. Collect coins, or wait for **DEBUG · server online** and press an **Ask** button. The debug
   panel shows in a local preview and, once deployed, only to the World's owner and the wallets
   allowed to deploy it.
3. Submit closes the panel at once and shows a *Thanks* toast; Responses go in the background.
   Without an ack the client resends every 3 s (deduped by id) and gives up after 30 s.
4. The server flushes buffered Responses to Storage at most once a minute, and immediately when
   the last player leaves (it stays up ~2 min after that). Copy the CSV from the scene storage UI
   (Creator Hub → Manage → ⋮ → View Storage), or follow `npm run server-logs`.

Local preview (`npm start`) writes to `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`,
not to production Storage.

## Stored CSV

`playtest-feedback-1.csv`, `playtest-feedback-2.csv`, … — each part up to 400 KB (~2 500 rows;
Storage caps a value at 512 KB), `playtest-feedback-csv-head` holds the number of the part being
written. The World's scene Storage is 10 MB in
total, shared by all its scenes.

```csv
id,timeUtc,version,questionId,questionText,trigger,rating,ratingLabel,scale,commentPrompt,comment,secondsInScene,playersInScene,address,isGuest,platform
mfqz8k2x4f7a,2026-09-30 12:27:33,x7q2mdk4ea,playMore,How interested are you in playing more right now?,debug,5,Extremely,INTEREST,What makes you want to keep playing, or stop? (optional),kind of yes,42,1,0x…,true,desktop
```

- `ratingLabel` `skipped` (empty `rating` and `comment`): the player pressed Skip or closed the panel on that Question.
- Empty `rating` and `ratingLabel` with a `comment`: the player only wrote a comment.
- `questionId` `intro`: the player's answer to the Intro, `ratingLabel` `accepted` or `declined`,
  `trigger` of the call that showed it; or `enrolled` with the `trigger` passed to
  `feedback.enroll()`. Accepted ÷ (accepted + declined) = the share who agree to answer.
- `version`: tail of the deployed entity id, new on every deploy (`preview` locally).
- `questionText`: the wording the server shipped with, so edited Questions never mix with old answers.
- `ratingLabel`, `scale`: the label the player picked and the scale it came from (a code, or the
  custom labels joined with ` | `), so a rating is read with the words that were on screen.
- `commentPrompt`: the comment field's prompt as shown; empty for a rating-only Question, so an
  empty comment there means "not offered", not "left blank". Also empty when the call's `comment`
  option left the field out.
- `trigger`: the label passed to `feedback.ask()` or `feedback.leaveFeedback()` (`debug` for the
  debug buttons).
- `secondsInScene`: from the player's scene load to the answer, reported by the client.
- `playersInScene`: players in the scene when the server received the answer (solo vs group).
- `id` dedupes client resends and merges rows when two server instances overlap after a redeploy.
- `platform` is self-reported by the client.
- Comments are flattened to one line, and a leading `= + - @` is prefixed with `'` so spreadsheets
  don't run it as a formula.
- Buffered Responses live in server memory until flushed: a server crash loses up to a minute of them.
