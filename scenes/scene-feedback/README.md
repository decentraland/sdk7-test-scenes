# Scene Feedback — MVP iteration 1

A Question with a 1–5 rating and an optional comment. **Skip** turns into **Submit** once a
rating or a comment is entered. Every Response — submitted or skipped — ends up as a row of a
CSV that the Authoritative Server keeps in scene Storage. Vocabulary: [CONTEXT.md](CONTEXT.md).

Requires `@dcl/sdk@auth-server` and `"authoritativeMultiplayer": true` (client code cannot
write Storage; see [research-storage-options.md](research-storage-options.md)).

## Test

1. `worldConfiguration.name` in `scene.json` is the target World. `npm install`, `npm run deploy`.
2. In the scene, wait for **DEBUG · server online** (top-left, ~15 s on a cold start), then
   press **Ask F01**. The button stays disabled until the server heartbeat is live, because
   `room.send` is fire-and-forget and messages sent before the server is up are lost.
3. Rate and/or comment, press **Submit** (or **Skip**). *Thanks* means the server received the
   Response and buffered it; without an ack the client resends every 3 s (deduped by id) and
   shows *Could not save* after 30 s.
4. The server flushes buffered Responses to Storage at most once a minute, and immediately when
   the last player leaves (it stays up ~2 min after that). Copy the CSV from the scene storage UI
   (Creator Hub → Manage → ⋮ → View Storage), or follow `npm run server-logs`.

Local preview (`npm start`) writes to `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`,
not to production Storage.

## Stored CSV

`fb:csv:0001`, `fb:csv:0002`, … — each part up to 400 KB (~2 500 rows; Storage caps a value at
512 KB), `fb:csv-current` holds the part being written. The World's scene Storage is 10 MB in
total, shared by all its scenes.

```csv
id,timeUtc,version,questionId,questionText,trigger,rating,comment,secondsInScene,playersInScene,address,isGuest,platform
mfqz8k2x4f7a,2026-09-30 12:27:33,x7q2mdk4ea,F01,How easy or difficult was it to work out what to do first?,debug,5,kind of yes,42,1,0x…,true,desktop
```

- Empty `rating` and `comment`: the player pressed Skip or closed the panel.
- `version`: tail of the deployed entity id, new on every deploy (`preview` locally).
- `questionText`: the wording the server shipped with, so edited Questions never mix with old answers.
- `trigger`: the label passed to `askQuestion(questionId, trigger)` (`debug` for the debug buttons).
- `secondsInScene`: from the player's scene load to the answer, reported by the client.
- `playersInScene`: players in the scene when the server received the answer (solo vs group).
- `id` dedupes client resends and merges rows when two server instances overlap after a redeploy.
- `platform` is self-reported by the client.
- Comments are flattened to one line, and a leading `= + - @` is prefixed with `'` so spreadsheets
  don't run it as a formula.
- Buffered Responses live in server memory until flushed: a server crash loses up to a minute of them.

## Editing questions

`src/shared/questions.ts`. Bump the id when the wording changes so answers to different
wordings are never mixed. More candidates: [question bank](player-feedback-question-bank-2026-09.md).
