# In-world player feedback: research and question bank

Version 3 · 2026-09-25 · Expanded with DCL studio playtest findings; ready for a comprehension pilot.

## The recommendation

Give creators a **menu of questions, not a mandatory questionnaire**. Start with 3–5 relevant questions per player at a natural pause. That number is a starting design choice for this MVP, not a scientifically established optimum.

This document contains **113 question candidates, including a prioritized Top 20 in four groups of five**. The Top 20 is an editorial selection for this product: broadly useful, understandable, tied to a creator decision, and compatible with a rating plus optional text. It is not an industry ranking or a validated instrument. Thirteen context-specific additions come from the DCL studio playtest archive; their evidence and selection rationale appear below.

For each survey, pick one outcome question, such as enjoyment, and a few questions about the part of the game being tested. Do not show all 20, combine all four groups, or automatically unlock later groups by development stage. A social prototype may need a social question immediately.

**The player sees only:** a concrete question, a labeled 1–5 scale, and an optional comment. The conditions, explanations, IDs, and sources below are for creators.

Example, after a bowling attempt:

> How enjoyable was bowling?
>
> 1 Not at all enjoyable · 2 Slightly enjoyable · 3 Moderately enjoyable · 4 Very enjoyable · 5 Extremely enjoyable
>
> What most affected your rating? (optional)

Replace “the game,” “main activity,” and bracketed examples with the player's actual activity where needed. Do not send placeholders to players.

## Scope from the kickoff

The September 25 kickoff ends with a deliberately small implementation: customizable scene code or a template, an in-world rating and text field, and CSV export. A Creator Hub form builder and reporting dashboard are not requirements for this MVP. The initial plan is a pilot with three studios and discussion of the shortlist with Tom.

The meeting explored playtime-based confidence and incentives; this document does not turn those ideas into committed features. A long visit does not automatically make a player's feedback more valid. Short visits can reveal onboarding failures.

Our later discussion expands the research bank beyond the kickoff's shortlist. It does not expand what a player must answer or require a larger technical product.

Source: supplied kickoff transcript, especially 00:41:43–00:56:34; meeting summary, “Technical Scope and MVP Implementation” and “Trigger Mechanics, Timeline, and Responsibilities.”

## Top 20 — four groups of five

Scale codes expand into exact labels in the next section. IDs point to the matching bank entries. A condition means **the player must have encountered the relevant situation**, not necessarily succeeded.

### 1–5 · Best starting set for an interactive game

| # | Question | Scale | Show when | What the creator learns |
|---|---|---|---|---|
| 1 · F01 | How easy or difficult was it to work out what to do first? | EASE | After trying to start, including an unsuccessful attempt | Whether entry guidance needs investigation. |
| 2 · E01 | How enjoyable was the main activity? | ENJOY | After trying that activity | Whether the activity itself appeals, separately from the rest of the visit. |
| 3 · E03 | How clear was the result of your actions? | CLEAR | After using the main action | Whether players can read the game's response. |
| 4 · C01 | How easy or difficult was it to use the controls? | EASE | After using the controls | Whether input friction may be getting in the way of play. |
| 5 · T01 | How interested are you in playing more right now? | INTEREST | At a pause after a meaningful attempt | Immediate desire to continue, not future retention. |

For a very short survey, use #1, #2, and one question about the current design concern. #5 is useful but can also reflect available time, fatigue, or an interrupted visit.

### 6–10 · Goals, challenge, choices, and pace

| # | Question | Scale | Show when | What the creator learns |
|---|---|---|---|---|
| 6 · F02 | How clear was the main goal? | CLEAR | After the goal was presented, even if it was not understood | Whether the objective is legible. |
| 7 · E04 | How easy or difficult was it to tell how well you were doing? | EASE | After an activity with a score or other performance feedback | Whether players can judge their performance. |
| 8 · H01 | How well did the difficulty suit you? | FIT | After an intended challenge | Whether difficulty felt appropriate; the score alone cannot say too easy or too hard. |
| 9 · A01 | How interesting were the choices you had to make? | INTERESTING | After facing a decision | Whether decision-making is engaging, not just whether choices exist. |
| 10 · P01 | How well did the pace of the game suit you? | FIT | After enough play to experience its rhythm | Whether pacing needs investigation; ask the comment for direction. |

### 11–15 · Learning, freedom, and repeated play

| # | Question | Scale | Show when | What the creator learns |
|---|---|---|---|---|
| 11 · H04 | How much did you feel you improved while playing? | AMOUNT | After several attempts at a learnable activity | Perceived learning; not a test of actual skill or a requirement to improve every session. |
| 12 · P06 | How enjoyable was repeating the main activity? | ENJOY | After repetition actually occurred | Whether repeated play remains enjoyable, without assuming novelty is necessary. |
| 13 · A02 | How satisfied were you with the freedom to try different approaches? | SATISFIED | After an activity intended to allow different approaches | Whether freedom meets the player's expectations. |
| 14 · H05 | After your last failed attempt, how clear was what you could try next? | CLEAR | After a failed attempt | Whether failure provides a readable next step. |
| 15 · P10 | After completing a goal, how clear was what to do next? | CLEAR | After a goal, when more play is intended | Whether the transition to the next activity is understandable. |

### 16–20 · Atmosphere, social play, and a future visit

| # | Question | Scale | Show when | What the creator learns |
|---|---|---|---|---|
| 16 · W04 | How enjoyable was the atmosphere? | ENJOY | After experiencing the space | Whether the mood appeals; this does not test whether it matches the author's intended mood. |
| 17 · S06 | How enjoyable was playing with other people? | ENJOY | After actual shared play | Social-play enjoyment, including low ratings; not the causal benefit of adding multiplayer. |
| 18 · S09 | How enjoyable was playing on your own? | ENJOY | After actual solo play | Whether the solo experience holds up. |
| 19 · T02 | How interested are you in coming back another day? | INTEREST | Near the end of a visit, if repeat visits are a design goal | Stated future interest, not a retention prediction. |
| 20 · T03 | How clear is what you could do on another visit? | CLEAR | After a visit to a repeatable experience | Whether a next-visit opportunity is understood, separately from whether it is wanted. |

For all 20, the neutral default comment is **“What most affected your rating? (optional)”**. Useful targeted replacements:

- Difficulty: “What made the difficulty feel right or wrong for you?”
- Pace: “What did you think of the pace?”
- Failure: “What would you try next, if anything?”
- Future visit: “What, if anything, would bring you back?”

