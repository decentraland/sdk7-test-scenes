// Host callterms for the upstream example domains, after the C++ bindings of urosidoki/htn_planner HTNTest and the
// HTNDemo Wanderer host. get_health / get_max_speed read the entity's facts instead of upstream's constants, so a
// scene can edit them. request_path_from_to starts an asynchronous path query through the host (see the Wanderer
// station, gallery/wanderer.ts).
import { Atom, bool, callterm, CallTerm, CallTermType, FactRow, int, list, WorldState, withSignature } from '../../htn-planner'

export interface CalltermContext {
  world: WorldState
  /** Start a path query from → to; returns its id (0: none). Like upstream's Pathfinder (AIHTNDemoPathfinder.cpp:184)
   *  the host writes `pathfind_state in_progress` here, during the decomposition, so the same planning pass sees it;
   *  the result arrives later through the host's updates. */
  requestPath?(from: Atom, to: Atom): number
}

/** A grid cell: upstream's Cell converter, a list of two int32 (HTNDemo/src/World/DemoGridTerrain.h:35-57). */
export const CELL: CallTermType<{ x: number; y: number }> = {
  name: 'Cell',
  atom: 'list',
  fromAtom: a =>
    a.t === 'list' && a.v.length === 2 && a.v[0].t === 'int' && a.v[1].t === 'int' ? { x: a.v[0].v, y: a.v[1].v } : undefined,
  toAtom: c => list(int(c.x), int(c.y))
}

const intOf = (a: Atom | undefined) => (a && a.t === 'int' ? a.v : undefined)
const sameAtom = (a: Atom, b: Atom) => a.t === b.t && JSON.stringify(a.v) === JSON.stringify(b.v)

/** The second column of the first `name/2` row whose first column is `entity`. */
function valueOf(world: WorldState, name: string, entity: Atom): Atom | undefined {
  const row: FactRow | undefined = world.rows(name, 2).find(r => sameAtom(r[0], entity))
  return row?.[1]
}

const ctxOf = (context: unknown) => context as CalltermContext

export const upstreamCallterms: Record<string, CallTerm> = {
  binded_function_with_args: args => bool(args.length === 1 && args[0].t === 'str'),
  get_health: (args, context) => (args.length === 1 ? valueOf(ctxOf(context).world, 'health_value', args[0]) : undefined),
  get_max_speed: (args, context) => (args.length === 1 ? valueOf(ctxOf(context).world, 'speed_value', args[0]) : undefined),
  lt: args => {
    const a = intOf(args[0])
    const b = intOf(args[1])
    return a === undefined || b === undefined ? undefined : bool(a < b)
  },
  // HTNDemo typed bindings (AIHTNDemoWandererAgent.cpp:94-96, AIHTNDemoPathfinder.cpp:36-40).
  inc: callterm(['int'], n => n + 1, 'int'),
  same_location: callterm([CELL, CELL], (a, b) => a.x === b.x && a.y === b.y, 'bool'),
  both_coordinates_even: callterm([CELL], c => c.x % 2 === 0 && c.y % 2 === 0, 'bool'),
  both_coordinates_odd: callterm([CELL], c => Math.abs(c.x % 2) === 1 && Math.abs(c.y % 2) === 1, 'bool'),
  // Upstream: a member binding of the pathfinder daemon over two Cells; the station host is the daemon here.
  request_path_from_to: withSignature(['list', 'list'], (args, context) => {
    const request = ctxOf(context).requestPath
    return request ? int(request(args[0], args[1])) : undefined
  })
}
