import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const sdkTools = createRequire(require.resolve('@dcl/sdk-commands/package.json'))
const extract = sdkTools('extract-zip')
const root = await mkdtemp(join(tmpdir(), 'sdk7-navmesh-kits-'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
console.log('Consumer fixtures: ' + root)

async function run(cwd, ...args) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? done() : reject(new Error(args[0] + ' failed: ' + code)))
  })
}

const checksums = await readFile('downloads/SHA256SUMS', 'utf8')
async function unpack(backend, kind, dir) {
  const filename = backend + '-' + kind + '-v1.zip'
  const archive = resolve('downloads', filename)
  const sum = sha256(await readFile(archive)) + '  ' + filename
  if (!checksums.split('\n').includes(sum)) throw new Error(filename + ' does not match SHA256SUMS.')
  await mkdir(dir, { recursive: true })
  await extract(archive, { dir })
  const manifest = JSON.parse(await readFile(join(dir, 'SOURCE.json'), 'utf8'))
  for (const [file, expected] of Object.entries(manifest.files)) {
    const contents = await readFile(join(dir, file))
    if (contents.length !== expected.bytes || sha256(contents) !== expected.sha256) throw new Error(file + ' checksum mismatch.')
  }
}

for (const backend of ['navcat', 'detour']) {
  const scene = join(root, backend)
  const offline = join(root, backend + '-offline')
  await unpack(backend, 'sdk7', scene)
  await unpack(backend, 'bake', offline)
  await run(offline, 'bake.mjs', 'surfaces.json', 'baked.ts')
  const sourceMesh = join(scene, 'src/navmesh/examples/mesh.ts')
  await writeFile(join(offline, 'verify.mjs'), String.raw`
import { openNavigation } from ${JSON.stringify(pathToFileURL(join(scene, 'src/navmesh/runtime.mjs')).href)}
import mesh from './baked.ts'
import { readFile } from 'node:fs/promises'
const starter = await readFile(${JSON.stringify(sourceMesh)}, 'utf8')
if (JSON.stringify(mesh) !== starter.slice('export default '.length, -' as const\n'.length)) {
  throw new Error('Baker does not reproduce the starter mesh.')
}
const wrongBackend = mesh.backend === 'navcat' ? 'detour' : 'navcat'
await openNavigation({ ...mesh, backend: wrongBackend }).then(
  () => { throw new Error('The other backend mesh was accepted.') },
  (error) => { if (!String(error).includes('Expected')) throw error },
)
await openNavigation({ ...mesh, mesh: { nodes: [], tiles: {}, tileWidth: 1 } }).then(
  () => { throw new Error('An incomplete mesh was accepted.') },
  (error) => { if (!String(error).includes('Invalid')) throw error },
)
const nav = await openNavigation(mesh)
const upper = nav.route([12.4, 0, 2.6], [8, 3, 11.5])
const isolated = nav.route([8, 0, 7], [7.5, 3, 3])
if (upper.status !== 'complete' || Math.abs(upper.points.at(-1)[1] - 3) > .35 || isolated.status !== 'unreachable') {
  throw new Error('The copied runtime did not reproduce the example routes.')
}
nav.dispose()
nav.dispose()
console.log(mesh.backend + ': copied runtime and bake pass')
`)
  await run(offline, 'verify.mjs')
  await run(offline, 'measure.mjs', join(scene, 'src/navmesh/runtime.mjs'), 'baked.ts', 'routes.json')
  const sceneJson = JSON.parse(await readFile('scene.json', 'utf8'))
  sceneJson.display = { title: 'Copied navmesh kit · ' + backend }
  sceneJson.spawnPoints = sceneJson.spawnPoints.slice(0, 1)
  await writeFile(join(scene, 'scene.json'), JSON.stringify(sceneJson))
  await writeFile(join(scene, 'package.json'), JSON.stringify({
    name: 'sdk7-navmesh-consumer-' + backend, private: true, type: 'module',
    scripts: { build: 'sdk-commands build --skip-install' },
    devDependencies: { '@dcl/sdk': '7.30.1', '@dcl/js-runtime': '7.30.1', '@dcl/sdk-commands': '7.30.1' },
  }))
  await writeFile(join(scene, 'tsconfig.json'), JSON.stringify({
    extends: '@dcl/sdk/types/tsconfig.ecs7.json',
    compilerOptions: { strict: true, skipLibCheck: true },
    include: ['src/**/*.ts'],
  }))
  await writeFile(join(scene, '.dclignore'), '.*\nnode_modules\nsrc\npackage.json\ntsconfig.json\n**/*.md\n')
  await writeFile(join(scene, 'src/index.ts'), `
import { engine, Transform } from '@dcl/sdk/ecs'
import { startNavigationExample } from './navmesh/examples/starter'

export function main() {
  // Existing game-owned entry point and entity.
  Transform.create(engine.addEntity(), { position: { x: 1, y: 0, z: 1 } })
  startNavigationExample()
}
`)
  const modules = join(scene, 'node_modules/@dcl')
  await mkdir(modules, { recursive: true })
  for (const dependency of ['sdk', 'js-runtime', 'sdk-commands']) {
    await symlink(resolve('node_modules/@dcl', dependency), join(modules, dependency), 'junction')
  }
  const packageRunner = process.env.npm_execpath
  if (packageRunner && /pnpm\.(?:cjs|mjs|js)$/i.test(packageRunner)) {
    await run(scene, packageRunner, 'run', 'build')
  } else {
    await run(scene, require.resolve('@dcl/sdk-commands/dist/index.js'), 'build', '--skip-install', '--dir', scene)
  }
  const bin = await readFile(join(scene, 'bin/index.js'))
  console.log(backend + ': clean SDK7 build ' + bin.length + ' bytes')
}
