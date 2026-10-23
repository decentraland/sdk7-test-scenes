# HTN integration recipes

Paths below are relative to your scene's `src/index.ts`. Install with `--starter` for the guard domain and its include.
If your scene already has `main()`, merge the relevant setup into it. Your game owns the code outside `htn-planner/`.

## 1. A capsule guard

```ts
import { createCapsuleBody, GuardSquad, plannerFor, v3 } from './htn-planner'
import { guardDomain } from './npc/guard/guard.htn'

export function main() {
  const guards = new GuardSquad({ planner: plannerFor(guardDomain), reasoning: 'reasoning' })
  guards.spawn([{ id: 'guard', route: [v3(4, 0, 4), v3(12, 0, 4), v3(12, 0, 12)], body: createCapsuleBody }])
}
```

Run your preview. Expect a capsule to patrol its three waypoints, react to the local player and investigate last-seen
positions or noises. Position the route inside your scene. This is local-client NPC simulation; the module does not
synchronize NPCs across players. Call `guards.despawn()` when the encounter ends. Spawn registers one squad system;
adding another update system would tick the same NPCs twice.

Change behaviour in your game-owned `src/npc/guard/guard.domain` and its `guard_kit.domain` include, then regenerate:

```sh
npm run htn:compile -- src/npc/guard/guard.domain src/npc/guard/guard.htn.ts guardDomain
npm run htn:compile -- --check src/npc/guard/guard.domain
```

Edit `.domain` sources, not generated `.htn.ts` files. The compile command needs the include beside its source.

## 2. Drive an existing entity

Keep your model and audio in your own assets folder. Instead of `createCapsuleBody`, use `possessEntityBody`:

```ts
import { Entity } from '@dcl/sdk/ecs'
import { GuardSquad, plannerFor, possessEntityBody, v3 } from './htn-planner'
import { guardDomain } from './npc/guard/guard.htn'

export function startGuard(entity: Entity) {
  const guards = new GuardSquad({ planner: plannerFor(guardDomain), reasoning: 'reasoning' })
  guards.spawn([{ id: 'guard', route: [v3(4, 0, 4), v3(12, 0, 12)], body: () => possessEntityBody(entity, { groundY: 0 }) }])
  return guards
}
```

Call `startGuard` once the entity has a Transform. Choose `groundY` for its feet and `facingYaw` if the model faces away
from +Z. Despawn restores the entity's original pose. Animation and sound remain your host's responsibility; look for
`src/examples/stalker/` locally in `reference/htn/`, then in the source URL from `SOURCE.json` if absent.

## 3. Add your own facts and actions

Use `syncFacts` and `actions` instead of editing library source. This setup supports a domain that reads
`(door_open 1)` and emits `(!ring_bell)`:

```ts
import { bool, createCapsuleBody, GuardSquad, instant, plannerFor, v3 } from './htn-planner'
import { guardDomain } from './npc/guard/guard.htn'

export function main() {
  let doorOpen = false // Change this from your game's door events.
  const guards = new GuardSquad({
    planner: plannerFor(guardDomain),
    reasoning: 'reasoning',
    syncFacts(agent) {
      agent.blackboard.world.set('door_open', bool(doorOpen))
      return String(doorOpen) // A changed key requests a replan.
    },
    actions: {
      '!ring_bell': () => instant(() => {
        console.log('Bell rang') // Replace with your game effect.
        return 'done'
      })
    }
  })
  guards.spawn([{ id: 'guard', route: [v3(4, 0, 4), v3(12, 0, 12)], body: createCapsuleBody }])
}
```

A host BOOL fact matches the integer `1` for true or `0` for false; `true`/`false` in a domain are symbols.
The starter domain does not yet use that fact/action: add the relevant condition and task to your game-owned domain,
then compile it. Built-in guard actions remain available; a custom factory with the same name replaces that action.
Factories create an executor per step (`start`, `update`, `cancel`); return `failed` when an action cannot finish.
Write a real effect only when it occurs. For a game event that needs a decision without changing a fact key, call
`handle.agent.requestReplan('door changed')` on the relevant guard handle from `guards.guards`.

For a host with its own movement/execution loop, use `GuardAgent` directly, or set `GuardSquad`'s `system: false` and call
`guards.update(dt)` from your own loop. See the [NPC reference](npc/README.md) for advanced contracts.

## 4. Inspect a decision, optionally

```ts
import { agentHistory, GuardSquad, PlanTraceRecorder, plannerFor } from './htn-planner'
import { guardDomain } from './npc/guard/guard.htn'

const trace = new PlanTraceRecorder(guardDomain)
const guards = new GuardSquad({
  planner: plannerFor(guardDomain, { trace }),
  reasoning: 'reasoning',
  history: () => agentHistory(128)
})
```

Add your normal spawn. Read `trace.runs` and agent history when investigating a decision. For several guards, give each
its own recorder with the `(world, spec)` planner factory. Trace/history record extra data and allocate; leave their
options unset in normal play. This does not install debugger UI or any gallery assets.

The full scene's `src/debugger/` and repository tools `htn:run`, `htn:view`, `htn:level`, `htn:golden` are optional demo/toolkit
consumers, not a portable dependency of the library/compiler install. In particular, `htn:run` uses built-in example
catalogues and the demo's runner. Run those tools in the source checkout; copying their launchers alone is insufficient.
Inspect their sources through the local-reference/GitHub route in the [module guide](README.md#examples-for-people-and-ai).

## 5. Use the planner without SDK entities

Import `PlanRunner` from `./htn-planner/htn/planner` and `WorldState` from `./htn-planner/htn/world-state` when you only need
planning. These modules are SDK-independent; the top-level barrel also exposes SDK adapters. You provide facts,
callterms and action execution. Follow the [planner interface and semantics](htn/README.md); the planner does not
simulate primitive effects or repair part of a plan.
