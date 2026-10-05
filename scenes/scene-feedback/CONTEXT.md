# Scene feedback

In-world player feedback for Decentraland scenes: a creator asks players questions, players rate and comment, the creator reads the answers.

## Language

**Question**:
One creator-defined prompt: text, a 1–5 rating on a **Scale**, and an optional comment. Shown to the player one at a time.
_Avoid_: survey item, form field

**Scale**:
The five labels a **Question**'s rating is read with (1 → 5), e.g. EASE: Very difficult … Very easy. Shared across **Questions** by code; a **Question** may also carry five labels of its own. Stored with every **Response**.
_Avoid_: stars (the visual, not the meaning), options

**Question series**:
The ordered set of **Questions** a creator configures for a scene. Not shown as one form: the creator decides when each **Question** appears (e.g. one at arrival, the next after the core mechanic).
_Avoid_: survey, questionnaire

**Group**:
**Questions** asked together at one **Trigger** (`feedback.ask([...ids], trigger)`): one panel, one **Question** after another, with a progress bar ("1/3"). Skip or Next moves on; closing the panel ends the **Group**, and the **Questions** not reached get no **Response**. A single **Question** is a **Group** of one, shown without the bar.
_Avoid_: series (that is the whole set in `questions.ts`), page, survey

**Intro**:
The once-per-visit opt-in shown before the first **Question** the game asks: the creator introduces themselves and asks for feedback. **Give feedback** lets the game's **Questions** through; **Skip** (or closing) silences them for the rest of the visit. Not shown, and not needed, when the player opens a **Question** themselves with Leave feedback. Not recorded as a **Response**.
_Avoid_: consent form, opt-in dialog

**Question bank**:
The default **Questions** we ship, each with a fixed id. A creator builds a **Question series** by picking from it and adding their own.
_Avoid_: presets, templates

**Trigger**:
The creator's label for the gameplay moment a **Question** is asked at, e.g. `after-first-round`. The same **Question** asked at different **Triggers** yields separately comparable **Responses**. By default a player sees a **Question** at most once per visit for the same **Trigger**.
_Avoid_: event, moment

**Response**:
The record of one player's reaction to one shown **Question**: either _submitted_ (a rating, a comment, or both) or _skipped_ (neither — Skip pressed, or the panel closed, which discards anything entered). Every shown **Question** yields exactly one **Response**, and every **Response** is persisted.
_Avoid_: answer (ambiguous with a submitted-only reaction), feedback

**Submit / Skip**:
One action button whose label reflects state: **Skip** while nothing is entered, **Submit** once a rating or a comment exists (**Next** instead of **Submit** before the last **Question** of a **Group**). A comment without a rating is still a submission.

**Feedback CSV**:
The creator-facing record of all **Responses** of a scene, one row per **Response**, split into numbered parts once a part nears the storage value limit.
_Avoid_: export, report
