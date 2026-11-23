import { mkdir, writeFile } from 'node:fs/promises'
import { exportNavMesh, init } from 'recast-navigation'
import { getSurfaces } from '../src/arena'
import { bakeNavcatMesh } from '../src/navigation'
import { bakeDetourMesh } from '../test/detour'

function detourBytes(doorOpen: boolean) {
  const mesh = bakeDetourMesh(getSurfaces(doorOpen))
  try {
    return Array.from(exportNavMesh(mesh))
  } finally {
    mesh.destroy()
  }
}

async function main() {
  const output = new URL('../src/generated/', import.meta.url)
  await mkdir(output, { recursive: true })
  const meshes = {
    open: bakeNavcatMesh(getSurfaces(true)),
    closed: bakeNavcatMesh(getSurfaces(false))
  }
  const source = "import type { NavMesh } from 'navcat'\n\n" +
    "const meshes: { open: NavMesh; closed: NavMesh } = " + JSON.stringify(meshes) +
    '\n\nexport default meshes\n'
  await writeFile(new URL('meshes.ts', output), source)
  await init()
  const detour = { open: detourBytes(true), closed: detourBytes(false) }
  await writeFile(new URL('detour-meshes.ts', output), 'export default ' + JSON.stringify(detour) + '\n')
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
