# Scene Feedback

Asks players a Question with a labelled 1–5 rating and an optional comment, or a text-only
Question, at moments the creator picks.

<p align="center">
  <a href="assets/images/feedback-panel.png">
    <img src="assets/images/feedback-panel.png" width="274" alt="In-game Scene Feedback question with rating choices and an optional comment field">
  </a>
  <br>
  <em>Figure 1. Feedback during play.</em>
</p>

The Multiplayer Server saves each Response as a CSV row in scene Storage.

<p align="center">
  <a href="assets/images/scene-storage.png">
    <img src="assets/images/scene-storage.png" width="480" alt="Scene Storage showing playtest-feedback-1.csv and its download button">
  </a>
  <br>
  <em>Figure 2. Scene Storage, where you can download the responses as CSV.</em>
</p>

This scene contains the feedback library and a small coin-hunt example ([src/game.tsx](src/game.tsx)) that asks Questions
mid-round, after a round, and as a two-Question series. Its [questions.ts](src/scene-feedback/questions.ts)
demonstrates bank questions, custom rating scales, and a text-only Question.

## Add it to your scene

### 1. Install

- **Copy the files:**

  - [src/scene-feedback/](src/scene-feedback) into your scene's `src/`.
  - [assets/scene-feedback/](assets/scene-feedback) into your scene's `assets/`.

- **Enable the server** so the module can save responses:

  - Use `@dcl/sdk@auth-server`.
  - Set `"authoritativeMultiplayer": true` in `scene.json`.

  See the [Multiplayer Server setup](https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers) for more details.

### 2. Configure

Configure [questions.ts](src/scene-feedback/questions.ts):

- **Set `INTRO`** with your greeting and invitation to give feedback.
- **Edit `QUESTIONS`:** use bank questions or adapt them to your scene.
- **Choose a `scale`:** use a built-in scale or provide your own five labels.

```ts
export const INTRO: IntroSpec | null = {
  title: "Hi, we're the Coin Hunt team!",
  text: "We're testing a new experience and would love to hear what you think."
}

export const QUESTIONS = {
  playMore: QUESTION_BANK.motivation.playMore,
  buyingUpgrade: {
    text: 'How easy or difficult was it to buy an upgrade?',
    scale: 'EASE',
    commentPrompt: 'What most affected your rating? (optional)' // omit for rating only
  },
  nextCoinKnown: {
    text: 'How often did you know where the next coin was?',
    scale: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] // your own five labels
  }
} satisfies Record<string, QuestionSpec>
```

For choosing and adapting questions, see the [question guide](QUESTION_GUIDE.md).

### 3. Ask

Import `feedback` on both client and server startup paths; it starts automatically.
Connect calls like these to your scene's client-side events:

```ts
import { feedback } from './scene-feedback'

// After a purchase: ask permission, then one question.
function onFirstPurchaseUiClosed() {
  void feedback.intro('first-purchase')
  void feedback.ask('buyingUpgrade', 'first-purchase')
}

// Later, after a round: ask a group, one question at a time.
function onRoundUiClosed() {
  void feedback.ask(['buyingUpgrade', 'playMore'], 'round-complete')
}
```

The first event requests consent; later questions use that choice for the rest of the visit.
For an earlier intro or a player-opened form, see the [integration examples](EXAMPLES.md).

### 4. Review

Test your integration locally, then deploy to your World and submit a response there.
In Creator Hub, open **Manage → your World's ⋮ menu → View Storage**.

<p align="center">
  <a href="assets/images/creator-hub-view-storage.png">
    <img src="assets/images/creator-hub-view-storage.png" width="600" alt="Creator Hub Manage tab with the World's menu open and View Storage available">
  </a>
  <br>
  <em>Figure 3. Open your World's Storage from Creator Hub.</em>
</p>

This opens a browser page with **Scene Storage** (see Fig. 2), where you can browse and download
the CSV files (e.g. `playtest-feedback-1.csv`).

