# Adding a subscene to the Mobile QA Hub

The hub is a single SDK7 scene where every mobile (`godot-explorer`) issue or PR gets **one subscene**.
You register yours by **adding one folder**. You never edit a shared registry file, so two workers on two
branches never conflict.

```
src/subscenes/<your-slug>/
  subscene.json   # metadata: title, issue, owner, status (data only)
  index.ts        # mount(ctx) / optional unmount()
```

`src/subscenes/scenes.gen.ts` is generated from those folders by `npm run subscenes:gen`, which runs
automatically on `prestart`, `prebuild` and `predeploy`. Never edit it by hand.

---

## 1. Create the folder

```bash
cd scenes/world-mobile-qa-hub
cp -r src/subscenes/_example src/subscenes/<your-slug>
```

`<your-slug>` rules (the generator fails otherwise):

- lowercase letters, digits and dashes only, e.g. `skybox-control-3096`, `glb-relpath-3062`;
- one subscene per issue and per PR (two subscenes cannot claim `#3062`).

Suggested name: `<feature-short-name>-<issue number>`.

## 2. Edit `subscene.json`

```json
{
  "title": "Skybox control: mobile time of day",
  "issue": "#3096",
  "pr": "#3101",
  "owner": "sprint28-skybox-3096",
  "status": "in-review",
  "note": "Open with the hub, look up: the sky must follow the slider.",
  "slot": 3
}
```

| field    | required | notes                                                                     |
| -------- | -------- | ------------------------------------------------------------------------- |
| `title`  | yes      | shown in the hub list and on the stage sign (80 chars max)                 |
| `issue`  | yes      | `#3062` (the `#` is optional, it is normalized)                            |
| `pr`     | no       | `#3096`, when the subscene covers a PR on top of the issue                 |
| `owner`  | yes      | who registered it, so testers know who to ping                            |
| `status` | no       | `pending` (default) \| `in-review` \| `done`                               |
| `note`   | no       | one line with what to look at, shown inside the subscene                  |
| `slot`   | no       | stage 0..15. Omit it and the generator assigns the first free one         |
| `size`   | no       | `{ "width": 16, "depth": 16 }` — declared footprint, max = stage size (16) |

Unknown keys are an error, so a typo never silently disappears.

## 3. Write `index.ts`

```ts
import { ColliderLayer, Material, MeshCollider, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import type { SubsceneContext } from '../../hub/types'

export function mount(ctx: SubsceneContext): void {
  const cube = ctx.addEntity()
  Transform.create(cube, {
    // ALWAYS build around ctx.origin: the stage center is assigned by the registry.
    position: Vector3.create(ctx.origin.x, 1, ctx.origin.z)
  })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(cube, { albedoColor: Color4.Red() })
}

// Optional: reset your own module level state (entity/system cleanup is automatic).
export function unmount(): void {}
```

The context you get:

| member                   | what it is                                                                 |
| ------------------------ | -------------------------------------------------------------------------- |
| `ctx.origin`             | center of your 16x16 m stage (`{x, y: 0, z}`). Build relative to it.        |
| `ctx.stageSize`          | `16`, the side of the stage in meters. Keep everything inside.             |
| `ctx.addEntity()`        | create an entity that is removed when the subscene is unmounted            |
| `ctx.track(entity)`      | adopt an entity created elsewhere (e.g. a `@dcl-sdk/utils` helper)         |
| `ctx.addSystem(fn, ...)` | system that is removed when the subscene is unmounted                     |
| `ctx.log(...)`           | `console.log` tagged with your slug                                       |
| `ctx.slug` / `ctx.issue` | folder slug and normalized `#issue`                                       |

### Hard rules

1. **Everything goes through `ctx`.** Do not call `engine.addEntity()` or `engine.addSystem()`
   directly — those are not tracked and would leak into the hub after you leave.
2. **Only one subscene is mounted at a time.** The hub removes the previous subscene (its
   `unmount()` plus every tracked entity/system) before mounting yours, and removes yours when you
   press *Back to hub*. Do not depend on other subscenes, and do not assume a previous visit left
   anything behind.
3. **Stay inside your stage.** Your slot is 16x16 m; keep props inside it, and keep assets small: the
   hub is one scene shared by every issue.
4. **No cross-scene edits.** Only touch `src/subscenes/<your-slug>/`. Do not edit
   `src/hub/**`, `src/subscenes/scenes.gen.ts`, other subscenes, or `world-mobile-qa-hub/scene.json`.

