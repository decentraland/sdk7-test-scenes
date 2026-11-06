import { engine, type Entity, type SystemFn } from '@dcl/sdk/ecs'

export type Tracker = {
  /** Create an entity and own it. */
  add: () => Entity
  /** Adopt an entity created elsewhere (e.g. by a @dcl-sdk/utils helper). */
  track: (entity: Entity) => void
  /** Add a system and own it. */
  addSystem: (system: SystemFn, priority?: number, name?: string) => void
  /** Remove every owned entity and system. */
  clean: () => void
  entities: () => Entity[]
}

/**
 * Small ownership helper: everything a subscene creates goes through its tracker,
 * so leaving the subscene always leaves the scene exactly as it was.
 */
export function createTracker(label: string): Tracker {
  let entities: Entity[] = []
  let systems: { system: SystemFn; name?: string }[] = []

  return {
    add(): Entity {
      const entity = engine.addEntity()
      entities.push(entity)
      return entity
    },
    track(entity: Entity): void {
      if (!entities.includes(entity)) entities.push(entity)
    },
    addSystem(system: SystemFn, priority?: number, name?: string): void {
      engine.addSystem(system, priority, name)
      systems.push({ system, name })
    },
    clean(): void {
      for (const item of systems) {
        const removed = item.name !== undefined ? engine.removeSystem(item.name) : engine.removeSystem(item.system)
        if (!removed && item.name !== undefined) engine.removeSystem(item.system)
      }
      systems = []
      for (const entity of entities) {
        try {
          engine.removeEntity(entity)
        } catch {
          // already gone (a subscene removed it by hand): nothing to clean
        }
      }
      entities = []
      console.log(`[qa-hub] ${label} cleaned`)
    },
    entities(): Entity[] {
      return [...entities]
    }
  }
}
