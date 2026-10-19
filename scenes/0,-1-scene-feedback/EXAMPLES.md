# Integration examples

Use these recipes after [installing the module](README.md#add-it-to-your-scene).
For choosing what to investigate and how to read answers, use the
[question guide](QUESTION_GUIDE.md). Each recipe below uses the same small configuration;
copy the relevant entries into your own `questions.ts`, then connect the handlers to events
your scene already has. Handler names here are illustrative, not SDK events.

## Shared configuration

In `src/scene-feedback/questions.ts`, keep the preview/debug settings from the copied file
and configure the Intro and Questions:

```ts
import { IntroSpec, QuestionSpec } from './lib/shared/series'

export const ASK_PARTICIPANTS_ONLY = true
export const INTRO: IntroSpec | null = {
  title: "Hi, we're the bowling team!",
  text: 'Would you like to answer a few questions while you play?'
}

export const QUESTIONS = {
  startingBowling: {
    text: 'How easy or difficult was it to start your first bowling game?',
    scale: 'EASE'
  },
  playingBowling: {
    text: 'How easy or difficult was it to play your first bowling game?',
    scale: 'EASE',
    commentPrompt: 'What made playing easy or difficult? (optional)'
  },
  bowlingProblems: {
    text: 'Was there anything annoying, unusual, or wrong during the game?',
    commentOnly: true,
    commentPrompt: 'What happened, and what were you trying to do?'
  }
} satisfies Record<string, QuestionSpec>
```

`EASE` runs from **Very difficult** to **Very easy**. `startingBowling` is rating only;
`playingBowling` adds an optional comment; `bowlingProblems` has a text field and no rating
or scale. Change wording under a new ID once a Question is live.

Keep the `feedback` import on the startup path for **both client and server**: importing it
starts the module, including the Storage server. Run the handlers and identity polling below
on the client, after your scene's existing `isServer()` guard. These recipes use
`questions.ts` configuration and public API calls from scene code.

The examples are alternative integration patterns, not five flows to run together. In
dynamic mode, consent is remembered for the visit: `in` accepted, `out` declined, `unknown`
not answered. With `ASK_PARTICIPANTS_ONLY = true`, only `in` players receive game Questions.
`ask()` shows an ID once per trigger per visit unless `{ repeat: true }` is passed. Choose
stable trigger names that describe the moment, rather than new names for each retry.

## 1. Intro now, Question after play

**When:** ask permission after the startup UI closes, then investigate onboarding after the
first turn. Also include players who abandon the start flow, once its UI closes.

**Configuration:** use the shared `INTRO`, `ASK_PARTICIPANTS_ONLY = true`, and
`startingBowling`. Put this code in your scene module and connect the handlers to those
existing UI/game events:

```ts
import { feedback } from './scene-feedback'

function onStartupUiClosed() {
  void feedback.intro('startup-closed')
}

function askAboutStarting() {
  if (feedback.participation() !== 'in') return
  void feedback.ask('startingBowling', 'first-start-attempt')
}

function onFirstTurnEnd() {
  askAboutStarting()
}

function onStartAbandonedAndUiClosed() {
  askAboutStarting()
}
```

**Expected:** accepting the Intro closes it; no Question follows until a later handler runs.
Declining prevents game Questions this visit. The scene determines when other UI is clear;
the module does not detect it. If a game event fires while consent is still unanswered, the
participation check suppresses that call: it does **not** replay the missed event later.
If that matters, have the scene remember it and ask at a later safe pause after consent.
Both start outcomes use one trigger, so abandoning and retrying does not ask twice.

## 2. Intro immediately followed by a Question

**When:** the player has just tried a game and reached a safe pause, and you want permission
immediately before the first Question. This is useful when there is no earlier consent step.

**Configuration:** use the shared `INTRO`, `ASK_PARTICIPANTS_ONLY = true`, and
`playingBowling`. Wire this handler after the first game's summary/exit UI closes, including
an abandoned game if the player had a chance to try playing:

```ts
import { feedback } from './scene-feedback'

function onFirstGameUiClosed() {
  void feedback.intro('first-game-end')
  void feedback.ask('playingBowling', 'first-game-end')
}
```

Call both methods from the same event; the module waits for consent before showing the
Question. No `await` or acceptance callback is needed. This is the same pattern used by the
[coin-hunt demo](src/game.tsx) when the player collects their first coin; here it runs after
the first game's UI closes. With participation required, `ask()` alone does not open an Intro.

**Expected:** the Question waits behind the Intro. Accepting leads into it; declining drops
it. If the player has already accepted earlier this visit, the Intro is not shown again and
the Question can open directly. A previous refusal still prevents the Question. There is no
need to add an acceptance callback. `await feedback.intro(...)` is available if the scene
needs the result (`accepted`, `declined`, or `not-shown`) for another purpose.

## 3. Feedback opened by the player

**When:** offer a permanent way to report a problem without waiting for a game trigger.

**Configuration:** use `bowlingProblems` from the shared configuration, with the shared
`INTRO` as a greeting. Dynamic participation settings do not restrict this flow. Connect
the handler to your existing feedback button's click action, a kiosk click, or entry into a
marked feedback area:

```ts
import { feedback } from './scene-feedback'

function onFeedbackRequested() {
  void feedback.leaveFeedback(['bowlingProblems'], 'feedback-button')
}
```

For actual 2D button, 3D click and area-entry wiring, see the working
[demo integrations](src/leave-feedback.tsx). Use a matching trigger such as `feedback-kiosk`
for your chosen entry point. For an area, call on entry, not every frame spent inside.

**Expected:** the greeting opens the text Question when accepted. This works even for a
player who declined game Questions, and does not enroll them in dynamic feedback. It can
be reopened during the same visit; a second call while this flow is open or waiting is
ignored.

## 4. Selected testers without an Intro

**When:** you have already agreed on participation with a known list of testers outside the
scene and want their game Questions without another consent panel.

**Configuration:** keep `ASK_PARTICIPANTS_ONLY = true`, use `startingBowling`, and set
`INTRO = null` for this integration. Replace the placeholder wallet in `TESTERS`. Identity
may not be available in `main()` yet, so poll until the local player's ID is ready:

```ts
import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { feedback } from './scene-feedback'

const TESTERS = ['0x0000000000000000000000000000000000000001'] // lowercase wallets

function enrollWhenIdentityReady() {
  const wallet = getPlayer()?.userId?.toLowerCase()
  if (!wallet) return
  engine.removeSystem(enrollWhenIdentityReady)
  if (TESTERS.includes(wallet)) feedback.enroll('selected-tester')
}

function startTesterEnrollment() {
  engine.addSystem(enrollWhenIdentityReady)
}

function onTesterFirstTurnEnd() {
  if (feedback.participation() !== 'in') return
  void feedback.ask('startingBowling', 'first-start-attempt')
}
```

Call `startTesterEnrollment()` once from the client part of your scene startup. Connect
`onTesterFirstTurnEnd()` to the first-turn event as in recipe 1. If your scene already has a
reliable identity-ready hook, use it instead of adding this system.

**Expected:** listed wallets become participants and generate an Intro CSV row with
`ratingLabel` `enrolled`. Other visitors remain `unknown` and receive no game Questions.
Enrollment should finish before the relevant game event; the participation check does not
queue missed events. Keep the `feedback` import available to the server even though the
enrollment system itself only runs on the client.

## 5. A mixed Group after the first game

**When:** at a pause after the first game, you need a short rating about play, a quick rating
about starting, and an open problem report. Choose this only if all three support your
playtest goal; often one rating and one text Question suffice.

**Configuration:** use all three shared Questions, `ASK_PARTICIPANTS_ONLY = true`, and a
participation route from recipe 1 or 4. Wire this handler after the first completed or
abandoned game's summary/exit UI closes, once the player has tried playing:

```ts
import { feedback } from './scene-feedback'

function onFirstGameFinishedOrAbandoned() {
  if (feedback.participation() !== 'in') return
  void feedback.ask(
    ['playingBowling', 'startingBowling', 'bowlingProblems'],
    'first-game-review',
    { comment: ['playingBowling'] }
  )
}
```

**Expected:** one Group has a rating with an optional comment, a rating without a comment,
and a text-only Question. The `comment` list controls optional comments on rating Questions
only. Changing it to `{ comment: false }` hides the optional comment on `playingBowling`;
`bowlingProblems` still shows its text field because that field is the answer.

Back and Next retain drafts; Submit sends the Group. Blank text counts as skipped. Skip or
× follow the [Group close rules](README.md#group-navigation-and-skipping); they do not silently answer
Questions the player never reached. A submitted text-only row leaves `rating`, `ratingLabel`
and `scale` empty; a skipped row uses `ratingLabel` `skipped`. Read each rating on its own
scale alongside the comments rather than averaging the Group into one score.

## Check your integration

Run `npm start`, exercise the wired events, decline the Intro on another visit, and try
empty submissions. Test a game event while the Intro is pending as well as after acceptance.
Then deploy to your own World, submit an answer there and [retrieve the CSV](README.md#4-review).
Keep test rows identifiable by their trigger and follow the
[reading guidance](QUESTION_GUIDE.md#reading-the-csv).