## 4. Regenerate + verify

```bash
cd scenes/world-mobile-qa-hub
npm install          # once
npm run subscenes:gen    # validates and rewrites src/subscenes/scenes.gen.ts
npm run typecheck        # tsc --noEmit
npm run build            # sdk-commands build, must be green
npm run start            # optional: local preview, hub lists your subscene
```

The generator prints the assigned stage with its coordinates:

```
   • skybox-control-3096 — #3096 / #3101 "Skybox control: mobile time of day" [in-review] page 0 slot 3 (stage center x=56 z=16)
```

It fails (exit code 1, one line per problem) when: the folder name is invalid, `subscene.json` is
missing or has an unknown key, `issue`/`pr` is malformed, `title`/`owner` is empty, `status` is
unknown, `size` does not fit a stage, `slot` is out of range, two subscenes in the same page claim the
same slot, the same issue/PR is claimed twice, or `index.ts` does not export `mount`.

## 5. Open the PR

```bash
git checkout -b qa-hub/<your-slug>
git add scenes/world-mobile-qa-hub/src/subscenes/<your-slug> scenes/world-mobile-qa-hub/src/subscenes/scenes.gen.ts
git commit -m "qa-hub: add subscene for #<issue>"
git push -u origin qa-hub/<your-slug>
gh pr create --draft --title "qa-hub: subscene for #<issue>" --body "..."
```

Commit `scenes.gen.ts` too (CI checks it is not stale with `npm run subscenes:check`), and only your
own subscene folder. Do not touch `scene.json` (it holds the world name and the parcel layout). If two PRs regenerate `scenes.gen.ts`, the conflicts are trivial to resolve:
regenerate the file (`npm run subscenes:gen`) instead of merging the hunks by hand.

---

## Layout

The scene is deployed to a **World** (`.dcl.eth`), not to Genesis City, so parcels are free: it uses an
**8x8 parcel** footprint (64 parcels, 128x128 m, world-relative `0,0`..`7,7`) sliced into an 8x8 grid of
**16x16 m stages** → 64 subscenes per page; subscene 65 starts page 1 and reuses the same 64 slots (only
one stage is ever populated at a time, so nothing overlaps in practice — the page/slot pair is what
identifies a stage).

Slot numbering (row major, slot 0 at the south-west corner, slot 63 at the north-east one):

```
row 7 (north)   slot 56  slot 57  slot 58  slot 59  slot 60  slot 61  slot 62  slot 63
row 6           slot 48  slot 49  slot 50  slot 51  slot 52  slot 53  slot 54  slot 55
row 5           slot 40  slot 41  slot 42  slot 43  slot 44  slot 45  slot 46  slot 47
row 4           slot 32  slot 33  slot 34  slot 35  slot 36  slot 37  slot 38  slot 39
row 3           slot 24  slot 25  slot 26  slot 27  slot 28  slot 29  slot 30  slot 31
row 2           slot 16  slot 17  slot 18  slot 19  slot 20  slot 21  slot 22  slot 23
row 1           slot  8  slot  9  slot 10  slot 11  slot 12  slot 13  slot 14  slot 15
row 0 (south)   slot  0  slot  1  slot  2  slot  3  slot  4  slot  5  slot  6  slot  7
                col 0    col 1    col 2    col 3    col 4    col 5    col 6    col 7
```

Slot `k` covers x = `(k % 8) * 16` .. `+16`, z = `floor(k / 8) * 16` .. `+16`; its center is what you
get as `ctx.origin`. The hub dais and the player spawn sit on the geometric center of the scene
(x = z = 64), which is only dressed while the hub is shown. `slot` is optional in `subscene.json`:
without it the generator assigns the first free one, which is what most subscenes should do.

## Previewing with the Explorer

Locally there is nothing to deploy: run `npm run start` in the scene folder and open the local scene
(`decentraland://?dclenv=zone&realm=...` or the Creator Hub preview). To smoke-test with the godot
client, launch it with a dev intent pointing at the local preview URL (see `docs/dev-intent.md` in
`godot-explorer`).

The hub is deployed to a **World**, and that only happens manually: `scene.json` →
`worldConfiguration.name` is a placeholder (`your-world-name.dcl.eth`) that must be replaced with the
real `.dcl.eth` world before `npm run deploy` (= `sdk-commands deploy`, which reads the world name from
`scene.json`; there is no `--world` flag). `npm run deploy:check` fails while the placeholder is there.
Adding a subscene does not need a deploy: just open the PR.
