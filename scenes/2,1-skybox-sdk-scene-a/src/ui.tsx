// import { Color4 } from '@dcl/sdk/math'
// import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
// import * as ui from 'dcl-ui-toolkit'

// export function setupUi() {
//   ReactEcsRenderer.setUiRenderer(uiComponent)
//   //ReactEcsRenderer.setUiRenderer(ui.render)
// }

// const uiComponent = () => [
//   sceneTitle(),
//   sidePanel()
// ]

// function sceneTitle(){
//   return <UiEntity
//   uiTransform={{
//     width: 300,
//     height: 60,
//     positionType: 'absolute',
//     position: { top: 20, left: '50%' },
//     margin: '0 0 0 -150px', // Center horizontally by offsetting half the width
//     padding: 16,
//   }}
//   uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 0.8) }}
// >
//   <Label
//     value="Skybox Interactable"
//     fontSize={20}
//     color={Color4.White()}
//     uiTransform={{
//       width: '100%',
//       height: '100%',
//       alignItems: 'center',
//       justifyContent: 'center'
//     }}
//   />
// </UiEntity>
// }

// function sidePanel() {
//   return <UiEntity
//   />
// }

import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, SkyboxTime, TransitionMode } from '@dcl/sdk/ecs'
//import { formatSecondsToTime } from './utils'

// UI State
let useGlobalTime = true
let showSkyboxSection = false
let currentTimeValue = 65000
let inputTimeValue = '65000'
let useForwardTransition = true



// Function to update skybox time
function updateSkyboxTime(timeValue: number) {
  currentTimeValue = timeValue
  console.log(`useGlobalTime: ${useGlobalTime}`)
  if (!useGlobalTime) {
    SkyboxTime.createOrReplace(engine.RootEntity, {
      fixedTimeOfDay: timeValue,
      transitionMode: useForwardTransition ? TransitionMode.TM_FORWARD : TransitionMode.TM_BACKWARD
    })
    console.log(`Updated skybox time to: ${timeValue} (${formatSecondsToTime(timeValue)})`)
  }
}

// Function to handle Global Time button click
function handleUseGlobalTime() {
  useGlobalTime = true
  showSkyboxSection = false

  // Remove skybox component to use global time
  SkyboxTime.deleteFrom(engine.RootEntity)

  console.log("Switched to Global Time")
}

// Function to handle SkyboxComponent button click
function handleUseSkyboxComponent() {
  console.log("Switching to SkyboxComponent")

  useGlobalTime = false
  showSkyboxSection = true

  // Add skybox component with current time value
  updateSkyboxTime(currentTimeValue)
}

// Function to handle Apply button click
function handleApplyTime() {
  const timeValue = parseInt(inputTimeValue)
  if (!isNaN(timeValue)) {
    updateSkyboxTime(timeValue)
  } else {
    console.log("Invalid time value entered")
  }
}

// Function to handle preset time buttons
function handlePresetTime(timeValue: number) {
  inputTimeValue = timeValue.toString()
  updateSkyboxTime(timeValue)
}

// Function to handle transition buttons
function handleBackwardTransition() {
  useForwardTransition = false
  console.log("Switched to Backward transition")
}

function handleForwardTransition() {
  useForwardTransition = true
  console.log("Switched to Forward transition")
}

// Convert time format (HH:MM) to seconds for common presets (ordered from lowest to highest)
const timePresets = [
  { label: "00:00", value: 0 },      // Midnight (0 seconds)
  { label: "06:00", value: 21600 },  // 6 AM (6 * 60 * 60 = 21,600 seconds)
  { label: "12:00", value: 43200 },  // Noon (12 * 60 * 60 = 43,200 seconds)
  { label: "18:00", value: 64800 }   // 6 PM (18 * 60 * 60 = 64,800 seconds)
]

