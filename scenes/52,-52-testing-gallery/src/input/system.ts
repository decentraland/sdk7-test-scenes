import * as components from '@dcl/ecs/dist/components'
import {
  DeepReadonly,
  DeepReadonlyObject,
  Entity,
  IEngine,
  InputAction,
  PBPointerEventsResult,
  PointerEventType,
  PointerEventsResult as _PointerEventsResult
} from '@dcl/sdk/ecs'

const InputCommands: InputAction[] = [
  InputAction.IA_POINTER,
  InputAction.IA_PRIMARY,
  InputAction.IA_SECONDARY,
  InputAction.IA_FORWARD,
  InputAction.IA_BACKWARD,
  InputAction.IA_RIGHT,
  InputAction.IA_LEFT,
  InputAction.IA_JUMP,
  InputAction.IA_WALK,
  InputAction.IA_ACTION_3,
  InputAction.IA_ACTION_4,
  InputAction.IA_ACTION_5,
  InputAction.IA_ACTION_6
]

const InputStateUpdateSystemPriority = 1 << 20

/**
 * @internal
 */
export function createInputSystem(engine: IEngine) {
  const PointerEventsResult = engine.getComponent(_PointerEventsResult.componentId) as typeof _PointerEventsResult
  const globalState = {
    previousFrameMaxTimestamp: 0,
    currentFrameMaxTimestamp: 0,
    buttonState: new Map<InputAction, PBPointerEventsResult>(),
    thisFrameCommands: [] as DeepReadonlyObject<PBPointerEventsResult>[]
  }

  function* getLastTriggered(): Generator<[Entity, DeepReadonlyObject<PBPointerEventsResult>]> {
    for (const [entity, valueSet] of engine.getEntitiesWith(PointerEventsResult)) {
      for (const value of valueSet) {
        if (timestampIsCurrentFrame(value.timestamp)) {
          yield [entity, value]
        }
      }
    }
  }

  function findLastAction(
    pointerEventType: PointerEventType,
    inputAction: InputAction,
    entity: Entity
  ): PBPointerEventsResult | undefined {
    const ascendingTimestampIterator = PointerEventsResult.get(entity)
    for (const command of Array.from(ascendingTimestampIterator).reverse()) {
      if (command.button === inputAction && command.state === pointerEventType) {
        return command
      }
    }
  }

  function* findCommandsByActionDescending(
    inputAction: InputAction,
    entity: Entity
  ): Iterable<DeepReadonly<PBPointerEventsResult>> {
    const ascendingTimestampIterator = PointerEventsResult.get(entity)
    for (const command of Array.from(ascendingTimestampIterator).reverse()) {
      if (command.button === inputAction) {
        yield command
      }
    }
  }

  function buttonStateUpdateSystem() {
    // first store the previous' frame timestamp
    let maxTimestamp = globalState.currentFrameMaxTimestamp
    globalState.previousFrameMaxTimestamp = maxTimestamp
    if (globalState.thisFrameCommands.length) {
      globalState.thisFrameCommands = []
    }

    // then iterate over all new commands
    for (const [, commands] of engine.getEntitiesWith(PointerEventsResult)) {
      // TODO: adapt the gset component to have a cached "reversed" option by default
      const arrayCommands = Array.from(commands)
      for (let i = arrayCommands.length - 1; i >= 0; i--) {
        const command = arrayCommands[i]
        if (command.timestamp > maxTimestamp) {
          maxTimestamp = command.timestamp
        }

        if (command.timestamp > globalState.previousFrameMaxTimestamp) {
          globalState.thisFrameCommands.push(command)
        }

        if (command.state === PointerEventType.PET_UP || command.state === PointerEventType.PET_DOWN) {
          const prevCommand = globalState.buttonState.get(command.button)
          if (!prevCommand || command.timestamp > prevCommand.timestamp) {
            globalState.buttonState.set(command.button, command)
          } else {
            // since we are iterating a descending array, we can early finish the
            // loop
            break
          }
        }
      }
    }

    // update current frame's max timestamp
    globalState.currentFrameMaxTimestamp = maxTimestamp
  }

  engine.addSystem(buttonStateUpdateSystem, InputStateUpdateSystemPriority, '@dcl/ecs#inputSystem')

  function timestampIsCurrentFrame(timestamp: number) {
    if (timestamp > globalState.previousFrameMaxTimestamp && timestamp <= globalState.currentFrameMaxTimestamp) {
      return true
    } else {
      return false
    }
  }

  function getClick(inputAction: InputAction, entity: Entity) {
    if (inputAction !== InputAction.IA_ANY) {
      return findClick(inputAction, entity)
    }

    for (const input of InputCommands) {
      const cmd = findClick(input, entity)
      if (cmd) return cmd
    }
    return null
  }

  function findClick(inputAction: InputAction, entity: Entity) {
    let down: PBPointerEventsResult | null = null
    let up: PBPointerEventsResult | null = null

    // We search the last UP & DOWN command sorted by timestamp descending
    for (const it of findCommandsByActionDescending(inputAction, entity)) {
      if (!up) {
        if (it.state === PointerEventType.PET_UP) {
          up = it
          continue
        }
      } else if (!down) {
        if (it.state === PointerEventType.PET_DOWN) {
          down = it
          break
        }
      }
    }

    if (!up || !down) return null

    // If the DOWN command has happen before the UP commands, it means that that a clicked has happen
    if (down.timestamp < up.timestamp && timestampIsCurrentFrame(up.timestamp)) {
      return { up, down }
    }

    return null
  }

  function getInputCommandFromEntity(
    inputAction: InputAction,
    pointerEventType: PointerEventType,
    entity: Entity
  ): PBPointerEventsResult | null {
    if (inputAction !== InputAction.IA_ANY) {
      return findInputCommand(inputAction, pointerEventType, entity)
    }

    for (const input of InputCommands) {
      const cmd = findInputCommand(input, pointerEventType, entity)
      if (cmd) return cmd
    }
    return null
  }

  function getInputCommand(
    inputAction: InputAction,
    pointerEventType: PointerEventType,
    entity?: Entity
  ): PBPointerEventsResult | null {
    if (entity) {
      return getInputCommandFromEntity(inputAction, pointerEventType, entity)
    } else {
      for (const command of globalState.thisFrameCommands) {
        if (
          (command.button === inputAction || inputAction === InputAction.IA_ANY) &&
          command.state === pointerEventType
        ) {
          return command
        }
      }
      return null
    }
  }

  function findInputCommand(
    inputAction: InputAction,
    pointerEventType: PointerEventType,
    entity: Entity
  ): PBPointerEventsResult | null {
    // We search the last pointer Event command sorted by timestamp
    const command = findLastAction(pointerEventType, inputAction, entity)
    if (!command) return null

    if (timestampIsCurrentFrame(command.timestamp)) {
      return command
    } else {
      return null
    }
  }

  // returns true if there was a DOWN (in any past frame), and then an UP in the last frame
  function isClicked(inputAction: InputAction, entity: Entity) {
    return getClick(inputAction, entity) !== null
  }

  // returns true if the provided last action was triggered in the last frame
  function isTriggered(inputAction: InputAction, pointerEventType: PointerEventType, entity?: Entity) {
    if (entity) {
      const command = findLastAction(pointerEventType, inputAction, entity)
      return (command && timestampIsCurrentFrame(command.timestamp)) || false
    } else {
      for (const command of globalState.thisFrameCommands) {
        if (
          (command.button === inputAction || inputAction === InputAction.IA_ANY) &&
          command.state === pointerEventType
        ) {
          return true
        }
      }
      return false
    }
  }

  // returns the global state of the input. This global state is updated from the system
  function isPressed(inputAction: InputAction) {
    return globalState.buttonState.get(inputAction)?.state === PointerEventType.PET_DOWN
  }

  return {
    isPressed,
    getClick,
    getInputCommand,
    isClicked,
    isTriggered,
    getLastTriggered
  }
}
