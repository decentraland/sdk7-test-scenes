import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const folder = resolve('.comparison/detour-sdk')
await mkdir(resolve(folder, 'src'), { recursive: true })
try {
  await symlink(resolve('node_modules'), resolve(folder, 'node_modules'), 'junction')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
}

const scene = JSON.parse(await readFile('scene.json', 'utf8'))
scene.display = { title: 'SDK7 Detour Probe', description: 'Local navigation runtime comparison' }
await writeFile(resolve(folder, 'scene.json'), JSON.stringify(scene))
await writeFile(resolve(folder, 'package.json'), JSON.stringify({ name: 'sdk7-detour-probe', private: true, type: 'module' }))
await writeFile(resolve(folder, 'tsconfig.json'), JSON.stringify({
  extends: '@dcl/sdk/types/tsconfig.ecs7.json',
  compilerOptions: { strict: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
  include: ['src/**/*.ts']
}))
await writeFile(resolve(folder, '.dclignore'), '.*\nnode_modules\nsrc\npackage.json\ntsconfig.json\n')
await writeFile(resolve(folder, 'src/index.ts'),
  "import { runProbe } from '../../../tools/sdk-detour-probe/probe'\n" +
  "export function main() { runProbe() }\n"
)
console.log(folder)
