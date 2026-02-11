import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Dropdown, Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'

// Panel configuration
const PANEL_WIDTH = 400

// State management for each panel
let selectedOption1 = 0
let inputText1 = ''       // captures typed text via onChange (not bound to value)
let clearInput1 = false

let selectedOption2 = 2
let inputText2 = ''       // captures typed text via onChange (not bound to value)
let clearInput2 = false

let selectedOption3 = 4
let inputText3 = ''       // captures typed text via onChange (not bound to value)
let clearInput3 = false

// Disabled states for all interactive components
// Panel 1
let dropdown1Disabled = false
let input1Disabled = false
let button1Disabled = false

// Panel 2
let dropdown2Disabled = false
let input2Disabled = false
let button2Disabled = false

// Panel 3
let dropdown3Disabled = false
let input3Disabled = false
let button3Disabled = false

const dropdownOptions = ['Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6']

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(Panel, { virtualWidth: 1920, virtualHeight: 1080 })
}

// Single Panel component containing all three panels
function Panel() {
  // Handle clearing for inputs: value is ' ' while clearing, '' otherwise (uncontrolled)
    // const input1Value = clearInput1Frames ? '' : undefined
  const input1Value = clearInput1 ? ' ' : ''
  if (clearInput1) clearInput1 = !clearInput1

  const input2Value = clearInput2 ? ' ' : ''
  if (clearInput2) clearInput2 = !clearInput2

  const input3Value = clearInput3 ? ' ' : ''
  if (clearInput3) clearInput3 = !clearInput3

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
            height: 40,
            margin: { bottom: 20 },
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 310,
              height: 40,
              flexDirection: 'column'
            }}
          >
            <Dropdown
              options={dropdownOptions}
              selectedIndex={selectedOption1}
              onChange={(index) => { selectedOption1 = index }}
              uiTransform={{
                width: '100%',
                  // borderRadius: 10,
                height: 40
              }}
              fontSize={16}
              font="sans-serif"
              textAlign="top-left"
              disabled={dropdown1Disabled}
            />
          </UiEntity>
          <Button
            value="X"
            variant="secondary"
            fontSize={14}
            uiTransform={{
              width: 40,
              height: 40,
                // borderRadius: 10,
              margin: { left: 10 }
            }}
            onMouseDown={() => { dropdown1Disabled = !dropdown1Disabled }}
          />
        </UiEntity>

        {/* Input Field */}
        <UiEntity
          uiTransform={{
            width: '90%',
            height: 40,
            margin: { bottom: 20 },
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 310,
              height: 40,
              flexDirection: 'column'
            }}
          >
            <Input
              value={input1Value}
              onChange={(value) => { inputText1 = value }}
              placeholder="Type something..."
              placeholderColor={Color4.Gray()}
              fontSize={16}
              font="sans-serif"
              textAlign="top-left"
              disabled={input1Disabled}
              uiTransform={{
                width: '100%',
                  // borderRadius: 10,
                height: 40
              }}
            />
          </UiEntity>
          <Button
            value="X"
            variant="secondary"
            fontSize={14}
            uiTransform={{
              width: 40,
              height: 40,
                // borderRadius: 10,
              margin: { left: 10 }
            }}
            onMouseDown={() => { input1Disabled = !input1Disabled }}
          />
        </UiEntity>

        <UiEntity
          uiTransform={{
            width: '90%',
            height: 50,
            margin: { bottom: 20 },
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Button
            value="Submit"
            variant="primary"
            fontSize={18}
            font="sans-serif"
            disabled={button1Disabled}
            uiTransform={{ 
              width: 200,
                // borderRadius: 10,
              height: 50
            }}
            onMouseDown={() => {
              console.log('Panel 1 - Button clicked!')
              console.log('Selected option:', dropdownOptions[selectedOption1])
              console.log('Input value:', inputText1)
              inputText1 = ''
                clearInput1 = true
            }}
          />
          <Button
            value="X"
            variant="secondary"
            fontSize={14}
            uiTransform={{
              width: 40,
              height: 40,
                // borderRadius: 10,
              margin: { left: 10 }
            }}
            onMouseDown={() => { button1Disabled = !button1Disabled }}
          />
        </UiEntity>
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
                    height: 40,
                    margin: { bottom: 20 },
                    flexDirection: 'row',
                    alignItems: 'center'
                }}
            >
                <UiEntity
                    uiTransform={{
                        width: 310,
                        height: 40,
                        flexDirection: 'column'
                    }}
                >
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
                        disabled={dropdown2Disabled}
                    />
                </UiEntity>
                <Button
                    value="X"
                    variant="secondary"
                    fontSize={14}
                    uiTransform={{
                        width: 40,
                        height: 40,
                        margin: { left: 10 }
                    }}
                    onMouseDown={() => { dropdown2Disabled = !dropdown2Disabled }}
                />
            </UiEntity>

            {/* Input Field */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 40,
                    margin: { bottom: 20 },
                    flexDirection: 'row',
                    alignItems: 'center'
                }}
            >
                <UiEntity
                    uiTransform={{
                        width: 310,
                        height: 40,
                        flexDirection: 'column'
                    }}
                >
                    <Input
                        value={input2Value}
                        onChange={(value) => { inputText2 = value }}
                        placeholder="Type something..."
                        placeholderColor={Color4.Gray()}
                        fontSize={16}
                        font="serif"
                        textAlign="middle-center"
                        disabled={input2Disabled}
                        uiTransform={{
                            width: '100%',
                            height: 40
                        }}
                    />
                </UiEntity>
                <Button
                    value="X"
                    variant="secondary"
                    fontSize={14}
                    uiTransform={{
                        width: 40,
                        height: 40,
                        margin: { left: 10 }
                    }}
                    onMouseDown={() => { input2Disabled = !input2Disabled }}
                />
            </UiEntity>

            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 50,
                    margin: { bottom: 20 },
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Button
                    value="Submit"
                    variant="primary"
                    fontSize={18}
                    font="serif"
                    disabled={button2Disabled}
                    uiTransform={{
                        width: 200,
                        height: 50
                    }}
                    onMouseDown={() => {
                        console.log('Panel 2 - Button clicked!')
                        console.log('Selected option:', dropdownOptions[selectedOption2])
                        console.log('Input value:', inputText2)
                        inputText2 = ''
                        clearInput2 = true
                    }}
                />
                <Button
                    value="X"
                    variant="secondary"
                    fontSize={14}
                    uiTransform={{
                        width: 40,
                        height: 40,
                        margin: { left: 10 }
                    }}
                    onMouseDown={() => { button2Disabled = !button2Disabled }}
                />
            </UiEntity>
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
                    height: 40,
                    margin: { bottom: 20 },
                    flexDirection: 'row',
                    alignItems: 'center'
                }}
            >
                <UiEntity
                    uiTransform={{
                        width: 310,
                        height: 40,
                        flexDirection: 'column'
                    }}
                >
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
                        disabled={dropdown3Disabled}
                    />
                </UiEntity>
                <Button
                    value="X"
                    variant="secondary"
                    fontSize={14}
                    uiTransform={{
                        width: 40,
                        height: 40,
                        margin: { left: 10 }
                    }}
                    onMouseDown={() => { dropdown3Disabled = !dropdown3Disabled }}
                />
            </UiEntity>

            {/* Input Field */}
            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 40,
                    margin: { bottom: 20 },
                    flexDirection: 'row',
                    alignItems: 'center'
                }}
            >
                <UiEntity
                    uiTransform={{
                        width: 310,
                        height: 40,
                        flexDirection: 'column'
                    }}
                >
                    <Input
                        value={input3Value}
                        onChange={(value) => { inputText3 = value }}
                        placeholder="Type something..."
                        placeholderColor={Color4.Gray()}
                        fontSize={16}
                        font="monospace"
                        textAlign="bottom-right"
                        disabled={input3Disabled}
                        uiTransform={{
                            width: '100%',
                            height: 40
                        }}
                    />
                </UiEntity>
                <Button
                    value="X"
                    variant="secondary"
                    fontSize={14}
                    uiTransform={{
                        width: 40,
                        height: 40,
                        margin: { left: 10 }
                    }}
                    onMouseDown={() => { input3Disabled = !input3Disabled }}
                />
            </UiEntity>

            <UiEntity
                uiTransform={{
                    width: '90%',
                    height: 50,
                    margin: { bottom: 20 },
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Button
                    value="Submit"
                    variant="primary"
                    fontSize={18}
                    font="monospace"
                    disabled={button3Disabled}
                    uiTransform={{
                        width: 200,
                        height: 50
                    }}
                    onMouseDown={() => {
                        console.log('Panel 3 - Button clicked!')
                        console.log('Selected option:', dropdownOptions[selectedOption3])
                        console.log('Input value:', inputText3)
                        inputText3 = ''
                        clearInput3 = true
                    }}
                />
                <Button
                    value="X"
                    variant="secondary"
                    fontSize={14}
                    uiTransform={{
                        width: 40,
                        height: 40,
                        margin: { left: 10 }
                    }}
                    onMouseDown={() => { button3Disabled = !button3Disabled }}
                />
            </UiEntity>
        </UiEntity>
    </UiEntity>
  )
}
