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
**Questions** asked together at one **Trigger** (`feedback.ask([...ids], trigger)`): one panel, one **Question** after another, with a progress bar ("1/3"). Next and Back move between **Questions**, answers stay on the client until Submit on the last one sends them together. Skip (first **Question** only) passes on that **Question** and moves on. Closing ends the **Group**: answers kept with Next are still sent, the **Question** on screen is skipped, and the **Questions** not reached get no **Response**. A single **Question** is a **Group** of one, shown without the bar.
_Avoid_: series (that is the whole set in `questions.ts`), page, survey

**Intro**:
The opt-in where the creator introduces themselves and asks for feedback. In **Dynamic** mode the scene shows it once per visit with `feedback.intro()`, on arrival: **Give feedback** makes the player a **Participant**, **Skip** or closing marks them out. The game's **Questions** wait while it is open. `feedback.leaveFeedback()` (the player chose to give feedback) shows it on every call; there a yes also counts for the visit, a Skip only closes that **Group**. Not a **Response**, but each answer to it is a CSV row (`intro`, accepted or declined), to count how many players agree to answer.
_Avoid_: consent form, opt-in dialog

**Participant**:
A player who takes part in the playtest this visit: said yes to the **Intro**, or enrolled by the scene (`feedback.enroll()`, e.g. players the creator picked). With `ASK_PARTICIPANTS_ONLY`, only **Participants** get the game's **Questions**; without it everyone does, except players who said no to the **Intro**.
_Avoid_: consent (one way in, not the state), tester

**Dynamic / Static**:
The two ways a scene collects feedback. _Dynamic_: the game asks **Questions** at gameplay moments (`feedback.ask()`), to **Participants** (usually made by the **Intro** on arrival). _Static_: the player chooses to give feedback (a button, a kiosk, an area); `feedback.leaveFeedback(batch, trigger)` shows the **Intro** and then a batch prepared for it, every time. A scene may use both.
_Avoid_: automatic / manual

**Question bank**:
The default **Questions** we ship, each with a fixed id. A creator builds a **Question series** by picking from it and adding their own.
_Avoid_: presets, templates

**Trigger**:
The creator's label for the gameplay moment a **Question** is asked at, e.g. `after-first-round`. The same **Question** asked at different **Triggers** yields separately comparable **Responses**. By default a player sees a **Question** at most once per visit for the same **Trigger**.
_Avoid_: event, moment

**Response**:
The record of one player's reaction to one shown **Question**: either _submitted_ (a rating, a comment, or both) or _skipped_ (neither — Skip pressed, or the panel closed, which discards anything entered). Every shown **Question** yields exactly one **Response**, and every **Response** is persisted.
_Avoid_: answer (ambiguous with a submitted-only reaction), feedback

**Submit / Next / Back / Skip**:
Two buttons. Right: **Next**, or **Submit** on the last **Question** of a **Group**, enabled once a rating or a comment exists — a comment without a rating is still a submission. Left: **Skip** on the first **Question** (skips that **Question** only; on a single **Question** this closes the panel), **Back** on later ones.

**Feedback CSV**:
The creator-facing record of all **Responses** of a scene, one row per **Response**, split into numbered parts once a part nears the storage value limit.
_Avoid_: export, report
