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

The test uses Latin text to identify each font. Some fonts do not contain Cyrillic letters; those letters may use a fallback font.

## Guided checks

Click one scenario at a time in the right panel. Watch the instruction and countdown, then wait for **Finished** before starting another. Do not change fonts manually during a scenario: that stops it.

Button numbering starts at 2; the gap is expected.

| Button | What QA should see |
| --- | --- |
| **2. Shared font: remove owners** | Four Bungee Shade samples disappear one at a time. The remaining samples keep their font. At the end all four return and the input/dropdown work. |
| **3. Fallbacks + recovery** | Each invalid source switches all samples to built-in: OTF, missing file, invalid file, empty source and external URL. Between cases and at the end, Bungee Shade returns. No missing text or broken input/dropdown. Warnings for rejected sources are expected. |
| **4. Recreate x20** | The samples are recreated 20 times. At the end there is exactly one of each, using Bungee Shade. The input/dropdown work. Resetting their values during this test is expected. |
| **7. Scene boundary** | Accept the movement prompt if shown. Watch the 3D text near the cyan edge: fully inside it is visible, fully outside it disappears, and after moving back it reappears. The UI remains visible. At the edge, font changes must not leave text stuck hidden or visible. |
| **9. Icon font (Font Awesome)** | Icon glyphs on all four components, drawn at runtime (private-use code points are not pre-filled). Steps 1, 2, 4 and 5: every icon draws; no box (tofu). Step 3 (Regular) ends with Medal, which Regular does not contain: that one box is expected. A box on Medal or Compass in Solid reproduces the creator report. |

**5 and 6 are local-only cancellation tests** and are unavailable on zone. They require the local server's artificial eight-second delay; a normal zone download cannot reproduce that timing reliably.

After the guided checks, leave the scene and return. All samples and controls should work again. **Stop / reset** restores the samples and resets the input and dropdown.

**Finished means the scripted steps ended, not that the test passed.** QA confirms the appearance and interaction. If something fails, report the button/step, expected and actual appearance, and a screenshot. The scene also logs each step with the `[font-test]` prefix.

## Icon atlas repro (pages of 50 icons)

`src/index.ts` currently sets `iconRepro = true`, so the scene opens the icon atlas repro instead of the QA panel above. Set it to `false` to restore the QA scene.

It reproduces a creator report: "Fresh launch with a page of 50 icons: 34 render and 16 are tofu. Every page after that is tofu." The Explorer gives each scene font a single 1024x1024 atlas page per component type (one for TextShape, one for UI). The converter's pre-fill already uses about 45% of it, so only about 34 new Font Awesome icons fit. The fix allows up to four atlas pages per font.

The scene shows 400 distinct Font Awesome Solid icons in 8 pages of 50, all of a page at once. Each icon is its own UI text, captioned in the built-in font with its number (1-400) and code point, so you can count boxes (tofu). The same 50 icons are also drawn by a 3D TextShape in front of the spawn point, to test the TextShape atlas too. Use **Prev page** / **Next page**; the header shows the page and how many distinct icons have been requested so far.

| Page | Current client | Fixed client |
| --- | --- | --- |
| **1** | About 34 icons render, about 16 are tofu. | All 50 render. |
| **2-3** | Tofu, apart from a few small icons that fit in leftover space. | All render. |
| **4-8** | Tofu. | Icons render until the four atlas pages are full (roughly 270 icons in total, varying with icon sizes), then tofu. That tofu is the expected cap. |

Check both the UI grid and the 3D TextShape; they use separate atlases and should behave the same.

**Only a fresh Explorer launch gives a meaningful page-1 result.** Atlas pages persist while the Explorer keeps the font loaded, so leaving and returning, or reloading the scene, starts with the atlas already used. Visit the pages in order (1, 2, 3, ...); going back to a page you have seen redraws icons already in the atlas. Each page change is logged with the `[icon-repro]` prefix and its code point range.

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

Visual checks do not establish absence of memory leaks or network requests. Verifying that a rejected URL was never fetched requires native logs/network inspection. Resource cleanup and deferred deletion are checked separately by the Explorer Unity tests.

JavaScript logs report requested component state and executed steps, not native font download or rendering success.
## SDK version

`fontSrc` ships in the `auth-server` SDK build `7.30.2-39796956377.commit-4223559` (pinned in `package.json`). To move to a newer one, run `npm i --save-exact --save-dev @dcl/sdk@auth-server @dcl/js-runtime@auth-server`.

## Bundled font fixtures

- Azeret Mono Medium: copied from Explorer's existing font asset; SIL Open Font License included.
- Bungee Shade TTF: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/bungeeshade), SIL Open Font License included. It is bundled with the scene.
- Bungee Shade OTF: [Bungee v1.2.1](https://github.com/djrrb/Bungee/blob/fc391285f3a5eb0968f0171a61d09112bc83d0c8/fonts/Bungee_Desktop/Bungee/Bungee-Shade.otf), license included. This is a real unsupported OpenType/CFF fixture, not a renamed TTF.
- Font Awesome Free Solid (6.7.2), Regular and Brands (7.0.1): `duck-font-awesome-*.ttf`, the creator-reported files (desktop OTFs converted to TTF and renamed), SIL Open Font License included. Solid has no space glyph and maps ASCII to icons, so scenario 9 uses icon-only strings.
- `invalid.ttf` intentionally contains plain text; `missing.ttf` is intentionally absent.

Fonts load from the asset bundle the converter (abgen) builds for this scene's deployment, so the deployed scene shows them only after abgen has processed that deployment. A local preview without a local asset bundle converter (`--local-ab`) shows the built-in font instead. Arbitrary URL fonts remain rejected.