Use the `questionId` and `trigger` columns to find your test response.
See [CSV fields](#stored-csv) and [reading the results](QUESTION_GUIDE.md#reading-the-csv).

## Install with an AI agent

Give your coding agent this installation prompt:

```text
Add the Scene Feedback module to this Decentraland SDK7 scene.

Installation and API:
https://github.com/decentraland/sdk7-test-scenes/blob/main/scenes/0,-1-scene-feedback/README.md

1. Inspect the scene's UI, events, and client/server startup. Clarify any
   unspecified playtest goal, intro timing, and question timing with me.
2. Install using the README, preserving the scene's settings and functionality.
   For event wiring, follow its EXAMPLES.md link and select a matching recipe.
   Prefer Scene Feedback's API and configuration; change src/scene-feedback/lib/
   when the intended behavior needs an extension, explaining the gap.
3. For choosing and adapting questions, follow QUESTION_GUIDE.md. Configure a
   small set tied to the playtest goal and the scene's specific actions and objects.
4. Run the relevant available checks. Report the configured triggers, checks
   passed, remaining tests, and how to verify the CSV in the deployed World.
```

## API reference

### Keep game logic on the client

Keep the `feedback` import on both client and server startup paths.
If your scene has no server-side game logic, start `main()` with
`if (isServer()) return`, as in the [demo](src/index.ts).
For scenes with server logic, guard only the player-facing code.
The feedback panel uses its own UI renderer alongside your scene's UI.

### Comments and text-only questions

In `questions.ts`:

- **Rating only:** provide `scale` and omit `commentPrompt`.
- **Rating with a comment:** add `commentPrompt`.
- **Text only:** set `commentOnly: true`, add `commentPrompt`, and omit `scale`:

```ts
anythingWrong: {
  text: 'Was there anything annoying, unusual, or wrong during the round?',
  commentOnly: true,
  commentPrompt: 'What happened, and what were you trying to do?'
}
```

To hide optional comments for a particular call, use `comment`:

```ts
// Rating only for this call.
void feedback.ask('playMore', 'mid-round', { comment: false })

// Only playMore offers an optional comment.
void feedback.ask(['buyingUpgrade', 'playMore'], 'round-complete', { comment: ['playMore'] })
```

Text-only answer fields always remain visible.
See the [mixed-group example](EXAMPLES.md#5-a-mixed-group-after-the-first-game).

### Asking participants during play (dynamic approach)

Set `ASK_PARTICIPANTS_ONLY` in `questions.ts` to choose who receives questions from `ask()`:

- **`true` (default):** only enrolled participants receive questions.
- **`false`:** everyone receives questions except players who declined the Intro during this visit.

There are two ways to enroll a participant for the current visit:

1. **`feedback.intro(trigger)`** — invite the player to participate. Accepting enrolls them;
   declining opts them out. Call it before the first `ask()`; queued questions wait for the answer.
   You can also show the Intro earlier and ask questions at a later event:
   [separate-intro example](EXAMPLES.md#1-intro-now-question-after-play).
2. **`feedback.enroll(trigger)`** — enroll a player directly, for example a tester selected by
   wallet ID. Call it once their player identity is available
   ([see example](EXAMPLES.md#4-selected-testers-without-an-intro)).

Use `feedback.participation()` to read `in`, `out`, or `unknown`.
To react to the Intro's result, await `feedback.intro(trigger)`:
it returns `accepted`, `declined`, or `not-shown`.

With the default setting, `ask()` returns `not-shown` if consent is missing and no Intro
is pending. It does not open an Intro or replay missed events later.
Setting `INTRO = null` disables the Intro; use enrollment if participation is required.

The table below summarizes who receives questions under each setting:

| `ASK_PARTICIPANTS_ONLY` | Accepted or enrolled (`in`) | Not yet enrolled (`unknown`) | Declined (`out`) |
|---|---|---|---|
| `true` (default) | Questions shown | Consent or enrollment required | Questions not shown |
| `false` | Questions shown | Questions shown | Questions not shown |

### Asking participants through a feedback form (static approach)

Use `leaveFeedback()` to ask a series of questions when the player chooses to give feedback.
Invite them through a button, kiosk, or area trigger. The form shows the Intro first,
followed by the questions.

```ts
// When the player selects Leave feedback.
void feedback.leaveFeedback(['buyingUpgrade', 'playMore'], 'feedback-button')
```

- Choose questions the player can answer whenever they open the form.
- Players can reopen it, including after declining game-triggered questions.
- Its greeting does not change participation in game-triggered questions.
- Calls while this form is already open or waiting are ignored.

Use the [player-opened form recipe](EXAMPLES.md#3-feedback-opened-by-the-player)
or the demo's [button, kiosk, and area handlers](src/leave-feedback.tsx).

## Question bank

- [src/scene-feedback/lib/bank.ts](src/scene-feedback/lib/bank.ts) contains 20 selected Questions,
  grouped into `coreMechanic`, `coreLoop`, `social`, `motivation`, `world`, and `technical`.
  Each includes a rating scale, suggested timing, what the answer can tell you, and a reference
  code in [QUESTION_BANK.md](QUESTION_BANK.md).
- [src/scene-feedback/lib/shared/scales.ts](src/scene-feedback/lib/shared/scales.ts) contains
  14 rating scales. Choose one that fits your question, or use these examples to create your own with five labels.
- [QUESTION_BANK.md](QUESTION_BANK.md) contains a larger collection of 113 candidate questions
  for inspiration.
- [QUESTION_GUIDE.md](QUESTION_GUIDE.md) helps you choose and adapt questions, with ready-made
  sets and guidance on when to ask them.

## Debug

- **Preview the mobile layout:** set `PREVIEW_MOBILE = true` in `questions.ts` and
  resize the Explorer window to a phone-like aspect ratio (e.g. 1600 × 720).
  This setting applies only to local previews.
- **Try the debug UI:** the example scene enables it with `DEBUG = true`.
  It is available in local previews and, when deployed, to the World's owner and deployers.
  Feel free to adapt it to your needs; set `DEBUG = false` before release.

## Stored CSV

`playtest-feedback-1.csv`, `playtest-feedback-2.csv`, … — each part up to 400 KB (~2 500 rows;
Storage caps a value at 512 KB), `playtest-feedback-csv-head` holds the number of the part being
written. The World's scene Storage is 10 MB in
total, shared by all its scenes.

```csv
id,timeUtc,version,questionId,questionText,trigger,rating,ratingLabel,scale,commentPrompt,comment,secondsInScene,playersInScene,address,isGuest,platform
mfqz8k2x4f7a9c,2026-09-30 12:27:33,x7q2mdk4ea,playMore,How interested are you in playing more right now?,debug,5,Extremely,INTEREST,What makes you want to keep playing, or stop? (optional),kind of yes,42,1,0x…,true,desktop
```

- `ratingLabel` `skipped` (empty `rating` and `comment`): the player pressed Next or Submit with nothing answered, Skip, or closed the panel on that Question.
- Empty `rating` and `ratingLabel` with a `comment`: the player only wrote a comment.
- Text-only Questions also leave `scale` empty; `commentPrompt` and `comment` contain the text
  prompt and answer. Blank text uses `ratingLabel` `skipped`, just like an unanswered rating Question.
- `questionId` `intro`: the player's answer to the Intro, `ratingLabel` `accepted` or `declined`,
  `trigger` of the call that showed it; or `enrolled` with the `trigger` passed to
  `feedback.enroll()`. Accepted ÷ (accepted + declined) = the share who agree to answer; count the
  game Intro's triggers apart from Leave feedback's.
- `version`: tail of the deployed entity id, new on every deploy (`preview` locally).
- `questionText`: the wording the server shipped with, so edited Questions never mix with old answers.
- `ratingLabel`, `scale`: the label the player picked and the scale it came from (a code, or the
  custom labels joined with ` | `), so a rating is read with the words that were on screen.
- `commentPrompt`: the comment field's prompt as shown; empty for a rating-only Question, so an
  empty comment there means "not offered", not "left blank". Also empty when the call's `comment`
  option left the field out.
- `trigger`: the label passed to `feedback.ask()` or `feedback.leaveFeedback()` (`debug` for the
  debug buttons: your own test rows, filter them out).
- `secondsInScene`: from the player's scene load to the answer, reported by the client.
- `playersInScene`: players in the scene when the server received the answer (solo vs group).
- `id` dedupes client resends and merges rows when two server instances overlap after a redeploy.
- `platform` is self-reported by the client.
- Comments are flattened to one line, and a leading `= + - @` is prefixed with `'` so spreadsheets
  don't run it as a formula.
- The server acks a Response once buffered, not once in Storage: a crash or redeploy loses up to a
  minute of them, and the client doesn't resend.
- Storage has no compare-and-set: while two server instances overlap after a redeploy, one flush can
  overwrite the other's rows.
- One address can write at most 100 rows per 10 minutes; the rest are dropped.
- The server buffers at most 2000 rows between flushes; past that it doesn't ack, and the client
  drops the row after 30 s of resends.

## Details

### Updating the module

To update to a newer version, replace `src/scene-feedback/lib/` and `assets/scene-feedback/` with the new
ones; `questions.ts` stays yours.

### Queue and results

`ask()` queues the Question and shows it once no other feedback panel is on screen and the server is up
(~15 s on a cold start). It resolves to `submitted`, `skipped` or `not-shown`: already shown at
this trigger this visit (pass `{ repeat: true }` to allow it), the server did not come up within
2 minutes, or the player closed the Group before reaching it.
A Group resolves to one result per id, in the same order. A typo in the id is a compile error.

### Group navigation and skipping

In a Group, **Next** and **Back** move between Questions and keep the answers on the player's
side; **Submit** on the last one sends them all ("Completed" replaces the progress bar once it
is answered). Next or Submit with nothing answered counts the Question as skipped; Submit with
nothing answered in the whole Group just closes it. **Skip** (first Question only) and × close the
Group: what was answered with Next is still sent, the Question on screen counts as skipped (or,
if the player came back to it with Back, is sent as it stands on screen), and
the ones never reached get no Response and are not asked again at that trigger.

## Credits

Rating faces in `assets/scene-feedback/face-*.png`: [Noto Emoji](https://github.com/googlefonts/noto-emoji), Apache License 2.0
(text in `assets/scene-feedback/LICENSE-noto-emoji.txt`, keep it next to the faces).

## How to test this scene

1. Run `npm install`, then `npm start` from this scene's folder.
2. Collect a coin and accept the Intro to test the in-game flow. Alternatively, wait for
   **DEBUG · server online** and use the **Ask** buttons to preview individual questions.
   **Show intro** only previews the greeting; it does not enroll you.
3. Submit an answer and inspect the local CSV data in
   `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`.
4. To test deployed Storage, use the [Review steps](#4-review).
   This repository's CI deploys PR and main pushes to `sdk7testscenes.dcl.eth` (`.zone`).
   Keep this demo's `worldConfiguration.name`; use your own World name in your own project.

For a real-phone test, run `npm start -- --mobile` and scan the QR code from a phone
on the same network. For the desktop mobile-layout preview, see [Debug](#debug).