// UI Component
const TimeControlPanel = () => (
  <UiEntity
    uiTransform={{
      width: 300,
      height: showSkyboxSection ? '80%' : 'auto',
      positionType: 'absolute',
      position: { top: '10%', right: 20 }
    }}
    uiBackground={{
      color: Color4.fromHexString('#1A1A1AE6'),
      textureMode: 'stretch'
    }}
  >
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        padding: 20,
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        overflow: 'scroll'
      }}
    >
      {/* Title */}
      <Label
        value="Time Control"
        fontSize={18}
        color={Color4.White()}
        uiTransform={{
          width: '100%',
          height: 30,
          margin: { bottom: 15 }
        }}
      />

      {/* Use Global Time Button */}
      <Button
        value="Use Global Time"
        variant={useGlobalTime ? 'primary' : 'secondary'}
        fontSize={14}
        uiTransform={{
          width: '100%',
          height: 40,
          margin: { bottom: 10 }
        }}
        onMouseDown={handleUseGlobalTime}
      />

      {/* Use SkyboxComponent Button */}
      <Button
        value="Use SkyboxComponent"
        variant={!useGlobalTime ? 'primary' : 'secondary'}
        fontSize={14}
        uiTransform={{
          width: '100%',
          height: 40,
          //margin: { bottom: showSkyboxSection ? 15 : 0 }
          margin: { bottom: 10 }
        }}
        onMouseDown={handleUseSkyboxComponent}
      />

      {/* Conditional Skybox Section */}
      {showSkyboxSection && (
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 'auto',
            padding: 15,
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start'
          }}
          uiBackground={{
            color: Color4.fromHexString('#2A2A2A80'),
            textureMode: 'stretch'
          }}
        >
          {/* Custom Time Input Section */}
          <Label
            value="Custom Time (seconds):"
            fontSize={12}
            color={Color4.fromHexString('#AAAAAA')}
            uiTransform={{
              width: '100%',
              height: 'auto',
              margin: { bottom: 5 }
            }}
          />

          {/* Input and Apply Button Row */}
          <UiEntity
            uiTransform={{
              width: '100%',
              height: 35,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: { bottom: 10 }
            }}
          >
            <Input
              placeholder={"Enter time value"}
              placeholderColor={Color4.fromHexString('#888888')}
              color={Color4.White()}
              fontSize={12}
              value={inputTimeValue}
              onChange={(value) => { inputTimeValue = value }}
              uiTransform={{
                width: '75%',
                height: '100%'
              }}
              uiBackground={{
                color: Color4.fromHexString('#333333')
              }}
            />

            <Button
              value="Apply"
              variant="primary"
              fontSize={12}
              uiTransform={{
                width: '22%',
                height: '100%'
              }}
              onMouseDown={handleApplyTime}
            />
          </UiEntity>

          {/* Transition Buttons */}
          <UiEntity
            uiTransform={{
              width: '100%',
              height: 35,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: { bottom: 15 }
            }}
          >
            <Button
              value="Backward"
              variant={!useForwardTransition ? 'primary' : 'secondary'}
              fontSize={11}
              uiTransform={{
                width: '48%',
                height: '100%'
              }}
              onMouseDown={handleBackwardTransition}
            />

            <Button
              value="Forward"
              variant={useForwardTransition ? 'primary' : 'secondary'}
              fontSize={11}
              uiTransform={{
                width: '48%',
                height: '100%'
              }}
              onMouseDown={handleForwardTransition}
            />
          </UiEntity>

          {/* Preset Time Buttons */}
          <Label
            value="Quick Presets (Immediately applied with selected transition):"
            fontSize={9}
            color={Color4.fromHexString('#AAAAAA')}
            textWrap="nowrap"
            uiTransform={{
              width: '100%',
              height: 'auto',
              margin: { bottom: 5 }
            }}
          />

          <UiEntity
            uiTransform={{
              width: '100%',
              height: 30,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: { bottom: 20 }
            }}
          >
            {timePresets.map((preset, index) => (
              <Button
                key={index}
                value={preset.label}
                variant="secondary"
                fontSize={10}
                uiTransform={{
                  width: '22%',
                  height: '100%'
                }}
                onMouseDown={() => handlePresetTime(preset.value)}
              />
            ))}
          </UiEntity>

          <Label
            value="Skybox Settings"
            fontSize={16}
            color={Color4.White()}
            uiTransform={{
              width: '100%',
              height: 25,
              margin: { bottom: 10 }
            }}
          />

          <Label
            value={`Fixed Time: ${currentTimeValue}`}
            fontSize={14}
            color={Color4.fromHexString('#CCCCCC')}
            uiTransform={{
              width: '100%',
              height: 20,
              margin: { bottom: 5 }
            }}
          />

          <Label
            value={`Time: ${formatSecondsToTime(currentTimeValue)}`}
            fontSize={14}
            color={Color4.fromHexString('#CCCCCC')}
            uiTransform={{
              width: '100%',
              height: 20
            }}
          />
        </UiEntity>
      )}
    </UiEntity>
  </UiEntity>
)

// Initialize UI
export function initializeUI() {
  // Start with Global Time mode (no skybox component initially)
  handleUseGlobalTime()

  // Render the UI
  ReactEcsRenderer.setUiRenderer(TimeControlPanel)
}

export function formatSecondsToTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  // Add leading zeros for formatting
  const hoursStr = hours.toString().padStart(2, '0')
  const minutesStr = minutes.toString().padStart(2, '0')
  const secondsStr = seconds.toString().padStart(2, '0')

  return `${hoursStr}:${minutesStr}:${secondsStr}`
} 