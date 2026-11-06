#!/usr/bin/env node
/**
 * Pre-deploy guard: refuses to deploy while `scene.json` still holds the
 * placeholder world name, because a deploy to a world you do not control fails
 * late (after the whole build + signing flow) with a confusing permission error.
 *
 * Runs on `predeploy` (after `subscenes:gen`). Set the real world in
 * `scene.json` → `worldConfiguration.name`, e.g. `my-qa-hub.dcl.eth`.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCENE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLACEHOLDER = 'your-world-name.dcl.eth'

const scene = JSON.parse(readFileSync(join(SCENE_ROOT, 'scene.json'), 'utf8'))
const world = scene.worldConfiguration?.name

if (typeof world !== 'string' || world.trim() === '') {
  console.error(
    '❌ scene.json is missing worldConfiguration.name: this scene is meant to be deployed to a WORLD.\n' +
      `   Set it to the world you control, e.g. "name": "${PLACEHOLDER}" → your own .dcl.eth name.`
  )
  process.exit(1)
}

if (world === PLACEHOLDER) {
  console.error(
    `❌ worldConfiguration.name is still the placeholder "${PLACEHOLDER}".\n` +
      '   Edit scene.json and set the world you own before deploying, e.g. "name": "my-qa-hub.dcl.eth".\n' +
      '   Then: npx sdk-commands deploy   (world deploys take the name from scene.json)'
  )
  process.exit(1)
}

const parcels = scene.scene?.parcels ?? []
console.log(
  `✅ world "${world}" · ${parcels.length} parcels · layout ${Math.sqrt(parcels.length)}x${Math.sqrt(parcels.length)}`
)
