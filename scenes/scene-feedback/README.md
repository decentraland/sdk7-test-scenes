# Scene Feedback

Asks players a Question with a 1–5 rating and an optional comment, at moments the creator
picks. **Skip** turns into **Submit** once a rating or a comment is entered. Every Response —
submitted or skipped — ends up as a row of a CSV that the Authoritative Server keeps in scene
Storage. Vocabulary: [CONTEXT.md](CONTEXT.md).

This scene is the example: a tiny coin hunt ([src/game.tsx](src/game.tsx)) that asks Questions
mid-round, after a round, and as a two-Question series.

## Add it to your scene

Requires `@dcl/sdk@auth-server` and `"authoritativeMultiplayer": true` in `scene.json` (client
code cannot write Storage; see [research-storage-options.md](research-storage-options.md)).

1. Copy the [src/feedback/](src/feedback) folder into your `src/`.
2. Edit [src/feedback/questions.ts](src/feedback/questions.ts) — the only file to touch:

   ```ts
   export const DEBUG = true // "Ask <id>" buttons top-left; turn off before release

   export const QUESTIONS = {
     playMore: QUESTION_BANK.motivation.playMore, // from the bank, as is
     buyingUpgrade: {                             // your own
       text: 'How easy or difficult was it to buy an upgrade?',
       commentPrompt: 'What most affected your rating? (optional)'
     }
   } satisfies Record<string, QuestionSpec>
   ```

3. Ask wherever the moment happens. Importing `feedback` is the whole setup: it starts by
   itself on the client and the server, no call in `main()` needed. The trigger names the
   moment and goes to the CSV:

   ```ts
   import { feedback } from './feedback'

   void feedback.ask('buyingUpgrade', 'after-first-purchase')

   // or wait for the player, e.g. to chain a series
   const result = await feedback.ask('playMore', 'round-2-complete')
   ```

With `authoritativeMultiplayer` your `main()` runs on the server too. If your scene has no
server logic, start it with `if (isServer()) return` so the scene code runs only for players.

To update to a newer version, replace `src/feedback/lib/` with the new one; `questions.ts` stays yours.

`ask()` queues the Question and shows it once nothing else is on screen and the server is up
(~15 s on a cold start). It resolves to `submitted`, `skipped`, `failed` (could not be saved) or
`not-shown`: already shown at this trigger this visit (pass `{ repeat: true }` to allow it), or
the server did not come up within 2 minutes. A typo in the id is a compile error.

The panel uses its own UI renderer, so your `ReactEcsRenderer.setUiRenderer` stays yours.

## Question bank

[src/feedback/lib/bank.ts](src/feedback/lib/bank.ts): 20 Questions selected for the pilot, in
sections (`coreMechanic`, `coreLoop`, `social`, `motivation`, `world`, `technical`). Each comes
with its rating scale, the moment it is meant for, what the answer tells you, and its code in the research doc. The full
research bank: [player-feedback-question-bank-2026-09.md](player-feedback-question-bank-2026-09.md).

## Tips

- **Make it about your game.** Bank texts use generic words — *the main activity*, *the goal*,
  *the rewards*, *the important objects*. Players answer better when they recognise what is
  asked, so swap them for your own. A reworded Question goes under your own id, with its own
  `commentPrompt` (it usually repeats the same generic word):

  ```ts
  // bank: repeatLoop 'How enjoyable was repeating the main activity?'
  coinRounds: {
    text: 'How enjoyable was collecting coins round after round?',
    commentPrompt: 'What made the later rounds more or less fun? (optional)'
  }
  ```

  The demo does this: `coinSpotting` in [questions.ts](src/feedback/questions.ts) is bank
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
2. Collect coins, or wait for **DEBUG · server online** and press an **Ask** button.
3. *Thanks* means the server received the Response and buffered it; without an ack the client
   resends every 3 s (deduped by id) and shows *Could not save* after 30 s.
4. The server flushes buffered Responses to Storage at most once a minute, and immediately when
   the last player leaves (it stays up ~2 min after that). Copy the CSV from the scene storage UI
   (Creator Hub → Manage → ⋮ → View Storage), or follow `npm run server-logs`.

Local preview (`npm start`) writes to `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`,
not to production Storage.

## Stored CSV

`fb:csv:0001`, `fb:csv:0002`, … — each part up to 400 KB (~2 500 rows; Storage caps a value at
512 KB), `fb:csv-writing-part` holds the number of the part being written. The World's scene Storage is 10 MB in
total, shared by all its scenes.

```csv
id,timeUtc,version,questionId,questionText,trigger,rating,comment,secondsInScene,playersInScene,address,isGuest,platform
mfqz8k2x4f7a,2026-09-30 12:27:33,x7q2mdk4ea,playMore,How interested are you in playing more right now?,debug,5,kind of yes,42,1,0x…,true,desktop
```

- Empty `rating` and `comment`: the player pressed Skip or closed the panel.
- `version`: tail of the deployed entity id, new on every deploy (`preview` locally).
- `questionText`: the wording the server shipped with, so edited Questions never mix with old answers.
- `trigger`: the label passed to `feedback.ask(questionId, trigger)` (`debug` for the debug buttons).
- `secondsInScene`: from the player's scene load to the answer, reported by the client.
- `playersInScene`: players in the scene when the server received the answer (solo vs group).
- `id` dedupes client resends and merges rows when two server instances overlap after a redeploy.
- `platform` is self-reported by the client.
- Comments are flattened to one line, and a leading `= + - @` is prefixed with `'` so spreadsheets
  don't run it as a formula.
- Buffered Responses live in server memory until flushed: a server crash loses up to a minute of them.
