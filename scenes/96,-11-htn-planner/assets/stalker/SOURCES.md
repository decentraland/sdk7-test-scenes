# Stalker assets: provenance

Used by level 12 (`src/playground/levels/ambush.ts`) through `src/examples/stalker/stalker-model.ts`.

The scene owner confirmed on 2026-10-23 that this model and all its audio are their own AI-generated assets.

- `stalker.glb`: authored in Blender for the scene owner (agent-built model, rig and clips). Clips: `PatrolWalk`
  (3.2 s), `PatrolIdle` (3.2 s), `PatrolTurn` (2.4 s), `HeadTurnLeft` (1.8 s), `AggroRun` (0.8 s), `BodyTurnLeft`
  (1.467 s), and three one-frame head poses `GazeLeft` / `GazeCenter` / `GazeRight` (the head pivot at -90 / 0 / +90
  degrees, blended by weight). Height about 3.84 m at scale 1. Internal names (scene, nodes, materials, images) were
  made neutral when it was copied here; meshes, skin, clips and textures are unchanged.
- `stalker-step-walk-1..4.ogg`, `stalker-step-run-1..4.ogg`: single steps cut with ffmpeg from a boot-footsteps
  take generated with AI by the scene owner; the run set made louder and harder (EQ, compressor, soft clipping,
  shorter tail). Walk 0.5 s, run 0.32 s each. Not auditioned by a human yet.
- `stalker-voice-notice.ogg` ("You... you have been naughty!", 5.71 s, it noticed you), `stalker-voice-fear.ogg`
  ("Mmm, your fear. It tastes delicious.", 6.79 s, it heard something) and `stalker-voice-run.ogg` ("Run, little
  one! It only makes the hunt more... enjoyable.", 8.86 s, it lost you in a chase): voice clips generated with AI by
  the scene owner.

Left out of the source set: the catch line (long, the run ends there), an alternative notice line, the bell sounds,
and the full footsteps take.
