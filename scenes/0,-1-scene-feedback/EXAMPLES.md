# Integration examples

Use these recipes after [installing the module](README.md#add-it-to-your-scene).
Choose one that fits when and how you want to ask:

| You want to… | Recipe |
|---|---|
| Get consent early and ask after play | [1. Intro now, Question after play](#1-intro-now-question-after-play) |
| Ask permission immediately before a question | [2. Intro followed by a Question](#2-intro-immediately-followed-by-a-question) |
| Let players choose when to give feedback | [3. Player-opened form](#3-feedback-opened-by-the-player) |
| Enroll testers selected by wallet | [4. Selected testers](#4-selected-testers-without-an-intro) |
| Combine ratings and text in one Group | [5. Mixed Group](#5-a-mixed-group-after-the-first-game) |
| Offer an optional in-game participation reward | [6. Scene-local reward](#6-a-scene-local-reward-for-participation) |

Copy the relevant entries from the shared configuration into your `questions.ts`, then
connect the recipe's handlers to events your scene already has. Handler names are examples,
not SDK events. For choosing and adapting the questions, use the [question guide](QUESTION_GUIDE.md).

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

The recipes are alternatives, not five flows to install together:

- With `ASK_PARTICIPANTS_ONLY = true`, game questions require consent or direct enrollment.
  The choice lasts for the visit; see the [participation rules](README.md#asking-participants-during-play-dynamic-approach).
- Choose stable trigger names describing the moment. `ask()` shows an ID once per trigger
  per visit unless `{ repeat: true }` is passed.

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
Declining prevents game Questions this visit. Both start outcomes use one trigger, so
abandoning and retrying does not ask twice.

**Event timing:**

- Connect the handlers where your scene knows its other UI is clear; the module does not detect it.
- This recipe's participation check suppresses an event fired before consent. To ask later,
  have the scene remember that event and wait for a safe pause after consent.

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

**Expected:** the Question waits behind the Intro. Accepting leads into it; declining drops
it. If the player has already accepted earlier this visit, the Intro is not shown again and
the Question can open directly. A previous refusal still prevents the Question.

**Call order:** call `intro()` before `ask()` from the same event. No `await` or acceptance
callback is needed; `ask()` alone does not open an Intro. The [coin-hunt demo](src/game.tsx)
uses this pattern at the first coin.

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

**Event timing:** finish enrollment before the relevant game event. The participation
check does not queue missed events.

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
and a text-only Question.

**Choose which comments to show:** the `comment` list controls optional comments on rating
Questions only. Changing it to `{ comment: false }` hides the optional comment on `playingBowling`;
`bowlingProblems` still shows its text field because that field is the answer.

For navigation and empty answers, see the [Group close rules](README.md#group-navigation-and-skipping).
Use [How to read the responses](README.md#how-to-read-the-responses) to distinguish text answers
from skipped rows, and [the question guide](QUESTION_GUIDE.md#reading-the-csv) to interpret the ratings.

## 6. A scene-local reward for participation

**When:** you want to offer a small in-game incentive for answering. Rewards are optional;
a useful, low-burden request may be enough. Wanting to keep playing and wanting to answer
feedback are separate questions. Include exposed players who had an unsuccessful attempt,
and keep declining or skipping free of penalties to normal play.

The Coin Hunt example unlocks a **Playtest Contributor** HUD title after the first submitted
answer from a game question or any player-opened route. It lasts only for the current visit:
no minting, wallet transaction, platform badge, saved entitlement or extra hunt progress.
The Intro explains the purpose, optional comments, reward terms and stored data before
participation. A low rating earns exactly the same title as a high one. Intro acceptance
alone, skipped/unshown questions and debug previews do not award it.

The scene-owned helper [feedback-reward.ts](src/feedback-reward.ts) accepts either a single
result or a Group's results. Connect it at the call site, outside the copied library:

```ts
import { feedback } from './scene-feedback'
import { recordFeedbackParticipation } from './feedback-reward'

// Use the event and participation route appropriate to the player's experience.
void feedback.ask('coinSpotting', 'first-coin').then(recordFeedbackParticipation)

// Keep the same terms for the button, kiosk and feedback area.
void feedback
  .leaveFeedback(['worthIt', 'playMore', 'coinSpotting'], 'ui-button')
  .then(recordFeedbackParticipation)
```

The helper unlocks once if **any** result is `submitted`; it never reads a rating or text.
A partly answered Group qualifies too. Closing before sending any answer, declining the
Intro or receiving only `skipped`/`not-shown` results leaves the title locked. Once earned,
skipping another question does not revoke it. Repeat forms cannot stack the reward, and a
new visit resets it. The debug panel previews questions directly and bypasses these scene
callbacks; test the actual gameplay/player-opened routes to verify the reward.

**Choose a reward your scene can deliver.** Existing game currency, a consumable, a temporary
boost or a cosmetic title are possible scene-owned choices. Define its amount, duration and
eligibility before asking; keep it independent of rating direction, praise or desired text.
If your scene has no economy, a title avoids inventing one just for a playtest. Ordinary
progress or items already earned through play should not be removed for refusal. A reward
for answering may change who responds or encourage rushing: retain invitation/reward terms
alongside your test notes, and compare recruitment and answer quality as well as counts.
Do not treat response count or the title as evidence of game enjoyment.

For a scene-only animation unlock, use a compatible bundled emote asset and the supported
[scene-emote API](https://github.com/decentraland/docs/blob/main/creator/sdk7/interactivity/avatars/avatar-animations.md);
it does not grant an owned emote. Distributing an owned wearable or emote instead requires
an approved, stocked and funded [Rewards campaign](https://docs.decentraland.org/creator/rewards/overview)
and its claim flow. For platform-dependent rewards, including badges or scene wearables,
check current [official creator documentation](https://docs.decentraland.org/llms.txt), the
maintained example, released SDK, live service and intended desktop/mobile clients together.
A proposal, merged PR or custom-client preview alone does not prove general availability.
Verify the chosen reward end to end, including its cap and persistence/expiry; no need to
implement every option in a playtest.

**Delivery boundary:** `submitted` describes the client's response action, not an
acknowledgement or confirmed CSV write. This client-only cosmetic title is deliberately
low stakes and resets on reload. Valuable currency, persistent entitlements or collectible
rewards need their own trusted eligibility/delivery checks and duplicate-claim handling;
this callback is not a payout receipt. The module's [queue/result rules](README.md#queue-and-results)
still apply. Avoid building a paid reward service into this example.

## Check your integration

1. Run `npm start` and trigger the chosen events. Check the recipe's expected behavior.
2. On another visit, decline the Intro. Game questions should stay closed; a player-opened
   form should still work.
3. Test events before and after consent, and try blank answers and closing the panel.
   Check the [result and close rules](README.md#queue-and-results).
4. Deploy to your World, submit a known answer, and [retrieve the CSV](README.md#4-review).
   Find its trigger and question ID, then compare the stored answer with what you entered.
