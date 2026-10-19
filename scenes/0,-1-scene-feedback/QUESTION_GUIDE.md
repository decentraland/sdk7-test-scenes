# Question guide

Choose a small set of questions that helps you decide what to change in your scene.

## Choose what to investigate

1. **Name the decision:** for example, whether players need clearer instructions for starting bowling.
2. **Pick questions about that experience:** use a starting set below or browse the
   [question bank](QUESTION_BANK.md). Drop questions that do not support your goal.
3. **Adapt the wording and choose the moment:** use your scene's actions and objects,
   and ask after the player has encountered them.

You should have a question, a reason to ask it, and an event at which the player can answer it.
Use the [integration recipes](EXAMPLES.md) to connect that event to the module.

## Ready-made sets

Use these as starting points, not required questionnaires. Codes refer to
[QUESTION_BANK.md](QUESTION_BANK.md); select only the questions relevant to your test.

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

## When to ask

- **At a natural pause** right after the experience the Question is about: after a round, a
  purchase, a failure screen. Not mid-jump or mid-fight.
- **Only after the player met the situation**, not necessarily succeeded at it. If the game
  can't tell whether they did, don't ask that Question.
- **Include unsuccessful attempts.** Ask players who failed or abandoned an activity too,
  while they are still in the scene and able to answer. Offer `leaveFeedback()` as another route.
- **Keep the set small:** a starting point is one outcome Question (E01, E02, T01, T02 or T09)
  plus two or three about the part you are testing. Use fewer when they answer your goal;
  avoid re-asking after every action.
- **Saying no costs nothing**: Skip and × never take progress away.

## How to word it

- **One topic per Question.** "How clear and fun was it?" is two Questions.
- **Name your thing**: "the main activity" → "bowling". Adapt the `commentPrompt` too.
  When changing wording already used in a playtest, give it a new ID so results stay separate.
- **Ask about what the player lived through**, not your intent ("did you feel the intended
  mood?"), a hypothetical ("would you play without rewards?") or other people ("how welcoming
  is it to new players?").
- **Neutral comment prompts**, open to good and bad. Default: "What most affected your rating?
  (optional)". Don't ask only low raters to explain.
- **Bugs aren't ratings.** Lost progress, wrong scores, crashes need reproduction: ask "What
  happened, and what were you trying to do?" and check the logs.

## Reading the CSV

For column definitions and response statuses, use the README's
[CSV reference](README.md#csv-fields). Then work through these steps:

1. **Choose comparable responses.** Keep different questions, wordings, scales and triggers
   separate. At hosted playtests, note whether you explained something before an answer.
2. **Inspect the distribution and comments.** Count how many players chose each label.
   For small samples, report counts rather than percentages. A mean alone hides the distribution;
   do not average different questions into one score or rank scenes from small samples.
3. **Check what the scale means.** A higher score is not always the goal: an expert may feel
   no improvement, and a hard challenge may be intentional. FIT scores indicate fit;
   use comments to learn whether difficulty, pace or length should increase or decrease.
4. **Choose what to investigate next.** A low score identifies a place to look, not its cause
   or the fix. Observe players there, make a change, then ask the same question at the same trigger.

Keep two limits in mind when drawing conclusions:

- Players who answer may differ from visitors who do not.
- Reported interest in returning is not evidence that the player actually returned.

## Integration recipes

Use [EXAMPLES.md](EXAMPLES.md) for complete `questions.ts` definitions and scene-event wiring:

- [Consent now, onboarding feedback later](EXAMPLES.md#1-intro-now-question-after-play).
- [Permission and the first Question after a game](EXAMPLES.md#2-intro-immediately-followed-by-a-question).
- [Player-initiated feedback](EXAMPLES.md#3-feedback-opened-by-the-player),
  [selected testers](EXAMPLES.md#4-selected-testers-without-an-intro), and
  [mixed rating/text Groups](EXAMPLES.md#5-a-mixed-group-after-the-first-game).

The bowling recipes cover the goal behind the first-turn and first-game Questions. Adapt
these to the experience your players actually had, including failed or abandoned attempts.
