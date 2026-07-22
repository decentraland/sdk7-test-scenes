# SDK7 Test Scenes
Welcome to the SDK7 Test Scene repository!
A place with separated test scenes for dedicated testing of different SDK features.

Every scene is a **fully standalone project**: it has its own `package.json` and installs its own dependencies. There is no npm workspace and no shared root `node_modules` — scenes are run isolated locally, and the CI deploys them side-by-side to the shared multi-scene world.

## Step to add a local scene
1. Just create a new folder inside the `scenes/` path. Name it `<x>,<y>-<feature-name>` after its base parcel.
2. Copy your scene inside here or start a new one `npx @dcl/sdk-commands init`
3. Run `npm install` once at the repo root (installs the checker's deps), then `npm run check-parcels` to verify the scene's parcels don't collide with another scene.
4. Commit your changes and push

## Step to run local scenes.
1. step into a scene's folder
2. run `npm install`
3. run `npm run start`

## Deploying and testing scenes in the SEPOLIA World

Each test scene's `scene.json` must include the following `worldConfiguration` so it can be deployed to the shared SEPOLIA world:

```json
"worldConfiguration": {
  "name": "sdk7testscenes.dcl.eth"
}
```

### Automatic deployment

The [Deploy changed scenes to world](https://github.com/decentraland/sdk7-test-scenes/actions/workflows/deploy-worlds.yml) GitHub Action runs automatically with every commit merged into `main`, detecting and deploying only the scenes that changed.

### Manual deployment

1. Open https://github.com/decentraland/sdk7-test-scenes/actions/workflows/deploy-worlds.yml
2. Click **Run workflow** on the right side
3. In the popup, enter the target branch and the scene folder to deploy (e.g. `scenes/88,-10-audio-visualization`)

### Testing a deployed scene in the Explorer

1. Switch your MetaMask network to **SEPOLIA** (not mainnet)
2. Open the Explorer using one of these methods:
   - **Deep link** (any browser): `decentraland://?dclenv=zone&realm=sdk7testscenes.dcl.eth`
   - **Custom build**: launch with the `--dclenv zone` app param — see [connecting a custom build to a scene](https://github.com/decentraland/unity-explorer/blob/main/docs/how-to-connect-to-a-local-scene.md#connecting-a-custom-build-to-the-scene)
   - **Unity Editor**: set _Decentraland Environment_ to `zone` and _Init Realm_ to `sdk7testscenes.dcl.eth`
