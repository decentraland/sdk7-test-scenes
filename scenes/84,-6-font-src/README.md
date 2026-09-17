# Custom fonts — QA scene

Tests [Explorer PR #10118](https://github.com/decentraland/unity-explorer/pull/10118). Use that build: a released Explorer may not support custom fonts yet.

## Open on zone

The PR deploys this scene to `sdk7testscenes.dcl.eth` on zone. Wait for the **Deploy scenes/84,-6-font-src** check to succeed; the bot's jump-in comment alone does not confirm deployment.

1. Launch the Explorer build from PR #10118.
2. Connect with `--dclenv zone --realm sdk7testscenes.dcl.eth --position 84,-6`.
3. If connecting with MetaMask, use SEPOLIA.
4. Hold **Alt** to use the buttons. You should see text in the world, a text label, an input, and a dropdown. The built-in controls stay unchanged for comparison.

[Jump into the scene](https://decentraland.zone/jump/?dclenv=zone&realm=sdk7testscenes.dcl.eth&position=84,-6) (opens your installed client; make sure it is the custom build).

## Quick check

1. Click **Bungee Shade TTF**. All four samples should use the very distinctive outlined, shaded font. Type into the input and open the dropdown: their text should use it too.
2. Select a different dropdown option and type a short word. Switch between **Azeret Mono**, **Bungee Shade TTF**, and **Built-in**. Only the font should change; your word and selected option should remain.
3. Click **Family name**. Bungee Shade should load by name and look like the bundled version. This needs an internet connection.

The test uses Latin text to identify each font. Some fonts do not contain Cyrillic letters; those letters may use a fallback font.

## Guided checks

Click one scenario at a time in the right panel. Watch the instruction and countdown, then wait for **Finished** before starting another. Do not change fonts manually during a scenario: that stops it.

| Button | What QA should see |
| --- | --- |
| **1. Lora: four styles** | A serif font appears, with visible regular, bold, italic and bold-italic text. The scene switches to built-in and then back to Lora. Text stays readable. |
| **2. Shared font: remove owners** | Four Bungee Shade samples disappear one at a time. The remaining samples keep their font. At the end all four return and the input/dropdown work. |
| **3. Fallbacks + recovery** | Each invalid source switches all samples to built-in: OTF, missing file, invalid file, empty source and external URL. Between cases and at the end, Bungee Shade returns. No missing text or broken input/dropdown. Warnings for rejected sources are expected. |
| **4. Recreate x20** | The samples are recreated 20 times. At the end there is exactly one of each, using Bungee Shade. The input/dropdown work. Resetting their values during this test is expected. |
| **7. Scene boundary** | Accept the movement prompt if shown. Watch the 3D text near the cyan edge: fully inside it is visible, fully outside it disappears, and after moving back it reappears. The UI remains visible. At the edge, font changes must not leave text stuck hidden or visible. |

**5 and 6 are local-only cancellation tests** and are unavailable on zone. They require the local server's artificial eight-second delay; a normal zone download cannot reproduce that timing reliably.

After the guided checks, leave the scene and return. All samples and controls should work again. **Stop / reset** restores the samples and resets the input and dropdown.

**Finished means the scripted steps ended, not that the test passed.** QA confirms the appearance and interaction. If something fails, report the button/step, expected and actual appearance, and a screenshot. The scene also logs each step with the `[font-test]` prefix.

## Run locally

From this scene folder:

```sh
npm install
npm run build
npm run start
```

For the two cancellation scenarios:

1. In `src/index.ts`, temporarily change `delayedLoads: false` to `delayedLoads: true`.
2. Run `npm run start:fonts` and connect the custom Explorer to that local scene.
3. Click **5. Delayed load: switch**. After two seconds, all four samples should switch to Azeret and stay there. A late Bungee result must not replace it.
4. Click **6. Delayed load: remove**. The samples disappear during loading, return as Azeret, and stay Azeret.
5. Restore `delayedLoads: false` before committing or deploying.

The server delays dedicated scene-content font copies by eight seconds and prints `[font-test] DELAY`. If Bungee appears before the switch/removal or there is no DELAY log, the intended cancellation was not exercised. Do not pause the scene during these runs. Each run consumes a new fixture path; after 12 runs, restart Explorer before repeating. Reset does not clear the font cache.

Slow fixtures are generated locally, ignored by Git and excluded from deployment. The harness includes them only in its preview process. It does not enable arbitrary URL fonts.

## What this scene cannot prove

Visual checks do not establish absence of memory leaks or network requests. Verifying that a rejected URL was never fetched requires native logs/network inspection. Exact resource cleanup, deferred deletion and cancellation immediately after a cache hit remain covered by Unity tests, including [Explorer PR #10144](https://github.com/decentraland/unity-explorer/pull/10144).

JavaScript logs report requested component state and executed steps, not native font download or rendering success.
## Temporary protocol pin

This scene uses published SDK `7.29.0` and the exact test package from [protocol PR #489](https://github.com/decentraland/protocol/pull/489): `1.0.0-35133806160.commit-1767aed`.

The SDK does not yet serialize `fontSrc`. `npm install` runs `scripts/sync-font-protocol.cjs`, which regenerates only TextShape, UiText, UiInput and UiDropdown inside this scene's installed SDK. It checks the protobuf field numbers and verifies both encoding directions against the pinned protocol. The compiler is installed through `@protobuf-ts/protoc`; no sibling repository or machine-specific path is needed. The first install needs internet access to download the compiler and packages.

Before merging, replace this temporary bridge with a published SDK version that supports `fontSrc`, then remove the generation script/compiler dependency and rebuild. Merge the protocol and Explorer feature first; the shared-loader fix is tracked separately in Explorer #10144.

## Bundled font fixtures

- Azeret Mono Medium: copied from Explorer's existing font asset; SIL Open Font License included.
- Bungee Shade TTF: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/bungeeshade), SIL Open Font License included. It is bundled with the scene.
- Bungee Shade OTF: [Bungee v1.2.1](https://github.com/djrrb/Bungee/blob/fc391285f3a5eb0968f0171a61d09112bc83d0c8/fonts/Bungee_Desktop/Bungee/Bungee-Shade.otf), license included. This is a real unsupported OpenType/CFF fixture, not a renamed TTF.
- `invalid.ttf` intentionally contains plain text; `missing.ttf` is intentionally absent.

Lora and the **Family name** option are requested from Fontsource at runtime. Arbitrary URL fonts remain rejected.