import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [runtimePath, meshPath, routesPath] = process.argv.slice(2)
if (!runtimePath || !meshPath || !routesPath) {
  throw new Error('Usage: node measure.mjs <runtime.mjs> <mesh.ts> <routes.json>')
}
const moduleUrl = (file) => pathToFileURL(resolve(file)).href
const { openNavigation } = await import(moduleUrl(runtimePath))
const { default: mesh } = await import(moduleUrl(meshPath))
const routes = JSON.parse(await readFile(routesPath, 'utf8'))
if (!Array.isArray(routes) || !routes.length) throw new Error('Expected a nonempty route list.')
const start = performance.now()
const navigator = await openNavigation(mesh)
const openMs = performance.now() - start
try {
  const results = routes.map(({ id, start, goal, expected }) => {
    const result = navigator.route(start, goal)
    if (result.status !== expected) throw new Error(id + ' expected ' + expected + ', got ' + result.status)
    const count = 128
    const samplesMs = Array.from({ length: 5 }, () => {
      const begin = performance.now()
      for (let index = 0; index < count; index++) navigator.route(start, goal)
      return performance.now() - begin
    })
    return { id, status: result.status, queriesPerSample: count, samplesMs }
  })
  console.log(JSON.stringify({ backend: mesh.backend, openMs, results }, null, 2))
} finally {
  navigator.dispose()
}