Do not force explanations for low ratings, or ask only dissatisfied players to comment.

## What 1–5 means

These are proposed labels for this custom bank, not the response scales of PXI, miniPXI, or GUESS. Use the appropriate labels instead of five unexplained stars.

| Code | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| EASE | Very difficult | Difficult | Neither easy nor difficult | Easy | Very easy |
| CLEAR | Not at all clear | Slightly clear | Moderately clear | Very clear | Extremely clear |
| ENJOY | Not at all enjoyable | Slightly enjoyable | Moderately enjoyable | Very enjoyable | Extremely enjoyable |
| INTEREST | Not at all interested | Slightly interested | Moderately interested | Very interested | Extremely interested |
| INTERESTING | Not at all interesting | Slightly interesting | Moderately interesting | Very interesting | Extremely interesting |
| SATISFIED | Very dissatisfied | Dissatisfied | Neither satisfied nor dissatisfied | Satisfied | Very satisfied |
| SATISFY | Not at all satisfying | Slightly satisfying | Moderately satisfying | Very satisfying | Extremely satisfying |
| FIT | Very poorly | Poorly | Neither poorly nor well | Well | Very well |
| AMOUNT | Not at all | A little | Somewhat | A lot | A great deal |
| WELCOME | Not at all welcome | Slightly welcome | Moderately welcome | Very welcome | Extremely welcome |
| WORTH | Not at all worthwhile | Slightly worthwhile | Moderately worthwhile | Very worthwhile | Extremely worthwhile |
| COMFORT | Very uncomfortable | Uncomfortable | Neither comfortable nor uncomfortable | Comfortable | Very comfortable |
| FAIR | Very unfair | Unfair | Neither fair nor unfair | Fair | Very fair |
| CONFIDENT | Not at all confident | Slightly confident | Moderately confident | Very confident | Extremely confident |

Implementation guidance for the pilot:

- At minimum, keep endpoint labels visible and show the selected value's full label. Prefer all five labels when they fit, including on the device being tested. If the component cannot label answers, put endpoints in the question text.
- Do not preselect a rating. An unanswered item is not 0 or 3. The middle of EASE means neutral; the middle of ENJOY means moderate enjoyment, not neutrality.
- Allow skipping. If feasible, offer “I didn't experience this / can't judge” separately from 1–5. That is an implementation suggestion, not an assumption about an existing control.
- If skip or non-rating responses are unavailable, only use questions whose applicability is known from the trigger. For example, show the failure question after failure; otherwise omit it.
- Five means more favorable, or more of the named experience. It is **not always a design target**: an expert may feel no improvement, and an intentional challenge should not become effortless. Never average different questions into a single “game quality” score.
- For difficulty and pace, FIT deliberately trades directional detail for compatibility with stars. Use the optional comment to find out which way to adjust. Without a comment, do not guess.
- “Too easy → just right → too hard” is a valid different kind of question, but not a five-star quality scale. It is outside this bank's rating convention.

