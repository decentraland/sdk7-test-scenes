import type { SystemFn } from '@dcl/sdk/ecs'
import { engine } from '@dcl/sdk/ecs'

type SystemItem = { system: SystemFn; name?: string }

function createSystemManagerFunction(): {
  addSystem: (system: SystemFn, priority?: number, name?: string) => void
  addSystemWithInverval: (
    system: SystemFn,
    interval: number,
    name: string,
    priority?: number
  ) => void
  removeSystem: (selector: string | SystemFn) => boolean
  clean: () => void
  isEmpty: () => boolean
  items: () => SystemItem[]
} {
  let arr: SystemItem[] = []

  return {
    addSystem(system: SystemFn, priority?: number, name?: string) {
      engine.addSystem(system, priority, name)
      arr.push({ system, name })
    },
    addSystemWithInverval(
      system: SystemFn,
      interval: number,
      name: string,
      priority?: number
    ) {
      let t = 0
      const wrappedSystem = (dt: number): void => {
        t += dt
        if (t > interval) {
          system(t)
          t -= interval
        }
      }
      this.addSystem(wrappedSystem, priority, name)
    },
    removeSystem(selector: string | SystemFn) {
      const element = arr.find(
        (item) => item.name === selector || item.system === selector
      )
      if (element === undefined) return false

      let result = false
      if (element.name !== undefined) {
        result = engine.removeSystem(element.name)
      } else {
        result = engine.removeSystem(element.system)
      }

      arr = arr.filter((item) => item !== element)
      return result
    },
    clean() {
      for (const item of arr) {
        if (item.name !== undefined) {
          engine.removeSystem(item.name)
        } else {
          engine.removeSystem(item.system)
        }
      }
      arr = []
    },
    isEmpty() {
      return arr.length === 0
    },
    items() {
      return arr
    }
  }
}

export const sceneSystems = createSystemManagerFunction()
