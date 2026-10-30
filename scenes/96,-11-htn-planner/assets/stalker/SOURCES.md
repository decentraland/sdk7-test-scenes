# Primitive stalker visual and sound

The current Ambush demonstration builds its body from SDK meshes and animates joint Transforms.
Its eight footstep clips and three voice lines are restored from the signed archive tag below.
They are spatial AudioSources parented to the primitive body; the GLTF model remains excluded.
See `src/examples/stalker/stalker-model.ts` and the GLTF Animator recipe in `src/htn-planner/HOW-TO.md`.

## Previous asset version (historical)

The model and eleven audio files below were removed on 2026-10-29; only the audio was restored on 2026-10-30.
Their source and original provenance belong to [PR #116](https://github.com/decentraland/sdk7-test-scenes/pull/116).
Historical commit `2c333f34faf7133c0776e391ff6bfabd6d98080a` is not part of `main` ancestry after a squash merge.
The signed archive tag [`archive/htn-stalker-assets`](https://github.com/decentraland/sdk7-test-scenes/tree/archive/htn-stalker-assets) retains that commit independently of the PR branch.
From a clone whose `origin` is `decentraland/sdk7-test-scenes`, fetch the tag and export the pinned files:

```sh
git fetch origin refs/tags/archive/htn-stalker-assets:refs/tags/archive/htn-stalker-assets
git archive --format=zip --output=../htn-stalker-assets-2c333f3.zip 2c333f34faf7133c0776e391ff6bfabd6d98080a scenes/96,-11-htn-planner/assets/stalker
```

Use an unused archive filename. This writes a separate ZIP without restoring files into your checkout.
The archive tag must remain available for recovery. Keep the ZIP or a source checkout if you need an independent copy.
The provenance below covers the archived model and the current audio files.


Previously used by level 12 through the former GLTF adapter.

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
