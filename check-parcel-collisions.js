
const fs = require('fs')
const path = require('path')
const glob = require('glob')

const projects = glob.sync('scenes/*/scene.json', { absolute: true })
const parcels = new Map()

for (const projectFolder of projects.map(path.dirname)) {
  const sceneJsonPath = path.resolve(projectFolder, 'scene.json')
  const sceneJson = JSON.parse(fs.readFileSync(sceneJsonPath))

  for (const tile of sceneJson.scene.parcels) {
    const arr = parcels.get(tile) || []
    arr.push(projectFolder)
    parcels.set(tile, arr)
  }
}

// update dcl-workspace.json
{
  const workspaceJsonPath = path.resolve('dcl-workspace.json')
  const workspaceJson = JSON.parse(fs.readFileSync(workspaceJsonPath))
  workspaceJson.folders = projects.map(path.dirname).map(_ => ({ path: path.relative(process.cwd(), _).replace(/\\/g, '/') })).sort()
  fs.writeFileSync(workspaceJsonPath, JSON.stringify(workspaceJson, null, 2))
}

let fail = false
for (const [tile, arr] of parcels) {
  if (arr.length > 1) {
    fail = true
    console.error(`❌🔴 Tile ${tile} has two or more scenes assigned: \n${arr.join('\n')}`)
  }
}

if (fail) {
  process.exit(1)
}
else{
  console.log('✅ No collisions found')
}