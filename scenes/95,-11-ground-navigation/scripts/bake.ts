import { mkdir, writeFile } from 'node:fs/promises'
import { getSurfaces } from '../src/arena'
import { bakeNavcatMesh } from '../src/navigation'

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
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
