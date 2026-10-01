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

1. Copy [src/feedback/](src/feedback) into your `src/`. Don't edit it, so a newer version can be
   copied over it.
2. Create your Question series, e.g. `src/feedback-questions.ts`:

   ```ts
   import { QUESTION_BANK, createFeedback } from './feedback'

   export const feedback = createFeedback({
     questions: {
       T01: QUESTION_BANK.T01, // from the bank, as is
       SHOP01: { text: 'How easy or difficult was it to buy an upgrade?' } // your own
     },
     debug: true // "Ask <id>" buttons top-left; turn off before release
   })
   ```

3. In `main()`, on the client and the server alike:

   ```ts
   export async function main() {
     feedback.start()
     if (isServer()) return
     // …your scene
   }
   ```

4. Ask wherever the moment happens. The trigger names that moment and goes to the CSV:

   ```ts
   void feedback.ask('SHOP01', 'after-first-purchase')

   // or wait for the player, e.g. to chain a series
   const result = await feedback.ask('T01', 'round-2-complete')
   ```

`ask()` queues the Question and shows it once nothing else is on screen and the server is up
(~15 s on a cold start). It resolves to `submitted`, `skipped`, `failed` (could not be saved) or
`not-shown`: already shown at this trigger this visit (pass `{ repeat: true }` to allow it), or
the server did not come up within 2 minutes. A typo in the id is a compile error.

The panel uses its own UI renderer, so your `ReactEcsRenderer.setUiRenderer` stays yours.

## Question bank

[src/feedback/bank.ts](src/feedback/bank.ts): 20 Questions selected for the pilot, with the
moment each is meant for. Use them as they are; to reword one, copy it into your series under
your own id. Never change a live Question's text under the same id — answers to different
wordings would share it. The full research bank:
[player-feedback-question-bank-2026-09.md](player-feedback-question-bank-2026-09.md).

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
mfqz8k2x4f7a,2026-09-30 12:27:33,x7q2mdk4ea,F01,How easy or difficult was it to work out what to do first?,debug,5,kind of yes,42,1,0x…,true,desktop
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
