import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

const validZIndexValues = [-2, -1, 0, 1, 2]
const validOpacityValues = [0.2, 0.4, 0.6, 0.8, 1.0]

// Z-index state
let currentZIndexIndex = 2 // Start with index 2 (value 0)
let greenZIndex = validZIndexValues[currentZIndexIndex]

let blueZIndexIndex = 0 // Start with -2
let blueZIndex = validZIndexValues[blueZIndexIndex]

let redZIndexIndex = 2 // Start with 0
let redZIndex = validZIndexValues[redZIndexIndex]

// Opacity state
let blueOpacityIndex = 4 // Start with 1.0
let blueOpacity = validOpacityValues[blueOpacityIndex]

let greenOpacityIndex = 4 // Start with 1.0
let greenOpacity = validOpacityValues[greenOpacityIndex]

let redOpacityIndex = 4 // Start with 1.0
let redOpacity = validOpacityValues[redOpacityIndex]

let rootOpacityIndex = 4 // Start with 1.0
let rootOpacity = validOpacityValues[rootOpacityIndex]

// Z-index functions
export const changeGreenZIndex = () => {
  currentZIndexIndex = (currentZIndexIndex + 1) % validZIndexValues.length
  greenZIndex = validZIndexValues[currentZIndexIndex]
}

export const changeBlueZIndex = () => {
  blueZIndexIndex = (blueZIndexIndex + 1) % validZIndexValues.length
  blueZIndex = validZIndexValues[blueZIndexIndex]
}

export const changeRedZIndex = () => {
  redZIndexIndex = (redZIndexIndex + 1) % validZIndexValues.length
  redZIndex = validZIndexValues[redZIndexIndex]
}

// Opacity functions
export const changeBlueOpacity = () => {
  blueOpacityIndex = (blueOpacityIndex + 1) % validOpacityValues.length
  blueOpacity = validOpacityValues[blueOpacityIndex]
}

export const changeGreenOpacity = () => {
  greenOpacityIndex = (greenOpacityIndex + 1) % validOpacityValues.length
  greenOpacity = validOpacityValues[greenOpacityIndex]
}

export const changeRedOpacity = () => {
  redOpacityIndex = (redOpacityIndex + 1) % validOpacityValues.length
  redOpacity = validOpacityValues[redOpacityIndex]
}

export const changeRootOpacity = () => {
  rootOpacityIndex = (rootOpacityIndex + 1) % validOpacityValues.length
  rootOpacity = validOpacityValues[rootOpacityIndex]
}

// Getter functions
export const getGreenZIndex = () => greenZIndex
export const getBlueZIndex = () => blueZIndex
export const getRedZIndex = () => redZIndex
export const getBlueOpacity = () => blueOpacity
export const getGreenOpacity = () => greenOpacity
export const getRedOpacity = () => redOpacity
export const getRootOpacity = () => rootOpacity

export const uiMenu = () => {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        opacity: rootOpacity,
      }}
    >
      
      <UiEntity
        uiTransform={{
          width: 600,
          height: 200,
          positionType: 'absolute',
          position: { top: '50%', left: '52.5%' },
          margin: { top: -60, left: -300 },
          opacity: blueOpacity,
          zIndex: blueZIndex,
        }}
        uiBackground={{ color: Color4.Blue() }}
      />
      
      <UiEntity
        uiTransform={{
          width: 300,
          height: 200,
          positionType: 'absolute',
          position: { top: '50%', left: '55%' },
          margin: { top: -100, left: -100 },
          opacity: greenOpacity,
          zIndex: greenZIndex,
        }}
        uiBackground={{ color: Color4.Green() }}
      />
      
      <UiEntity
        uiTransform={{
          width: 500,
          height: 200,
          positionType: 'absolute',
          position: { top: '50%', left: '45%' },
          margin: { top: -140, left: -250 },
          zIndex: redZIndex,
          opacity: redOpacity,
        }}
        uiBackground={{ color: Color4.Red() }}
      />

      {/* Button controls section */}
      <UiEntity
        uiTransform={{
          width: 580,
          height: 196,
          positionType: 'absolute',
          position: { bottom: '50px', left: '50%' },
          margin: { left: -290 },
        }}
      >
        {/* Instructions text */}
        <UiEntity
          uiTransform={{
            width: 560,
            height: 46,
            positionType: 'absolute',
            position: { top: '0px', left: '50%' },
            margin: { left: -280 },
            padding: { left: 12, right: 12, top: 8, bottom: 8 },
          }}
          uiBackground={{ color: Color4.White() }}
          uiText={{ 
            value: "Press the buttons to cycle through different values for each rectangle", 
            fontSize: 19, 
            color: Color4.Black(), 
            textAlign: 'middle-center' 
          }}
        />

        {/* Z-index buttons row */}
        <UiEntity
          uiTransform={{
            width: 144,
            height: 36,
            positionType: 'absolute',
            position: { top: '56px', left: '48px' },
          }}
          uiBackground={{ color: Color4.Blue() }}
          uiText={{ 
            value: `zindex: ${blueZIndex}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeBlueZIndex()}
        />

        <UiEntity
          uiTransform={{
            width: 144,
            height: 36,
            positionType: 'absolute',
            position: { top: '56px', left: '218px' },
          }}
          uiBackground={{ color: Color4.Green() }}
          uiText={{ 
            value: `zindex: ${greenZIndex}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeGreenZIndex()}
        />

        <UiEntity
          uiTransform={{
            width: 144,
            height: 36,
            positionType: 'absolute',
            position: { top: '56px', left: '388px' },
          }}
          uiBackground={{ color: Color4.Red() }}
          uiText={{ 
            value: `zindex: ${redZIndex}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeRedZIndex()}
        />

        {/* Opacity buttons row */}
        <UiEntity
          uiTransform={{
            width: 144,
            height: 36,
            positionType: 'absolute',
            position: { top: '104px', left: '48px' },
          }}
          uiBackground={{ color: Color4.Blue() }}
          uiText={{ 
            value: `opacity: ${blueOpacity}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeBlueOpacity()}
        />

        <UiEntity
          uiTransform={{
            width: 144,
            height: 36,
            positionType: 'absolute',
            position: { top: '104px', left: '218px' },
          }}
          uiBackground={{ color: Color4.Green() }}
          uiText={{ 
            value: `opacity: ${greenOpacity}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeGreenOpacity()}
        />

        <UiEntity
          uiTransform={{
            width: 144,
            height: 36,
            positionType: 'absolute',
            position: { top: '104px', left: '388px' },
          }}
          uiBackground={{ color: Color4.Red() }}
          uiText={{ 
            value: `opacity: ${redOpacity}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeRedOpacity()}
        />

        {/* Root opacity button */}
        <UiEntity
          uiTransform={{
            width: 200,
            height: 36,
            positionType: 'absolute',
            position: { top: '152px', left: '50%' },
            margin: { left: -100 },
          }}
          uiBackground={{ color: Color4.create(0.5, 0.5, 0.5, 1) }}
          uiText={{ 
            value: `root opacity: ${rootOpacity}`, 
            fontSize: 17, 
            color: Color4.White(), 
            textAlign: 'middle-center' 
          }}
          onMouseDown={() => changeRootOpacity()}
        />
      </UiEntity>
    </UiEntity>
  )
}