Clear options, a consistent direction, and single-topic questions follow [UserTesting's rating guidance](https://help.usertesting.com/hc/en-us/articles/11880424317853-Rating-Scale-questions-UserTesting). Concrete wording and answerable, non-overlapping options follow [Pew's questionnaire guidance](https://www.pewresearch.org/writing-survey-questions/). The particular labels and MVP trade-offs above are our proposal and need a comprehension check.

## The bank: 113 candidates

These are original, editable prompts, not copied questionnaire items. “Investigate” identifies a possible next investigation, **not a diagnosis established by the score**. Each row includes its exposure condition; the default comment remains “What most affected your rating? (optional).”

Questions in the same group may be alternatives. Do not ask near-neighbors together unless the distinction matters to the test.

### F · Starting, goals, and finding your way

Research basis: functional clarity in PXI; task-oriented iteration in RITE; the local first-minutes references. See the source register below.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| F01 | How easy or difficult was it to work out what to do first? | EASE | Tried to start → entry guidance. |
| F02 | How clear was the main goal? | CLEAR | Encountered the goal presentation → objective clarity. |
| F03 | How clear were the rules? | CLEAR | Tried an activity with rules → rule explanation. Name the activity. |
| F04 | How easy or difficult were the instructions to understand? | EASE | Saw the instructions → language and explanation. |
| F05 | How easy or difficult was it to find things you could interact with? | EASE | Looked for interactions → affordances and visual cues. |
| F06 | How easy or difficult was it to start the activity? | EASE | Tried to enter a round or activity → start flow, not understanding the goal. |
| F07 | How clear was when the activity was finished? | CLEAR | Encountered an ending → completion cues. |
| F08 | How easy or difficult was it to find the place you wanted to go? | EASE | Tried to reach a destination → navigation. |
| F09 | How easy or difficult was it to find help when you needed it? | EASE | Needed help, whether found or not → help discoverability. |
| F10 | After the tutorial, how confident were you about playing on your own? | CONFIDENT | Finished a tutorial → perceived readiness; observe independent play separately. |
| F11 | When you arrived, how clear was what was happening in the current round? | CLEAR | Arrived during an active round → join-in-progress orientation; distinct from learning the game's general rules. |

### C · Controls and interface

Research basis: PXI's control dimension; usability coverage in GUESS; local mobile and game-feel references.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| C01 | How easy or difficult was it to use the controls? | EASE | Used controls → overall input friction. |
| C02 | How easy or difficult was it to move where you wanted? | EASE | Tried movement → movement control. |
| C03 | How easy or difficult was it to aim where you wanted? | EASE | Tried aiming → precision and aiming assistance. |
| C04 | How easy or difficult was it to control the camera? | EASE | Used a controllable camera → camera input. |
| C05 | How easy or difficult was it to select the object you wanted? | EASE | Tried object selection → targeting and selection feedback. |
| C06 | How easy or difficult was it to read the text? | EASE | Encountered text → text size, contrast, and presentation. |
| C07 | How easy or difficult was it to find the menu option you needed? | EASE | Looked for an option → menu organization. |
| C08 | How easy or difficult was it to notice important information during play? | EASE | Information appeared during action → visual hierarchy and timing. |
| C09 | How clear was what each button would do? | CLEAR | Encountered the relevant buttons → labels and icons. |
| C10 | How easy or difficult was it to tap the button you wanted? | EASE | Used touch controls → touch-target size and spacing. |
| C11 | How clear was whether to tap or hold the button? | CLEAR | Tried a named interaction where the input gesture matters → instruction clarity, not input responsiveness. Identify the action in the question; use “click” instead of “tap” where appropriate. |

### E · Enjoyment and the response to an action

Research basis: PXI feedback, miniPXI enjoyment, and game-feel lenses. Enjoyment is a useful outcome even when it does not explain its own cause.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| E01 | How enjoyable was the main activity? | ENJOY | Tried it → appeal of the main activity. Name it, e.g. bowling. |
| E02 | Overall, how enjoyable was this visit? | ENJOY | At a pause near the end → whole-visit outcome; an alternative to E01. |
| E03 | How clear was the result of your actions? | CLEAR | Used the main action → readable cause and effect. |
| E04 | How easy or difficult was it to tell how well you were doing? | EASE | Received performance feedback → score or success communication. |
| E05 | How satisfying did [the action] feel? | SATISFY | Tried a named action, e.g. hitting the ball → moment-to-moment feel. |
| E06 | How satisfying did moving around feel? | SATISFY | Moved around → movement feel, distinct from control difficulty. |
| E07 | How clear was why you got that result? | CLEAR | After a named outcome → understanding its cause, not merely noticing it. |
| E08 | How easy or difficult was it to tell when an action worked? | EASE | Made a success-capable attempt → success cues. |
| E09 | How easy or difficult was it to tell when an action did not work? | EASE | An action failed → failure cues. |
| E10 | How well did the activity hold your attention? | FIT | After trying it for a while → attention; not a validated immersion measure. |
| E11 | When you couldn't [water the plant], how clear was the reason? | CLEAR | Tried an action that was blocked or unavailable → explanation of limits or missing requirements. Do not assume the restriction was intentional or that the cause is known. |

### H · Challenge, fairness, and learning

Research basis: PXI challenge/mastery themes; local difficulty-skill-balance and skill-atoms discussions. Do not assume difficulty fit causes enjoyment or that every experience should be challenging.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| H01 | How well did the difficulty suit you? | FIT | Tried a challenge → perceived fit; comment supplies direction. |
| H02 | How clear was what you needed to do to succeed? | CLEAR | Faced a challenge → success conditions. |
| H03 | How fair did the result feel? | FAIR | After a result with meaningful stakes → perceived fairness, not proof of system balance. |
| H04 | How much did you feel you improved while playing? | AMOUNT | Several attempts → perceived learning, interpreted with prior experience. |
| H05 | After your last failed attempt, how clear was what you could try next? | CLEAR | Failed an attempt → readable learning opportunity. |
| H06 | After your last failed attempt, how interested were you in trying again? | INTEREST | Failed an attempt → retry motivation. |
| H07 | How fair did the penalty for failing feel? | FAIR | Encountered a penalty → cost of failure. |
| H08 | How well did the time limit suit you? | FIT | Played under a time limit → time pressure. |
| H09 | How fair did the match with your opponent feel? | FAIR | Faced an opponent → perceived matchup quality. |
| H10 | How satisfied were you with how the difficulty increased? | SATISFIED | Encountered an intended increase → progression curve; not for a single fixed challenge. |
| H11 | After failing, how clear was what progress you kept? | CLEAR | Failed in a game with checkpoints or run progress → understanding of the reset boundary, even if nothing was kept; not whether progress loss was fair. |

### A · Choices, freedom, and expression

Research basis: autonomy themes in PXI and self-determination theory; the wiki's meaningful-choices lens. More options are not automatically better.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| A01 | How interesting were the choices you had to make? | INTERESTING | Faced a decision → engagement in choosing. |
| A02 | How satisfied were you with the freedom to try different approaches? | SATISFIED | Tried an open-ended activity → satisfaction with freedom. |
| A03 | How clear were the differences between your options? | CLEAR | Encountered alternatives → readability of choices. |
| A04 | Before choosing, how clear were the possible results? | CLEAR | Made a decision where consequences should be understandable → advance information. |
| A05 | How satisfied were you with how your choices affected the game? | SATISFIED | Saw consequences of choices → satisfaction with their effect. |
| A06 | How well could you express your own style? | FIT | Used an expressive feature → support for self-expression. |
| A07 | How satisfied were you with the customization options? | SATISFIED | Tried customization → adequacy of available options. |
| A08 | How easy or difficult was it to try a different approach? | EASE | Attempted to change approach → switching costs and restrictions. |
| A09 | How satisfied were you with the freedom to choose your own goals? | SATISFIED | Played a goal-selection or open-ended system → goal ownership. |
| A10 | How easy or difficult was it to change your mind after choosing? | EASE | Tried to revise a choice → reversibility; low ease can be deliberate. |

### P · Pace, progression, rewards, and repetition

Research basis: progress feedback in PXI; local loop, learning, and retention lenses. A familiar repeated activity can remain enjoyable without becoming novel.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| P01 | How well did the pace of the game suit you? | FIT | Experienced its rhythm → pacing. |
| P02 | How satisfied were you with the amount of waiting between activities? | SATISFIED | Encountered transitions or waiting → downtime. |
| P03 | How clear was your progress toward the goal? | CLEAR | Worked toward a goal → progress visibility, distinct from performance. |
| P04 | How satisfied were you with how quickly you made progress? | SATISFIED | Played a progression system → progress rate. |
| P05 | How satisfying were the rewards you received? | SATISFY | Received rewards → reward appeal. |
| P06 | How enjoyable was repeating the main activity? | ENJOY | Repeated it → sustained enjoyment. |
| P07 | How satisfied were you with the variety of activities? | SATISFIED | Tried the available activity mix → variety fit, not maximum variety. |
| P08 | How well did the length of a round suit you? | FIT | Finished or stopped a round → round length. |
| P09 | How satisfied were you with what you accomplished? | SATISFIED | At a stopping point → sense of accomplishment. |
| P10 | After completing a goal, how clear was what to do next? | CLEAR | Completed a goal and more play is intended → goal transition. |
| P11 | How clear was what you could use [coins] for? | CLEAR | Earned or encountered a named usable resource → resource purpose; do not ask this about a score with no intended spending or use. |
| P12 | How clear was when you could [water a plant] again? | CLEAR | Encountered a temporary limit → communication of when or under what condition the action becomes available again, not whether the wait is enjoyable. |

### W · World, story, sound, and atmosphere

Research basis: audiovisual and curiosity themes in PXI; narrative and aesthetic coverage in GUESS; local presence and experience-design lenses. A frightening or sad work need not be cheerful to succeed.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| W01 | How much did you like the look of the world? | AMOUNT | Saw it → visual appeal. |
| W02 | How much did you like the sound of the world? | AMOUNT | Heard it with audio on → audio appeal. |
| W03 | How well did the different parts of the world fit together? | FIT | Experienced several parts → perceived coherence. |
| W04 | How enjoyable was the atmosphere? | ENJOY | Experienced the space → appeal of its mood. |
| W05 | How clear was your role in the story? | CLEAR | Encountered a story role → role understanding. |
| W06 | How easy or difficult was the story to follow? | EASE | Encountered narrative content → story comprehension. |
| W07 | How interested were you in finding out what happened next in the story? | INTEREST | Reached an unresolved narrative moment → narrative curiosity. |
| W08 | How enjoyable was exploring the world? | ENJOY | Actually explored → exploration appeal. |
| W09 | How satisfying were the things you discovered? | SATISFY | Made discoveries → discovery payoff. |
| W10 | How well did the atmosphere fit this activity? | FIT | Experienced both → thematic fit; not knowledge of the creator's intent. |

### S · Shared play and being alone

Research basis: GUESS social connectivity; local social-design and relatedness lenses. Rate the situation experienced, not an imaginary multiplayer or solo version.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| S01 | How easy or difficult was it to tell what other players were doing? | EASE | Encountered players doing an activity → social legibility. |
| S02 | How easy or difficult was it to communicate with other players? | EASE | Tried communicating → communication friction. |
| S03 | How easy or difficult was it to join an activity with other players? | EASE | Tried joining, including unsuccessful attempts → joining flow. |
| S04 | How easy or difficult was it to coordinate with your teammates? | EASE | Tried a team activity → coordination support. |
| S05 | How clear was your role in the team? | CLEAR | Played a team activity with roles → responsibility clarity. |
| S06 | How enjoyable was playing with other people? | ENJOY | Shared play occurred → social enjoyment; not incremental multiplayer benefit. |
| S07 | How comfortable did you feel interacting with other players? | COMFORT | Interacted → social comfort, without requiring personal disclosures. |
| S08 | How satisfied were you with your contribution to the team? | SATISFIED | Played on a team → perceived contribution. |
| S09 | How enjoyable was playing on your own? | ENJOY | Solo play occurred → solo enjoyment; other players merely being visible is not shared play. |
| S10 | How welcome did you feel when you joined the group? | WELCOME | Joined a group → welcoming experience. |
| S11 | After trying to join, how clear was whether you had a place in the match? | CLEAR | Attempted to join, whether successful or not → enrollment confirmation; distinct from ease of joining. |
| S12 | How clear was when it was your turn? | CLEAR | Waited for or took a turn → turn and queue communication. |
| S13 | How easy or difficult was it to tell which [candles] were yours? | EASE | Encountered player-specific objects alongside other players' objects → ownership or objective attribution. Name the relevant objects. |
| S14 | How easy or difficult was it to tell what you contributed to the team's result? | EASE | Took part in a shared task with a visible result → contribution readability, distinct from satisfaction with that contribution. |
| S15 | How enjoyable was watching other players play? | ENJOY | Actually watched an activity as a spectator → spectator enjoyment; do not substitute for playing-with-others enjoyment. |

### T · Motivation, continuation, and another visit

Research basis: the local retention lens, with a strict separation between self-report and behavior. These questions are not a validated retention model.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| T01 | How interested are you in playing more right now? | INTEREST | At a pause → immediate continuation interest. |
| T02 | How interested are you in coming back another day? | INTEREST | Near the end, if revisits matter → stated future interest. |
| T03 | How clear is what you could do on another visit? | CLEAR | Repeatable content exists → awareness of next-visit opportunities. |
| T04 | How interested are you in trying [the available activity] next? | INTEREST | Saw a specific available next activity → attraction to that activity. |
| T05 | How interested are you in trying a different approach next time? | INTEREST | Played an activity with alternative approaches → experimentation interest. |
| T06 | How interested are you in working toward [the longer-term goal]? | INTEREST | Encountered that goal → its motivational appeal. |
| T07 | How interested are you in discovering more of this world? | INTEREST | Explored some of it → exploration motivation. |
| T08 | How interested are you in inviting a friend to play? | INTEREST | Experienced something suitable for sharing → invitation interest, not NPS. |
| T09 | How worthwhile did this visit feel? | WORTH | At a stopping point → perceived value of the visit. |
| T10 | How well did this activity fit your interests? | FIT | Tried it → audience fit; low fit need not mean poor execution. |

### Q · Technical experience, access, and recovery

Research basis: task usability and local mobile/game-feel references. These are player-reported symptoms, not measurements of frame rate, latency, accessibility compliance, or bug frequency.

| ID | Player-facing question | Scale | When to use → what to investigate |
|---|---|---|---|
| Q01 | How satisfied were you with how smoothly the game ran? | SATISFIED | Actually played → perceived performance. |
| Q02 | How satisfied were you with how quickly the game responded to your controls? | SATISFIED | Used inputs → perceived responsiveness. |
| Q03 | How satisfied were you with the loading time? | SATISFIED | Encountered loading → loading tolerance. |
| Q04 | After getting stuck, how easy or difficult was it to get back to playing? | EASE | Became stuck → recovery path, not whether a bug occurred. |
| Q05 | How comfortable was the amount of movement on screen? | COMFORT | Experienced camera or visual movement → visual comfort; not a health assessment. |
| Q06 | How easy or difficult was it to follow the game with sound off? | EASE | Actually played with audio off → availability of visual information. |
| Q07 | How easy or difficult was it to tell the important objects apart? | EASE | Needed to distinguish them → visual differentiation; not a color-vision test. |
| Q08 | How comfortable were the controls on the device you used? | COMFORT | Used that device → ergonomic fit. |
| Q09 | After an interruption, how easy or difficult was it to continue? | EASE | Experienced an interruption → resumption flow. |
| Q10 | How easy or difficult was it to pick up where you left off on your last visit? | EASE | Returned after an earlier visit → continuity, saved state, and reminders. |
| Q11 | How comfortable was the sound during play? | COMFORT | Played with audio on → comfort during exposure, including repetition and overlapping effects; distinct from liking the soundtrack. Use comments to locate the cause. |
| Q12 | How easy or difficult was it to keep the action in view? | EASE | Tried to follow an activity, as a player or spectator → obstruction by UI, avatars, objects, or camera placement; not simply text readability. |

## Choosing a small set

The rows below are **creator presets**, not additional questions. Use only eligible items. Keep the same wording, labels, order, and trigger when comparing a set over time.

| What the creator is testing | Suggested set | Timing / qualification |
|---|---|---|
| First playable game | F01, E01, E03, C01, T01 | At a pause after a first attempt; omit E01/E03 if the activity was never reached. |
| Onboarding bottleneck | F01, F02, C01, F05 | After an onboarding attempt, including failure to start. |
| Difficulty and failure | H01, H03, H05, H06 | After an unsuccessful challenge attempt; use H01/H03 only for a mixed success/failure sample. |
| Repeated loop | E01, P06, P01, P04 | After repeated play; omit P04 without a progression system. |
| Co-op activity | S03, S04, S06, S08 | After trying to join and play with a team; failed joiners answer only what they experienced. |
| Quiet-hours solo play | S09, F01, W08, T01 | After a solo visit; use W08 only after exploration. |
| Gallery or social space without a game loop | E02, C06, W04, Q01 | At a pause during/after a visit; omit C06 if there was no text. |
| Return opportunity | E02, T02, T03 | Near the end of a repeatable experience; examine interest and awareness separately. |
| Mobile usability | C10, C06, Q02, Q08 | On an actual touch device, after using the relevant interface. |
| Match entry and waiting | S03, S11, S12 | After attempting to join a queued or turn-based activity; omit S12 if the player never experienced turn-taking. For drop-in rounds, substitute F11. |
| Resources and progression | P11, A04, E03, T03 | Adapt A04 to choosing an upgrade and E03 to using it. Ask each only after that step; omit T03 if another visit is not intended. |
| Visibility and sensory comfort | C08, Q12, Q11 | After actual play with audio on; distinguishes noticing information, seeing the action, and sound comfort. |

For a hosted playtest, the creator can establish these conditions manually. For an embedded live form, use known scene events or omit a question when eligibility is unknown. Do not require a new automated eligibility system to use the bank.

### Three practical customization examples

- “How satisfying did [the action] feel?” → “How satisfying did hitting the ball feel?”
- “How easy or difficult was it to find the place you wanted to go?” → “How easy or difficult was it to find the bowling lane?”
- “How interested are you in working toward [the longer-term goal]?” → “How interested are you in completing the creature collection?”

Changing the named task creates a context-specific variant. Save that exact wording, not only the template ID.

## What the research does — and does not — support

The useful convergence is **multiple aspects of player experience, targeted questions, and iteration informed by both behavior and self-report**. There is no single universal set of five “best game questions” established by the sources reviewed here.

| Source / evidence type | Relevant finding or guidance | Consequence for this MVP |
|---|---|---|
| [PXI official model and guidance](https://playerexperienceinventory.org/docs) · research instrument | Separates functional experience from higher-level player experience. Its prescribed wording and seven-point response format matter for validated use and benchmark comparisons. | Use its topics as a coverage map. Our reworded five-point prompts are not PXI scores. |
| [miniPXI, Haider et al., 2022](https://pure.tue.nl/ws/portalfiles/portal/317193176/3549507.pdf) · development/validation research, abstract and §7.3 | Eleven items offer a shorter alternative, but results and recommended uses are qualified. The authors particularly caution about delayed recall, cross-game comparisons, and mastery/immersion measurement. | Short surveys have a genuine burden/reliability trade-off. Ask soon after play; do not claim to reproduce miniPXI by selecting or rewriting a few items. |
| [miniPXI test–retest study, Haider et al., 2024](https://arxiv.org/abs/2407.19516) · empirical follow-up, abstract | Across 100 participants and four games, repeatability varied by construct; complex dimensions were not uniformly reliable as single items. | A single rating is a practical signal for investigation, not a stable measurement of an entire psychological construct. |
| [GUESS-18, Keebler et al., 2020](https://research.google/pubs/validation-of-the-guess-18-a-short-version-of-the-game-user-experience-satisfaction-scale-guess/) · validation research, abstract | A shortened 18-item instrument retains nine satisfaction dimensions, with validation across two studies. | Usability alone is insufficient coverage. Keep room for story, aesthetics, enjoyment, expression, and social experience when relevant. This bank is not GUESS-18. |
| [RITE, Medlock et al., 2002](https://www.jpattonassociates.com/wp-content/uploads/2015/04/rite_method.pdf) · method and Age of Empires II tutorial case, pp. 1–3 | Rapidly fix well-understood usability issues and test the fixes; unclear causes call for more investigation. Participant counts depend on the issue and verification goal. | Ratings and comments can locate an issue. Observe it and re-test the change; do not treat a handful of stars as proof. |
| [Valve's Half-Life 2 design process](https://steamcdn-a.akamaihd.net/apps/valve/2006/GDC2006_HL2DesignProcess.pdf) · practitioner presentation, slides 7–11 | Describes playtesting as experimentation and advises non-leading questions without over-relying on what players say. | Ask what happened and how it felt; compare with what players actually did. |
| [Riot R&D, Tom Cadwell, 2020](https://www.riotgames.com/en/r-and-d-office/prototype-building-a-games-substance) · practitioner account, “Audience” and “Playtesting” | Emphasizes the intended audience, specific feature questions, and internal/external playtests. | Choose questions around the current uncertainty, not a generic certification checklist. |
| [Steve Bromley on playtest sample sizes](https://gamesuserresearch.com/how-many-players-do-i-need-for-a-playtest/) · practitioner planning guidance | Distinguishes finding usability problems, understanding players, and quantitative measurement. | Do not turn suggested sample counts into statistical guarantees or a universal minimum. |

### How the local materials informed selection

The [presentation](../../skills-ecosystem-presentation.html) supplied the Valve, Riot, RITE, and Bromley leads. Their underlying sources were checked rather than adopting the slide summaries as standards. In particular, **RITE does not establish a universal 3–5-player rule**. The Valve PDF carries a 2007 copyright despite its URL containing “2006”; this note does not infer its presentation date from the path.

The [wiki](../../LLM-wiki-GDD-playbooks/wiki/index.md) supplied design lenses, not a prevalidated survey:

| Local reference | What it changed in this bank | Limit |
|---|---|---|
| [Game feel](../../LLM-wiki-GDD-playbooks/wiki/concepts/game-feel.md) and [measuring game feel](../../LLM-wiki-GDD-playbooks/wiki/concepts/measuring-game-feel.md) | Separate input ease, response clarity, satisfaction, and perceived technical response. | A player rating cannot isolate latency, tuning, or audiovisual feedback as the cause. |
| [Self-determination theory](../../LLM-wiki-GDD-playbooks/wiki/concepts/self-determination-theory.md) and [meaningful choices](../../LLM-wiki-GDD-playbooks/wiki/concepts/meaningful-choices.md) | Include freedom, choice understanding, expression, and social contribution. | More choices or more social contact do not automatically mean a better experience. |
| [Difficulty-skill balance](../../LLM-wiki-GDD-playbooks/wiki/concepts/difficulty-skill-balance.md) | Keep difficulty fit separate from enjoyment, fairness, and perceived learning. | The balance explanation is not a universal law of fun. |
| [Theory of fun](../../LLM-wiki-GDD-playbooks/wiki/concepts/theory-of-fun.md) and [skill atoms](../../LLM-wiki-GDD-playbooks/wiki/concepts/skill-atoms.md) | Ask about learning and repeated play without requiring every repetition to be novel. | These are interpretive lenses, not evidence that this question wording predicts retention. |
| Local dcl-gdd references: [first minutes](../skills/dcl-gdd/references/core-loop-and-ftue.md), [social design](../skills/dcl-gdd/references/social-design.md), [retention](../skills/dcl-gdd/references/retention.md), [experience prompts](../skills/dcl-gdd/references/experience-prompts.md) | Separate starting, enjoying, continuing now, future opportunity, and actual return; test solo and shared situations separately. | Used as domain context only. No skill workflow, proposal rubric, retention threshold, or program requirement is imposed on this survey. |

Several wiki pages are marked draft. The application above is a synthesis of those notes, not a claim that every underlying book or paper was independently revalidated. Empirical claims about the survey instruments rely on the primary sources linked above. This is a focused desk review, not an exhaustive systematic review.

## What the real DCL playtests added

The archive makes the practical gaps more specific: **players can enjoy the activity while not understanding their match status, an unavailable action, resource purpose, or which progress belongs to them**. A broad “UI ease” question may reveal friction but is less helpful when the creator already knows which of these systems needs testing.

Review coverage: all 13 standalone feedback/review reports and the Notes/Details sections of 26 meeting-note files, with selected passages checked against the included transcripts. The short “Wk 2 Playtests Killer House & Monster Recon” meeting note contains setup/administrative discussion and contributed no gameplay finding. Not every transcript was read line by line, and linked videos or separate QA reports were not reviewed.

These are **39 files, not 39 independent playtests or representative player samples**. Some notes and reports describe the same session, and several scenes were tested repeatedly by overlapping groups. Written reviews mix reported experiences with reviewer interpretation and recommendations. Gemini notes and transcripts can contain errors. The evidence below motivates questions; it does not establish issue prevalence, validate the questions, or show that a proposed feature improves retention.

### New questions and their evidence

The exact player wording and scales are in the bank above. This table explains why each addition earns a separate place.

| Addition | Concrete archive evidence | Gap it fills |
|---|---|---|
| F11 · Understanding an ongoing round | [Virtual Space Week 2][dcl-virtual], “Join-in-progress UX”; [Week 4][dcl-virtual4], “Make the first 5–10 seconds immediately understandable”: new arrivals lacked enough context during an active flight. | F01 asks how to start; F11 asks about entering a session that has already started. The report's time target is not a universal survey threshold. |
| C11 · Tap or hold clarity | [Killer House][dcl-killer], “Make the candle objective completely clear”; [Beat Score Week 4][dcl-beat4], “Make the BEAT input immediately understandable.” Players did not know whether an input should be tapped or held. The [Killer House transcript][dcl-killernotes] also records releasing too soon at 00:23:54. | C01 measures control ease. C11 isolates understanding the required gesture before blaming dexterity or responsiveness. |
| E11 · Why an action is unavailable | [Bloom Garden][dcl-bloom], “Remaining mechanic and UX issues”: planting capacity and watering limits were unclear. [Living Garden, April 17][dcl-garden], 00:18:25: a paused countdown was discussed as a possible bug before its health condition was explained. | A visible non-response may be a rule, exhausted resource, or fault. Ask whether the reason was understandable; do not ask the player to diagnose the software. |
| H11 · What survives failure | [Shroom Zoom, July 14][dcl-shroom], “Double Jump and Collision Logic,” 00:03:11–00:05:05: the designer's checkpoint behavior differed from testers' expectation of a saved respawn point. [Killer House][dcl-killer] also calls for a readable distinction between run progress and best results. | H07 asks whether the penalty feels fair; H11 asks whether the reset boundary is understood. |
| P11 · What a resource is for | [Monster Recon][dcl-monster], “Give collected monsters a clear use” and “Give coins a meaningful purpose”; [Eternal Vortex][dcl-vortex], “Coins were abundant but not meaningful.” | A collection can feel satisfying while its use remains unclear. P05 evaluates rewards, not understanding what can be done with them. |
| P12 · When an action becomes available again | [Living Garden, April 17][dcl-garden], 00:16:26–00:18:25: the discussion distinguishes the daily water limit from knowing when the next water use arrives. | P02 evaluates waiting; P12 evaluates whether the wait or reactivation condition is communicated. |
| S11 · Confirmation of a place in a match | [Bowling rematch][dcl-bowling], “Lane Selection UI and Leaving Game Issues,” 00:16:24–00:17:12: leaving the desk made enrollment unclear. [Beat Score Week 2][dcl-beat2], “Stabilise multiplayer,” also reports uncertainty about joining. | Joining can be easy to attempt but hard to confirm. Keep failed join attempts eligible. |
| S12 · Turn awareness | [Fortune Teller, May 19][dcl-fortune], “Proposed Turn Management System,” 00:10:32: crowd/seat overlap prompted a proposal to show who was next. Bowling also exposed unclear waiting/playing states. | Registration and turn-taking are different states. The proposed queue display is a possible remedy, not a proven requirement. |
| S13 · Mine versus someone else's | [Killer House][dcl-killer], candle ownership and other players' objective states; the [transcript][dcl-killernotes] records this confusion at 00:11:49 and 00:23:54. | Q07 covers distinguishing objects generally; S13 targets ownership in a shared scene. |
| S14 · Recognizing a personal contribution | [Virtual Space Week 2][dcl-virtual], “Make firing and contribution immediately understandable”; [Claim Bite][dcl-claim], “Remaining mechanic and UX issues,” reports a poorly surfaced social mining bonus. | S08 asks whether players are satisfied with their contribution. S14 asks whether they can identify it at all. |
| S15 · Enjoying spectating | [Slay The Steps, April 16][dcl-slay], 00:12:33–00:16:42 and 00:23:02: spectators encountered missing performers, unstable views, and uncertainty about voting. [Fortune Teller][dcl-fortune] also distinguishes spectator and participant experiences. | Seeing or watching others is not the same as playing with them. This is a separate outcome, not a claim that these tests established spectator demand. |
| Q11 · Audio comfort over time | [Eternal Vortex][dcl-vortex], “Audio was satisfying at first but became overwhelming”; [July 28 transcript][dcl-vortexnotes], 00:34:06 and 00:44:33, describes repeated/overlapping collection sounds becoming tiring. | W02 asks whether the audio appeals. Liking a sound initially does not establish comfort during repeated play. |
| Q12 · Keeping the action visible | [Clean the Club V2][dcl-club], “Improve the visibility and reliability of the UI”; [August 4 transcript][dcl-clubnotes], 00:00:03, describes a panel obstructing the view. [Beat Score Week 4][dcl-beat4] reports camera and avatar obstruction too. | Reading text, controlling the camera, and seeing the action are distinct problems. |

### Useful findings already covered

Do not turn every concrete playtest comment into another bank item. Use named variants of existing questions where the measurement is the same:

- **Discovering the next activity:** Bloom Garden's missed seed-collection transition and Clean the Club's hidden upgrade area fit F05, C07, and P10. If players never found a feature, do not ask them to rate how good it was.
- **Understanding an upgrade before buying:** use A04 with “Before choosing an upgrade, how clear was what it would change?” After using it, E03 can ask about the result. These are different exposure points, not a single doubled question.
- **Knowing whether play is cooperative or competitive:** [Alien Scrapyard][dcl-alien], “Decide whether the game is collaborative or competitive,” motivates an F03 variant: “How clear was whether you were working together or competing?” The report identifies a design ambiguity, not proof that one model is always superior.
- **Restarting after a round:** adapt F06 to “How easy or difficult was it to start another round?” Keep this separate from T01, which asks whether the player wants to continue.
- **Social comfort and visibility:** Fortune Teller's privacy/spectacle discussion can use S07 and Q12 in the actual role. It does not justify adding a compulsory spectator area or a privacy feature to every scene.
- **Challenge versus enjoyable failure:** Killer House and Shroom Zoom support keeping H01, H03, H05, and H06 separate. A player can enjoy losing while disliking unreadable hazards.
- **Enjoyment versus return:** Eternal Vortex reinforces the separation of E01, P06, T01, and T02. Reported interest or disinterest is not measured seven-day retention.

The Top 20 stays unchanged: these reports reinforce its broad coverage, while the 13 additions help creators select more precise questions for specific systems. For a lobby problem, S11 may be more valuable than a generic Top 20 item; rank is not a requirement to include it.

### What not to turn into a star rating

Progress resets in Monster Recon, mismatched timers in Beat Score, incorrect scores, crashes, and client-specific rendering failures need reproduction steps or event evidence. Ratings can describe the experience of these failures but cannot confirm data persistence or synchronization.

For a reported fault, an optional comment such as “What happened, and what were you trying to do?” can supply a starting point. Keep device, client/build version, and the attempted task where already available. Do not make players identify the responsible SDK or server component. A crash can also prevent the in-world form from being shown at all.

During hosted tests, note whether the player answered **before or after live instructions or a workaround from the creator**. Several sessions included verbal explanations, reloads, or alternate joining paths. Successful play after that help is different evidence from unassisted onboarding. Treat this as test context, not another player rating or a mandatory new tracking system.

Feature proposals in these files—new modes, resource scarcity, more roles, larger maps, leaderboards, extra progression—remain hypotheses. The question bank should expose what a player experienced, not ask for approval of whichever solution the team suggested.

[dcl-beat2]: <../feedback/DCL Studios Playtest feedback/BEAT SCORE — Week 2 Playtest Feedback.docx>
[dcl-beat4]: <../feedback/DCL Studios Playtest feedback/Beat Score V1_ Week 4 Playtest Feedback & Signoff.docx>
[dcl-bloom]: <../feedback/DCL Studios Playtest feedback/Bloom Garden v2 – Week 2 Milestone Review & Release Scope.docx>
[dcl-claim]: <../feedback/DCL Studios Playtest feedback/Claim Bite – V0 Milestone Review & V1 Scope.docx>
[dcl-club]: <../feedback/DCL Studios Playtest feedback/CLEAN THE CLUB V2_ Suggested Priorities Before the Wk 4 Playtest.docx>
[dcl-vortex]: <../feedback/DCL Studios Playtest feedback/Eternal Vortex Playtest Feedback - July 28, 2026.docx>
[dcl-killer]: <../feedback/DCL Studios Playtest feedback/KILLER HOUSE_ Wk 2 Playtest Feedback - Priorities Before Wk 4.docx>
[dcl-monster]: <../feedback/DCL Studios Playtest feedback/Monster Recon v1 — Wk2 Playtest Feedback.docx>
[dcl-slay]: <../feedback/DCL Studios Playtest feedback/Official QA Playtest Slay The Steps - 2026_04_16 18_55 CEST - Notes by Gemini.docx>
[dcl-alien]: <../feedback/DCL Studios Playtest feedback/Alien Scrapyard Playtest V2 Wk4 Feedback.docx>
[dcl-bowling]: <../feedback/DCL Studios Playtest feedback/Rematch Playtest Bowling Alley (Lane Fixes - Optional) - 2026_05_12 18_01 CEST - Notes by Gemini.docx>
[dcl-virtual]: <../feedback/DCL Studios Playtest feedback/Virtual Space – Week 2 Playtest Report.docx>
[dcl-virtual4]: <../feedback/DCL Studios Playtest feedback/Virtual Space V1_ Week 4 Playtest Feedback & Signoff.docx>
[dcl-shroom]: <../feedback/DCL Studios Playtest feedback/Studio Playtests - 2026_07_14 18_00 CEST - Notes by Gemini.docx>
[dcl-garden]: <../feedback/DCL Studios Playtest feedback/Week 4 playtest v2 The Living Garden (optional) - 2026_04_17 16_59 CEST - Notes by Gemini.docx>
[dcl-fortune]: <../feedback/DCL Studios Playtest feedback/Playtest The Fortune Teller (optional) - 2026_05_19 18_30 CEST - Notes by Gemini.docx>
[dcl-clubnotes]: <../feedback/DCL Studios Playtest feedback/Wk2 Playtest Clean the Club v2 - 2026_08_04 19_02 CEST - Notes by Gemini.docx>
[dcl-vortexnotes]: <../feedback/DCL Studios Playtest feedback/Playtest Shroom Zoom & Eternal Vortex - 2026_07_28 18_00 CEST - Notes by Gemini.docx>

[dcl-killernotes]: <../feedback/DCL Studios Playtest feedback/Wk 2 Playtest Killer House - 2026_08_04 17_57 CEST - Notes by Gemini.docx>

## Keep the result interpretable

### Timing and participation

Use a natural pause after the relevant experience. Do not interrupt a jump or combat encounter just to measure it. Let players decline without losing progress.

Do not offer the survey only to winners, completers, reward claimers, or players who stayed a long time. That would omit important failure and abandonment experiences. An early manual feedback entry point is a useful alternative where the scene supports it. If the MVP reaches only completers, explicitly report that limitation.

Separate first visits from repeat visits when known. Record whether the survey came after a win, loss, solo period, group activity, or manual request if that context is already available. Avoid repeatedly prompting the same player after every action.

### CSV and analysis

No dashboard is required. A useful minimal row contains:

- question ID and revision, exact displayed wording and labels;
- submitted rating, optional comment, and a distinct missing/non-rating state if supported;
- scene/build identifier, timestamp, and trigger or preset identifier.

Device, exposure/completion context, and first/repeat visit can help **if already available and appropriate to collect**. These are suggestions for interpretable data, not requirements to add identity tracking. Do not request real names, contact details, or wallet information in free text.

Look at response counts, all five rating frequencies, and comments together. A median or mean is a compact summary, not the entire result. Do not merge ratings from different questions, scales, versions, or eligibility conditions.

For small samples, use counts rather than impressive-looking percentages and avoid decimal-point rankings between studios. A difference may reflect players, devices, triggers, recruitment, or chance. An opt-in in-world sample represents responders; it is not automatically representative of all visitors.

Keep immediate continuation interest, future return interest, and observed repeat visits as separate measures. Do not weight opinions by playtime or treat a high intention score as a retention forecast.

### From an answer to a design decision

Example, not a rule:

- Several players rate action-response clarity poorly.
- Comments mention not knowing whether a bowling throw counted.
- Watch attempts or inspect the relevant event evidence before attributing the problem.
- Test a clearer “throw counted” response.
- Re-test the same question and task, while checking whether players now recognize the result.

The score identifies a place to investigate. It does not establish the cause, choose the fix, or prove that the fix worked.

## Questions deliberately removed or reframed

| Tempting wording / approach | Problem | Replacement or boundary |
|---|---|---|
| “Did you feel the intended atmosphere?” | Players do not know the author's intent. | Ask about atmosphere enjoyment or fit; use other methods if the exact emotion matters. |
| “How much did other players improve the experience?” | Presupposes improvement and cannot express worsening. | Rate social-play enjoyment. A causal multiplayer benefit requires a comparison, not this wording. |
| “How fresh did repetition stay?” as a universal key metric | Makes novelty the success criterion, even for enjoyable rituals. | Rate enjoyment of repetition; investigate variety separately when relevant. |
| “How much would you play without rewards?” | A hypothetical counterfactual is a weak estimate of reward-free behavior. | Ask about the activity and actual rewards separately; test a variant if that causal question matters. |
| “How welcoming is this to new players?” asked of everyone | Asks respondents to speak for an audience they may not represent. | Ask actual first-time players about their own start. |
| “How accessible is it without color/sound?” without that exposure | Asks for an accessibility audit from an unqualified or unexposed respondent. | Ask about a real task in the actual conditions; run specialist checks separately. |
| “Was it clear and fun?” | One answer covers two different things. | Separate clarity and enjoyment. |
| “Was it fun?” dismissed as useless | Overall enjoyment is useful; it just does not explain the cause. | Keep E01 or E02 and pair it with a focused diagnostic question. |
| A five-star recommendation item labeled “NPS” | Different wording and response scale do not produce NPS. | Use invitation interest as a custom measure, or administer NPS separately in its proper format. |
| A leaderboard of scenes based on this mixed question bank | Different constructs, audiences, and triggers are not comparable quality scores. | Compare carefully matched questions in a relevant context. |

## What to validate with the three studios

Before treating the shortlist as production defaults:

1. Ask a few intended players to explain each chosen question and its middle answer in their own words. Check that “activity,” “goal,” “round,” and scale labels mean what we think they mean.
2. Try the form on the actual target devices. Check labels, touch selection, optional comments, skipping, and whether it interrupts play.
3. Include unsuccessful starts and failed attempts, not just happy-path completions. Check that no one is forced to rate something they did not experience.
4. Ask each creator which decision a response changed or which uncertainty it clarified. “No change needed” can also be useful when supported by evidence.
5. Revise or remove prompts that players interpret inconsistently or creators cannot use. Keep a small stable core only after this check.

This tests usability and practical value, **not psychometric validation**. Larger and appropriately designed studies would be needed for population estimates, cross-scene benchmarks, or claims that a score predicts retention.

## Revision history

Version 2 replaces the earlier 130-candidate draft with 100 edited candidates; the Top 20 is included in that count. Repeated, speculative, and less actionable formulations were removed or consolidated. Controls moved into the first five; challenge remains available when relevant. Each bank entry now has a scale, an exposure condition, and an interpretation boundary.

Some IDs are retained for navigation, but wording and grouping changed. Treat version 2 as a new question-bank revision: old and new answers must not be silently combined by ID. This document changes the research recommendation only; it does not modify the dcl-gdd skill, the wiki, or the feedback tool.

Version 3 adds 13 context-specific questions from the local DCL studio playtest archive, bringing the bank to 113. The existing 100 questions, their scales, and the Top 20 are unchanged. The new questions use existing scales; the additions do not require a new response type. Three optional presets and an evidence map were added. Preserve the exact wording and bank revision with exported answers.
