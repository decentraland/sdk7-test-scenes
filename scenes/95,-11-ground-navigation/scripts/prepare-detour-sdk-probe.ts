import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const crowdLoad = process.argv.includes('--crowd-load')
const traversal = process.argv.includes('--traversal-compare')
const sdkAvatars = process.argv.includes('--sdk-avatars')
const sdkIntegration = process.argv.includes('--sdk-integration') || sdkAvatars
const wallSegments = process.argv.includes('--wall-segments')
const creatorRecipes = process.argv.includes('--creator-recipes')
const recipeCase = process.argv.find((arg) => arg.startsWith('--recipe-case='))?.slice('--recipe-case='.length)
const wasmModule = process.argv.find((arg) => arg.startsWith('--detour-wasm='))?.slice('--detour-wasm='.length)
if (wallSegments && (!wasmModule || sdkIntegration || traversal || crowdLoad || creatorRecipes)) {
  throw new Error('--wall-segments requires --detour-wasm=<wasm-compat.js> and its own probe.')
}
if (creatorRecipes && (sdkIntegration || traversal || crowdLoad)) throw new Error('--creator-recipes requires its own probe.')
if (recipeCase !== undefined && !creatorRecipes) throw new Error('--recipe-case requires --creator-recipes.')
const mode = creatorRecipes ? 'creator-recipes'
  : wallSegments ? 'wall-segments' : sdkIntegration ? 'sdk-integration' : traversal ? 'traversal-compare' : crowdLoad ? 'crowd-load' : 'detour'
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
const entry = creatorRecipes
  ? "import { runCreatorRecipesAcceptance } from '../../../tools/sdk-detour-probe/creator-recipes-acceptance'\n" +
    'export function main() { runCreatorRecipesAcceptance(' + (JSON.stringify(recipeCase) ?? '') + ') }\n'
  : wallSegments
  ? "import factory from './detour-wasm.js'\n" +
    "import { runWallSegmentsProbe } from '../../../tools/sdk-detour-probe/wall-segments-scene'\n" +
    'export function main() { void runWallSegmentsProbe(factory) }\n'
  : sdkIntegration
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
if (wallSegments && wasmModule) {
  await writeFile(resolve(folder, 'src/detour-wasm.js'), await readFile(resolve(wasmModule)))
  await writeFile(resolve(folder, 'src/detour-wasm.d.ts'),
    "declare const factory: NonNullable<Parameters<typeof import('recast-navigation').init>[0]>\nexport default factory\n")
}
if (sdkIntegration) await (await import('./sdk-landing-models')).writeLandingModels(folder)
if (creatorRecipes) await cp('models', resolve(folder, 'models'), { recursive: true })
console.log(folder)
