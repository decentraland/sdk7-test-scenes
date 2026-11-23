import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const crowdLoad = process.argv.includes('--crowd-load')
const traversal = process.argv.includes('--traversal-compare')
const sdkAvatars = process.argv.includes('--sdk-avatars')
const sdkIntegration = process.argv.includes('--sdk-integration') || sdkAvatars
const mode = sdkIntegration ? 'sdk-integration' : traversal ? 'traversal-compare' : crowdLoad ? 'crowd-load' : 'detour'
const folder = resolve('.comparison', mode + '-sdk')
await mkdir(resolve(folder, 'src'), { recursive: true })
try {
  await symlink(resolve('node_modules'), resolve(folder, 'node_modules'), 'junction')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
}

const scene = JSON.parse(await readFile('scene.json', 'utf8'))
scene.display = { title: 'SDK7 ' + mode + ' probe', description: 'Local navigation runtime comparison' }
await writeFile(resolve(folder, 'scene.json'), JSON.stringify(scene))
await writeFile(resolve(folder, 'package.json'), JSON.stringify({ name: 'sdk7-detour-probe', private: true, type: 'module' }))
await writeFile(resolve(folder, 'tsconfig.json'), JSON.stringify({
  extends: '@dcl/sdk/types/tsconfig.ecs7.json',
  compilerOptions: { strict: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
  include: ['src/**/*.ts']
}))
await writeFile(resolve(folder, '.dclignore'), '.*\nnode_modules\nsrc\npackage.json\ntsconfig.json\n')
const entry = sdkIntegration
  ? "import { runSdkIntegrationScene } from '../../../tools/sdk-detour-probe/sdk-integration-scene'\n" +
    'export function main() { runSdkIntegrationScene(' + sdkAvatars + ') }\n'
  : traversal
  ? "import { runTraversalComparisonScene } from '../../../tools/sdk-detour-probe/traversal-compare-scene'\n" +
    'export function main() { runTraversalComparisonScene() }\n'
  : crowdLoad
  ? "import { runCrowdLoadScene } from '../../../tools/sdk-detour-probe/crowd-load-scene'\n" +
    "import type { CrowdLoadData } from '../../../tools/sdk-detour-probe/crowd-load-backends'\n" +
    'const data: CrowdLoadData = ' + JSON.stringify(await (await import('./bake-crowd-load')).bakeCrowdLoad()) + '\n' +
    'export function main() { runCrowdLoadScene(data) }\n'
  : "import { runProbe } from '../../../tools/sdk-detour-probe/probe'\n" +
    'export function main() { runProbe() }\n'
await writeFile(resolve(folder, 'src/index.ts'), entry)
if (sdkIntegration) await (await import('./sdk-landing-models')).writeLandingModels(folder)
console.log(folder)
