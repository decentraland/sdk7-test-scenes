import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, resolve } from 'node:path'
import { getSurfaces, SCENARIOS } from '../src/navmesh/examples/layout.ts'
import { prepareMesh as prepareNavcat } from '../tools/navmesh/bake-navcat.ts'
import { prepareMesh as prepareDetour } from '../tools/navmesh/bake-detour.ts'

const require = createRequire(import.meta.url)
const sdkTools = createRequire(require.resolve('@dcl/sdk-commands/package.json'))
const { build } = sdkTools('esbuild')
const archiver = sdkTools('archiver')
const date = new Date('2000-01-01T00:00:00Z')
const verify = process.argv.includes('--verify')
const output = resolve('downloads')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const text = async (path) => (await readFile(path, 'utf8')).replace(/\r\n/g, '\n')
const navcatRoot = await realpath('node_modules/navcat')
const backends = [
  {
    name: 'navcat',
    prepare: prepareNavcat,
    sources: [
      { name: 'navcat', version: '0.4.1', url: 'https://github.com/isaac-mason/navcat', license: 'MIT' },
      { name: 'mathcat', version: '0.0.12', url: 'https://github.com/isaac-mason/mathcat', license: 'MIT' },
    ],
    notices: {
      'navcat.txt': resolve(navcatRoot, 'LICENSE'),
      'mathcat.txt': resolve(dirname(navcatRoot), 'mathcat/LICENSE'),
    },
    forbiddenInput: 'recast-navigation',
  },
  {
    name: 'detour',
    prepare: prepareDetour,
    sources: [
      { name: 'recast-navigation-js', version: '0.44.0', url: 'https://github.com/isaac-mason/recast-navigation-js', license: 'MIT' },
      { name: 'Recast Navigation (compiled in the stock WASM)', revision: '599fd0f023181c0a484df2a18cf1d75a3553852e', url: 'https://github.com/isaac-mason/recastnavigation/tree/599fd0f023181c0a484df2a18cf1d75a3553852e', license: 'Zlib' },
      { name: 'FastLZ (compiled in the stock WASM)', url: 'https://github.com/isaac-mason/recastnavigation/blob/599fd0f023181c0a484df2a18cf1d75a3553852e/RecastDemo/Contrib/fastlz/fastlz.c', license: 'MIT' },
    ],
    notices: {
      'recast-navigation-js.txt': 'node_modules/recast-navigation/LICENSE',
      'RecastNavigation.txt': 'tools/navmesh/notices/RecastNavigation.txt',
      'FastLZ.txt': 'tools/navmesh/notices/FastLZ.txt',
    },
    forbiddenInput: '/navcat/',
  },
]

async function bundle(contents, platform, backend) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    platform, format: 'esm', target: platform === 'node' ? 'es2022' : 'es2020',
    bundle: true, write: false, minify: true,
    metafile: true, legalComments: 'none',
    // The stock compat WASM contains its binary. There is no sibling asset URL.
    define: platform === 'browser' && backend.name === 'detour' ? { 'import.meta.url': '""' } : undefined,
  })
  const [entry] = Object.values(result.metafile.outputs)
  const external = entry.imports.filter(({ path }) => platform === 'browser' || !isBuiltin(path))
  if (external.length) throw new Error(backend.name + ' contains external dependencies: ' + JSON.stringify(external))
  if (Object.entries(entry.inputs).some(([path, { bytesInOutput }]) =>
    path.replaceAll('\\', '/').includes(backend.forbiddenInput) && bytesInOutput > 0
  )) throw new Error(backend.name + ' includes the other backend.')
  return Buffer.from(result.outputFiles[0].contents)
}

async function archive(files) {
  const zip = archiver('zip', { zlib: { level: 9 } })
  const buffers = []
  const complete = new Promise((resolve, reject) => {
    zip.on('data', (buffer) => buffers.push(buffer))
    zip.once('end', () => resolve(Buffer.concat(buffers)))
    zip.once('error', reject)
  })
  for (const [name, data] of Object.entries(files)) zip.append(data, { name, date, mode: 0o644 })
  await zip.finalize()
  return complete
}

