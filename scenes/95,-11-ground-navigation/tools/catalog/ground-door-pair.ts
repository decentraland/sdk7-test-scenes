import type { Point } from '../../src/arena'
import type { Route } from '../../src/navigation'
import { traversalSurfaces } from '../sdk-detour-probe/traversal-routing'
import { floor, usingMesh } from './ground'
import { groundClearance, groundFollower, pointDistance, rectangleEdges } from './ground-motion'
import { TILE_EDGE } from './native-tiles'
import { box, check, type CatalogCase } from './types'

const radius = 0.18
const centers: readonly Point[] = [[1.5, 0, 1.85], [3, 0, 2.37], [4.6, 0, 2.94]]
const surfaces = [
  floor(0, 2.25, 0, 3.4), floor(2.25, 2.65, 1.48, 2.22), floor(2.65, 3.35, 0, 3.4),
  floor(3.35, 3.75, 2.60, 3.28), floor(3.75, 6, 0, 3.4)
]
const doors = [
  box('left door', 'obstacle', [2.3, 0, 1.47], [2.55, 2, 2.23]),
  box('right door', 'obstacle', [3.45, 0, 2.59], [3.7, 2, 3.29])
]
const doorBounds = doors.map(({ center, size }) =>
  rectangleEdges(center[0] - size[0] / 2, center[0] + size[0] / 2, center[2] - size[2] / 2, center[2] + size[2] / 2))

function physicalFloor(faces: typeof surfaces, blocking: typeof doors) {
  const boxes = faces.map(({ vertices }, i) =>
    box('section ' + i, 'surface', [vertices[0][0], -0.2, vertices[0][2]], [vertices[2][0], 0, vertices[2][2]]))
  return traversalSurfaces([...boxes, ...blocking], 1.4)
}

export const independentDoors: CatalogCase['run'] = (backend) => {
  const maxZ = Math.max(...surfaces.flatMap(({ vertices }) => vertices.map((vertex) => vertex[2])))
  const tile = ([x, , z]: Point) => `${Math.floor(x / TILE_EDGE)},${Math.floor((maxZ - z) / TILE_EDGE)}`
  const tiles = doorBounds.flatMap((edges) => edges.map(([vertex]) => tile(vertex)))
  const [left, middle, right] = centers
  const options = { radius, tiled: true }
  const staged = usingMesh(backend, surfaces, (nav) => [left, right].map((start) => nav.route(start, middle)), options)
  const trials = [[true, true], [false, true], [false, false], [true, false], [true, true]].map((open) =>
    usingMesh(backend, physicalFloor(surfaces, doors.filter((_, index) => !open[index])), (nav) => {
      const approaches = [left, right]
      const safe = (from: Point, to: Point) => doorBounds.every((edges, index) =>
        open[index] || groundClearance([from, to], edges) >= radius - 0.005)
      const outcome = (start: Point, goal: Point, route: Route) => {
        const follower = groundFollower(start)
        follower.assign(route.points)
        let blocked = false
        for (let tick = 0; tick < 100 && !follower.finished() && !blocked; tick++) {
          blocked = !follower.step(0.1, safe)
        }
        return { arrived: pointDistance(follower.position(), goal) < 0.1, blocked }
      }
      const branches = approaches.map((start, index) => {
        const intoMiddle = nav.route(start, middle)
        const fromMiddle = nav.route(middle, start)
        const inbound = outcome(start, middle, intoMiddle)
        const outbound = outcome(middle, start, fromMiddle)
        const stale = outcome(start, middle, staged[index])
        return (intoMiddle.status === 'complete') === open[index] && (fromMiddle.status === 'complete') === open[index] &&
          inbound.arrived === open[index] && outbound.arrived === open[index] && !inbound.blocked && !outbound.blocked &&
          stale.arrived === open[index] && stale.blocked === !open[index]
      })
      return branches.every(Boolean) && outcome(middle, [3, 0, 2], nav.route(middle, [3, 0, 2])).arrived
    }, options))
  return check(tiles.every((value) => value === tiles[0]) && staged.every((route) => route.status === 'complete') &&
    trials.every(Boolean),
  'Two actual blockers inside the same coarse tile. Checks both directions and stale movement across all four states, then reopens both. ' +
    JSON.stringify({ tile: tiles[0], trials }))
}
