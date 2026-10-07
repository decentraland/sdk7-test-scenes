# Question guide

When and how to ask, and how to read the answers. The Questions themselves: [QUESTION_BANK.md](QUESTION_BANK.md). Distilled from
the playtest research (Sept 2026) and DCL studio playtest reports.

## When to ask

- **At a natural pause** right after the experience the Question is about: after a round, a
  purchase, a failure screen. Not mid-jump or mid-fight.
- **Only after the player met the situation**, not necessarily succeeded at it. If the game
  can't tell whether they did, don't ask that Question.
- **Not only winners.** Players who failed, gave up or left early show the most. Trigger on
  failing and leaving too, and offer `leaveFeedback()` for anyone.
- **Few per visit**: one outcome Question (E01, E02, T01 or T09) plus two or three about the part
  you are testing. Don't re-ask after every action.
- **Saying no costs nothing**: Skip and × never take progress away.

## How to word it

- **One topic per Question.** "How clear and fun was it?" is two Questions.
- **Name your thing**: "the main activity" → "bowling". New wording, new id.
- **Ask about what the player lived through**, not your intent ("did you feel the intended
  mood?"), a hypothetical ("would you play without rewards?") or other people ("how welcoming
  is it to new players?").
- **Neutral comment prompts**, open to good and bad. Default: "What most affected your rating?
  (optional)". Don't ask only low raters to explain.
- **5 is not always the goal**: an expert may feel no improvement, a hard challenge should stay
  hard. FIT (difficulty, pace, round length) has no direction: the comment says which way.
- **Bugs aren't ratings.** Lost progress, wrong scores, crashes need reproduction: ask "What
  happened, and what were you trying to do?" and check the logs.

## Reading the CSV

- Look at how many players picked each of 1–5, with the comments. A mean is a summary, not the result.
- Never average different Questions into one score, or merge different wordings, scales or triggers.
- Small samples: counts, not percentages, and no ranking between scenes.
- Only opted-in players answer; they are not all your visitors.
- "Interested in coming back" is not an actual return.
- A low score shows where to look, not the cause or the fix. Watch players there, change it,
  ask the same Question at the same trigger again.
- At hosted playtests, note when you explained something before the player answered.

## Ready-made sets

Codes from [QUESTION_BANK.md](QUESTION_BANK.md).

| Testing | Codes | When |
|---|---|---|
| First playable | F01, E01, E03, C01, T01 | After a first attempt; drop E01/E03 if the activity was never reached |
| Onboarding | F01, F02, C01, F05 | After trying to start, including failing to |
| Difficulty and failure | H01, H03, H05, H06 | After an unsuccessful attempt |
| Repeated loop | E01, P06, P01, P04 | After repeated play; drop P04 without progression |
| Co-op | S03, S04, S06, S08 | After joining and playing with a team |
| Solo | S09, F01, W08, T01 | After a solo visit; W08 only after exploring |
| Gallery or social space | E02, C06, W04, Q01 | During or after a visit; drop C06 if there was no text |
| Coming back | E02, T02, T03 | Near the end of a repeatable experience |
| Mobile | C10, C06, Q02, Q08 | On a touch device, after using the interface |
| Match entry and turns | S03, S11, S12 | After joining a queued or turn-based activity; F11 for drop-in rounds |
| Resources and upgrades | P11, A04, E03, T03 | Each after its own step |
| Visibility and sound | C08, Q12, Q11 | After play with audio on |