async function publish(name, bytes) {
  const path = resolve(output, name)
  if (verify) {
    if (!bytes.equals(await readFile(path))) throw new Error(name + ' is stale. Run pnpm navmesh:pack.')
  } else {
    await writeFile(path, bytes)
  }
}

if (!verify) await mkdir(output, { recursive: true })
const checksums = []
for (const backend of backends) {
  const { name } = backend
  const notices = { 'licenses/Ground Navigation Lab.txt': await text('LICENSE') }
  for (const [file, path] of Object.entries(backend.notices)) notices['licenses/' + file] = await text(path)
  const runtime = await bundle('export { openNavigation } from "./src/navmesh/' + name + '-runtime.ts"', 'browser', backend)
  const baker = await bundle(
    'import { bakeCli } from "./tools/navmesh/bake-cli.ts"; import { prepareMesh } from "./tools/navmesh/bake-' +
    name + '.ts"; await bakeCli(prepareMesh);',
    'node', backend,
  )
  const starter = await backend.prepare(getSurfaces(true))
  const kits = [
    ['sdk7', {
      'README.md': await text('tools/navmesh/consumer-readme.md'),
      'src/navmesh/runtime.mjs': runtime,
      'src/navmesh/runtime.d.mts': "import type { OpenNavigation } from './types'\nexport declare const openNavigation: OpenNavigation\n",
      'src/navmesh/types.ts': await text('src/navmesh/types.ts'),
      'src/navmesh/examples/layout.ts': await text('src/navmesh/examples/layout.ts'),
      'src/navmesh/examples/two-floors.ts': await text('src/navmesh/examples/two-floors.ts'),
      'src/navmesh/examples/mesh.ts': 'export default ' + JSON.stringify(starter) + ' as const\n',
      'src/navmesh/examples/starter.ts': "import { openNavigation } from '../runtime.mjs'\nimport mesh from './mesh'\nimport { mountTwoFloorExample } from './two-floors'\n\nexport function startNavigationExample() {\n  return mountTwoFloorExample(openNavigation, mesh)\n}\n",
    }],
    ['bake', {
      'README.md': await text('tools/navmesh/bake-readme.md'),
      'bake.mjs': baker,
      'measure.mjs': await text('tools/navmesh/measure.mjs'),
      'surfaces.json': JSON.stringify({ surfaces: getSurfaces(true) }, null, 2) + '\n',
      'routes.json': JSON.stringify(SCENARIOS.filter(({ doorOpen }) => doorOpen).map(({ id, start, goal, expected }) =>
        ({ id, start, goal, expected })), null, 2) + '\n',
    }],
  ]
  for (const [kind, entries] of kits) {
    const files = { ...entries, ...notices }
    const manifest = {
      version: 1, backend: name, kind,
      source: 'https://github.com/decentraland/sdk7-test-scenes/tree/main/scenes/95,-11-ground-navigation',
      previewSource: 'https://github.com/decentraland/sdk7-test-scenes/tree/feat/sdk7-navmesh-port/scenes/95,-11-ground-navigation',
      sources: backend.sources,
      files: Object.fromEntries(Object.entries(files).map(([file, data]) =>
        [file, { bytes: Buffer.byteLength(data), sha256: sha256(data) }]
      )),
    }
    files['SOURCE.json'] = JSON.stringify(manifest, null, 2) + '\n'
    const filename = name + '-' + kind + '-v1.zip'
    const zip = await archive(files)
    await publish(filename, zip)
    checksums.push(sha256(zip) + '  ' + filename)
    console.log(filename + '  ' + zip.length + ' bytes')
  }
}
await publish('SHA256SUMS', Buffer.from(checksums.join('\n') + '\n'))
