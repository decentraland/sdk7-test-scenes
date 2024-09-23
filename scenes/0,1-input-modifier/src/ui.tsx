import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { toggleModeValues } from '.'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

let disableAll = false
let disableWalk = false
let disableJog = false
let disableRun = false
let disableJump = false
let disableEmote = false

let buttonsWidth = 150
let buttonsHeight = 75
let buttonFontSize = 18

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: 250,
      height: 600,
      
      flexDirection: 'column',
        alignItems: 'center',
        positionType: 'absolute',
        position: { right: '1%', top: '3%' }
    }}>
    <Button
      value="Disable All"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Disable All')
        disableAll = !disableAll;
        toggleModeValues({ disableAllVal: disableAll })
      }}
      uiBackground={{
      color : disableAll ? Color4.Green() : Color4.Red()
      }}
    />
    <Button
      value="Disable Run"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Disable Run')
        disableRun = !disableRun
        toggleModeValues({ disableRunVal: disableRun })
      }}
      uiBackground={{
        color : disableRun ? Color4.Green() : Color4.Red()
        }}
    />
    <Button
      value="Disable Jog"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Disable Jog')
        disableJog = !disableJog
        toggleModeValues({ disableJogVal: disableJog })
      }}
      uiBackground={{
        color : disableJog ? Color4.Green() : Color4.Red()
        }}
    />
    <Button
      value="Disable Walk"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Disable Walk')
        disableWalk = !disableWalk
        toggleModeValues({ disableWalkVal: disableWalk })
      }}
      uiBackground={{
        color : disableWalk ? Color4.Green() : Color4.Red()
        }}
    />
     <Button
      value="Disable Jump"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Disable Jump')
        disableJump = !disableJump
        toggleModeValues({ disableJumpVal: disableJump })
      }}
      uiBackground={{
        color : disableJump ? Color4.Green() : Color4.Red()
        }}
    />
     <Button
      value="Disable Emote"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Disable Emote')
        disableEmote = !disableEmote
        toggleModeValues({ disableEmoteVal: disableEmote })
      }}
      uiBackground={{
        color : disableEmote ? Color4.Green() : Color4.Red()
        }}
    />
    <Button
      value="Reset"
      fontSize={buttonFontSize}
      variant="primary"
      uiTransform={{ width: buttonsWidth, height: buttonsHeight }}
      onMouseDown={() => {
        console.log('Clicked on Reset')

        disableAll = false
        disableWalk = false
        disableJog = false
        disableRun = false
        disableJump = false
        disableEmote = false

        toggleModeValues({
          disableAllVal: disableAll,
          disableWalkVal: disableWalk,
          disableJogVal: disableJog,
          disableRunVal: disableRun,
          disableJumpVal: disableJump,
          disableEmoteVal: disableEmote
        })
      }}
    />
  </UiEntity>
)
