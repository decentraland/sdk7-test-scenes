## Audio Effect Zone Test Scene

Tests the `AudioEffectZone` SDK component with `SilenceEffect`.

### What it does

A translucent red cube marks the silence zone at the center of the parcel.
Any avatar that enters the zone has their proximity voice chat muted.
When the avatar exits, voice is restored.

### How to test

1. Enter the scene with two players (both need voice chat enabled)
2. Walk into the red translucent zone
3. Verify that the player inside the zone is muted for the other player
4. Walk out and verify voice is restored

### SDK package

This scene requires an `@dcl/sdk` version that includes `AudioEffectZone` (component ID 1217).
Until the js-sdk-toolchain PR is merged, install the test package from the PR.
