# SDK7 Test Scenes
Welcome to the SDK7 Test Scene repository!
Provides a simple environment for testing basic functionality during development.

## Step to add a local scene
1. Just create a new folder inside the `scenes/` path.
2. Copy your scene inside here or start a new one `npx @dcl/sdk-commands init`
3. Run `npm run check-parcels` to update the `dcl-workspace.json` and check if the scene has a valid parcel position.
4. Commit your changes and push

## Step to run local scenes.
1. npm run install-sdk
2. npm install
3. npm run start

## Testing main branch

In a Decentraland Explorer execute:

- latest sdk version
```
/goto https://sdk-team-cdn.decentraland.org/ipfs/sdk7-test-scenes-main-latest
```
- next sdk version
```
/goto https://sdk-team-cdn.decentraland.org/ipfs/sdk7-test-scenes-main-next
```
You can use command, to jump into specific location in that realm
```
/goto-local 72,-10
```
