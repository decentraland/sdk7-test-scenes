import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Dropdown, Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

// Panel configuration
const PANEL_WIDTH = 400

// State management for each panel
let selectedOption1 = 0
let selectedOption1b = 0
let inputValue1 = ''
let inputValue1b = ''

let selectedOption2 = 0
let selectedOption2b = 0
let inputValue2 = ''
let inputValue2b = ''

let selectedOption3 = 0
let selectedOption3b = 0
let inputValue3 = ''
let inputValue3b = ''

const dropdownOptions = ['Option 1', 'Option 2', 'Option 3', 'Option 4']

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(Panel, { virtualWidth: 1920, virtualHeight: 1080 })
}

// Single Panel component containing all three panels
function Panel() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row', 
        justifyContent: 'center'
      }}
    >
      {/* Panel 1 - Left */}
      <UiEntity
        uiTransform={{
          width: PANEL_WIDTH,
          height: '80%',
          margin: { top: '10%', left: 50 },
          padding: 20,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start'
        }}
        uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 0.9) }}
      >
        {/* Title */}
        <Label
          value="Control Panel 1"
          fontSize={24}
          font="sans-serif"
          uiTransform={{ 
            width: '100%', 
            height: 40,
            margin: { bottom: 30 }
          }}
        />

        {/* Dropdown */}
        <UiEntity
          uiTransform={{
            width: '90%',
            height: 50,
            margin: { bottom: 20 }
          }}
        >
          <Label
            value="Select Option:"
            fontSize={16}
            font="sans-serif"
            uiTransform={{ 
              width: '100%', 
              height: 25,
              margin: { bottom: 5 }
            }}
          />
          <Dropdown
            options={dropdownOptions}
            selectedIndex={selectedOption1}
            onChange={(index) => { selectedOption1 = index }}
            uiTransform={{
              width: '100%',
              height: 40
            }}
            fontSize={16}
            font="sans-serif"
            textAlign="top-left"
          />
        </UiEntity>

        {/* Input Field */}
        <UiEntity
          uiTransform={{
            width: '90%',
            height: 80,
            margin: { bottom: 20 }
          }}
        >
          <Label
            value="Enter Text:"
            fontSize={16}
            font="sans-serif"
            uiTransform={{ 
              width: '100%', 
              height: 25,
              margin: { bottom: 5 }
            }}
          />
          <Input
            value={inputValue1}
            onChange={(value) => { inputValue1 = value }}
            placeholder="Type something..."
            placeholderColor={Color4.Gray()}
            fontSize={16}
            font="sans-serif"
            textAlign="top-left"
            uiTransform={{
              width: '100%',
              height: 40
            }}
          />
        </UiEntity>

        <Button
          value="Submit"
          variant="primary"
          fontSize={18}
          font="sans-serif"
          uiTransform={{ 
            width: 200, 
            height: 50,
            margin: { bottom: 20 }
          }}
          onMouseDown={() => {
            console.log('Panel 1 - Button clicked!')
            console.log('Selected option:', dropdownOptions[selectedOption1])
            console.log('Input value:', inputValue1)
            inputValue1 = ''
          }}
        />

        {/* Dropdown 2 */}
        <UiEntity
          uiTransform={{
            width: '90%',
            height: 50,
            margin: { bottom: 20 }
          }}
        >
          <Label
            value="Select Option 2:"
            fontSize={16}
            font="sans-serif"
            uiTransform={{ 
              width: '100%', 
              height: 25,
              margin: { bottom: 5 }
            }}
          />
          <Dropdown
            options={dropdownOptions}
            selectedIndex={selectedOption1b}
            onChange={(index) => { selectedOption1b = index }}
            uiTransform={{
              width: '100%',
              height: 40
            }}
            fontSize={16}
            font="sans-serif"
            textAlign="top-left"
          />
        </UiEntity>

        {/* Input Field 2 */}
        <UiEntity
          uiTransform={{
            width: '90%',
            height: 80,
            margin: { bottom: 20 }
          }}
        >
          <Label
            value="Enter Text 2:"
            fontSize={16}
            font="sans-serif"
            uiTransform={{ 
              width: '100%', 
              height: 25,
              margin: { bottom: 5 }
            }}
          />
          <Input
            value={inputValue1b}
            onChange={(value) => { inputValue1b = value }}
            placeholder="Type something..."
            placeholderColor={Color4.Gray()}
            fontSize={16}
            font="sans-serif"
            textAlign="top-left"
            uiTransform={{
              width: '100%',
              height: 40
            }}
          />
        </UiEntity>

        <Button
          value="Submit 2"
          variant="primary"
          fontSize={18}
          font="sans-serif"
          uiTransform={{ 
            width: 200, 
            height: 50,
            margin: { bottom: 20 }
          }}
          onMouseDown={() => {
            console.log('Panel 1 - Button 2 clicked!')
            console.log('Selected option 2:', dropdownOptions[selectedOption1b])
            console.log('Input value 2:', inputValue1b)
            inputValue1b = ''
          }}
        />
      </UiEntity>

      {/* Panel 2 - Center */}
        <UiEntity
            uiTransform={{
                width: PANEL_WIDTH,
                height: '80%',
                margin: { top: '10%', left: 50 },
                padding: 20,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start'
            }}
            uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 0.9) }}
        >
            {/* Title */}
            <Label
                value="Control Panel 2"
                fontSize={24}
                font="serif"
                uiTransform={{
                    width: '100%',
                    height: 40,
                    margin: { bottom: 30 }
                }}
            />

            {/* Dropdown */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 50,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Select Option:"
                    fontSize={16}
                    font="serif"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Dropdown
                    options={dropdownOptions}
                    selectedIndex={selectedOption2}
                    onChange={(index) => { selectedOption2 = index }}
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                    fontSize={16}
                    font="serif"
                    textAlign="middle-center"
                />
            </UiEntity>

            {/* Input Field */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 80,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Enter Text:"
                    fontSize={16}
                    font="serif"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Input
                    value={inputValue2}
                    onChange={(value) => { inputValue2 = value }}
                    placeholder="Type something..."
                    placeholderColor={Color4.Gray()}
                    fontSize={16}
                    font="serif"
                    textAlign="middle-center"
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                />
            </UiEntity>

            <Button
                value="Submit"
                variant="primary"
                fontSize={18}
                font="serif"
                uiTransform={{
                    width: 200,
                    height: 50,
                    margin: { bottom: 20 }
                }}
                onMouseDown={() => {
                    console.log('Panel 2 - Button clicked!')
                    console.log('Selected option:', dropdownOptions[selectedOption2])
                    console.log('Input value:', inputValue2)
                    inputValue2 = ''
                }}
            />

            {/* Dropdown 2 */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 50,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Select Option 2:"
                    fontSize={16}
                    font="serif"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Dropdown
                    options={dropdownOptions}
                    selectedIndex={selectedOption2b}
                    onChange={(index) => { selectedOption2b = index }}
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                    fontSize={16}
                    font="serif"
                    textAlign="middle-center"
                />
            </UiEntity>

            {/* Input Field 2 */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 80,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Enter Text 2:"
                    fontSize={16}
                    font="serif"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Input
                    value={inputValue2b}
                    onChange={(value) => { inputValue2b = value }}
                    placeholder="Type something..."
                    placeholderColor={Color4.Gray()}
                    fontSize={16}
                    font="serif"
                    textAlign="middle-center"
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                />
            </UiEntity>

            <Button
                value="Submit 2"
                variant="primary"
                fontSize={18}
                font="serif"
                uiTransform={{
                    width: 200,
                    height: 50,
                    margin: { bottom: 20 }
                }}
                onMouseDown={() => {
                    console.log('Panel 2 - Button 2 clicked!')
                    console.log('Selected option 2:', dropdownOptions[selectedOption2b])
                    console.log('Input value 2:', inputValue2b)
                    inputValue2b = ''
                }}
            />
        </UiEntity>

      {/* Panel 3 - Right */}
        <UiEntity
            uiTransform={{
                width: PANEL_WIDTH,
                height: '80%',
                margin: { top: '10%', left: 50 },
                padding: 20,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start'
            }}
            uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 0.9) }}
        >
            {/* Title */}
            <Label
                value="Control Panel 3"
                fontSize={24}
                font="monospace"
                uiTransform={{
                    width: '100%',
                    height: 40,
                    margin: { bottom: 30 }
                }}
            />

            {/* Dropdown */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 50,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Select Option:"
                    fontSize={16}
                    font="monospace"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Dropdown
                    options={dropdownOptions}
                    selectedIndex={selectedOption3}
                    onChange={(index) => { selectedOption3 = index }}
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                    fontSize={16}
                    font="monospace"
                    textAlign="bottom-right"
                />
            </UiEntity>

            {/* Input Field */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 80,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Enter Text:"
                    fontSize={16}
                    font="monospace"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Input
                    value={inputValue3}
                    onChange={(value) => { inputValue3 = value }}
                    placeholder="Type something..."
                    placeholderColor={Color4.Gray()}
                    fontSize={16}
                    font="monospace"
                    textAlign="bottom-right"
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                />
            </UiEntity>

            <Button
                value="Submit"
                variant="primary"
                fontSize={18}
                font="monospace"
                uiTransform={{
                    width: 200,
                    height: 50,
                    margin: { bottom: 20 }
                }}
                onMouseDown={() => {
                    console.log('Panel 3 - Button clicked!')
                    console.log('Selected option:', dropdownOptions[selectedOption3])
                    console.log('Input value:', inputValue3)
                    inputValue3 = ''
                }}
            />

            {/* Dropdown 2 */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 50,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Select Option 2:"
                    fontSize={16}
                    font="monospace"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Dropdown
                    options={dropdownOptions}
                    selectedIndex={selectedOption3b}
                    onChange={(index) => { selectedOption3b = index }}
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                    fontSize={16}
                    font="monospace"
                    textAlign="bottom-right"
                />
            </UiEntity>

            {/* Input Field 2 */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 80,
                    margin: { bottom: 20 }
                }}
            >
                <Label
                    value="Enter Text 2:"
                    fontSize={16}
                    font="monospace"
                    uiTransform={{
                        width: '100%',
                        height: 25,
                        margin: { bottom: 5 }
                    }}
                />
                <Input
                    value={inputValue3b}
                    onChange={(value) => { inputValue3b = value }}
                    placeholder="Type something..."
                    placeholderColor={Color4.Gray()}
                    fontSize={16}
                    font="monospace"
                    textAlign="bottom-right"
                    uiTransform={{
                        width: '100%',
                        height: 40
                    }}
                />
            </UiEntity>

            <Button
                value="Submit 2"
                variant="primary"
                fontSize={18}
                font="monospace"
                uiTransform={{
                    width: 200,
                    height: 50,
                    margin: { bottom: 20 }
                }}
                onMouseDown={() => {
                    console.log('Panel 3 - Button 2 clicked!')
                    console.log('Selected option 2:', dropdownOptions[selectedOption3b])
                    console.log('Input value 2:', inputValue3b)
                    inputValue3b = ''
                }}
            />
        </UiEntity>
    </UiEntity>
  )
}
