# Question guide

Choose a small set of questions that helps you decide what to change in your scene.

## Choose what to investigate

1. **Name the decision:** for example, whether players need clearer instructions for starting bowling.
2. **Pick questions about that experience:** choose a [suggested set](QUESTION_BANK.md#ready-made-sets)
   or browse the [question bank](QUESTION_BANK.md). Drop questions that do not support your goal.
3. **Adapt the wording and choose the moment:** use your scene's actions and objects,
   and ask after the player has encountered them.

You should have a question, a reason to ask it, and an event at which the player can answer it.
Use the [integration recipes](EXAMPLES.md) to connect that event to the module.

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
- **For unexpected issues**, put an open discovery prompt before questions suggesting
  specific problems; earlier questions can cue later answers.

## Reading the CSV

For column definitions and response statuses, use the README's
[CSV reference](README.md#csv-fields). Keep a short note alongside the CSV: who your
intended players are, whether answers came from invited testers or ordinary visitors,
the invitation route/eligibility, and any reward terms. Identify intended players who may
be missing, and retain changed recruitment or reward conditions when comparing tests.

Then work through these steps:

1. **Choose comparable responses.** Keep different questions, wordings, scales and triggers
   separate. For comparisons, keep question order and prompting context comparable too;
   at hosted playtests, record any explanation given before an answer.
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
