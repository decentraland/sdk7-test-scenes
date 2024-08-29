import ReactEcs, { Button, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { toggleModeValues } from './index'
import { Color4 } from '@dcl/sdk/math'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}


let disableAll = false
let disableWalk = false
let disableJog = false
let disableRun = false
let disableJump = false
let disableEmote = false

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: 200,
      height: 350,
      
      flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        positionType: 'absolute',
        position: { right: '3%', top: '3%' }
    }}>
    <Button
      value="Disable All"
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
      variant="primary"
      uiTransform={{ width: 100, height: 100 }}
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
