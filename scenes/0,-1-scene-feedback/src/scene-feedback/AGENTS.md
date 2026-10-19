# Working on Scene Feedback

These instructions cover this module and its integration into a Decentraland SDK7
scene. Keep them inside the copied module; preserve the host scene's own agent
instructions and conventions.

## Start here

Read the installed code before changing behavior. The upstream documentation has
installation steps and recipes; compare it with the version copied into this scene:

- [README](https://github.com/decentraland/sdk7-test-scenes/blob/main/scenes/0,-1-scene-feedback/README.md)
- [Integration examples](https://github.com/decentraland/sdk7-test-scenes/blob/main/scenes/0,-1-scene-feedback/EXAMPLES.md)
- [Choosing and adapting questions](https://github.com/decentraland/sdk7-test-scenes/blob/main/scenes/0,-1-scene-feedback/QUESTION_GUIDE.md)

Clarify the creator's playtest goal and intended feedback flow wherever unspecified.
Choose a small question set and adapt wording to the scene's actual actions and
objects. Agree when participation is requested and when questions appear; use the
scene's existing events and UI lifecycle rather than assuming a fixed startup delay.

## Choose the existing integration path first

- [questions.ts](questions.ts) configures questions, intro, participation gating,
  debug controls, and the local mobile preview. It is the usual customization point.
  Once a question has been deployed, give changed wording a new ID so CSV results
  remain interpretable.
- [index.ts](index.ts) exports the public API, implemented in [lib/index.ts](lib/index.ts):
  `feedback.intro(trigger)` requests participation; `participation()` reads the
  per-visit state; `enroll(trigger)` supports preselected testers without an intro;
  `ask(idOrIds, trigger, options)` asks game-triggered questions; `leaveFeedback(ids,
  trigger)` opens a repeatable player-initiated flow without enrolling the player.
- Intro and the first question can happen separately. Use the intro promise when
  its outcome matters. With the default participation gate, `ask()` requires opt-in
  or enrollment; do not override a refusal just to make questions appear.
- Question definitions support ratings with or without optional comments, and
  text-only answers. Check the types and examples before adding new modes.

Before changing Scene Feedback internals, look for a solution in this module's
public API, configuration, and examples. Modify `lib/` if those options cannot
support the intended behavior. Explain the gap and document any local customization:
replacing `lib/` during an upstream update would overwrite it.

## Preserve client/server integration

Keep the module import reachable on both client and server startup paths. Importing
`feedback` registers the module; startup happens on the first engine tick. There is
no extra initialization call. Wire player UI and game-event handlers on the client,
while preserving the scene's existing server logic.

Use the README's SDK and authoritative Multiplayer Server requirements. Copy the
module's assets into the scene's `assets/scene-feedback/`; preserve the host scene's
World, parcels, permissions, and other settings when applying required additions.
Do not replace the host entrypoint with the demo's entrypoint.

`lib/client/` owns UI and flow state, `lib/shared/` owns shared definitions and
messages, and `lib/server/` validates responses and writes CSV. Preserve existing
Storage keys (`playtest-feedback-N.csv` and `playtest-feedback-csv-head`) unless a
storage migration is explicitly part of the work.

## Verify the change

Run the host scene's relevant type/build checks. Exercise the changed flow locally,
including acceptance, refusal, skipping, and interaction with existing scene UI.
For changes to response handling, also verify the resulting CSV in a deployed World;
a UI success indication alone does not establish durable Storage persistence.
Turn debug controls off for release. Report which checks ran and what still needs
manual or deployed testing; do not describe unperformed checks as passed.
