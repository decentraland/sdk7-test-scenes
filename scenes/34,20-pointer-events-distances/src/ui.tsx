import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { engine, Transform, CameraMode as CameraModeComponent, CameraType } from '@dcl/sdk/ecs'
import { getCameraMode } from './cameras'
import { getLaneReadouts, LaneReadout } from './lanes'

const GREEN = Color4.create(0.35, 1, 0.35, 1)
const RED = Color4.create(1, 0.4, 0.4, 1)
const DIM = Color4.create(0.75, 0.75, 0.75, 1)

const COL_LANE = 34
const COL_Z = 42
const COL_CONFIG = 262
const COL_PLAYER = 62
const COL_CAM = 62
const COL_VERDICT = 58
const ROW_H = 19

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(() => hud())
}

function formatVector(v: { x: number; y: number; z: number } | null | undefined): string {
  if (!v) return 'n/a'
  return `x:${v.x.toFixed(1)} y:${v.y.toFixed(1)} z:${v.z.toFixed(1)}`
}

function personModeLabel(mode: CameraType | undefined): string {
  if (mode === CameraType.CT_FIRST_PERSON) return 'FIRST PERSON'
  if (mode === CameraType.CT_THIRD_PERSON) return 'THIRD PERSON'
  if (mode === CameraType.CT_CINEMATIC) return 'CINEMATIC'
  return 'UNKNOWN'
}

function headerRow() {
  return (
    <UiEntity uiTransform={{ width: '100%', height: ROW_H, flexDirection: 'row' }}>
      <Label value="LANE" fontSize={11} color={DIM} uiTransform={{ width: COL_LANE, height: ROW_H }} />
      <Label value="AT" fontSize={11} color={DIM} uiTransform={{ width: COL_Z, height: ROW_H }} />
      <Label value="CONFIG" fontSize={11} color={DIM} uiTransform={{ width: COL_CONFIG, height: ROW_H }} />
      <Label value="PLAYER" fontSize={11} color={DIM} uiTransform={{ width: COL_PLAYER, height: ROW_H }} />
      <Label value="CAM" fontSize={11} color={DIM} uiTransform={{ width: COL_CAM, height: ROW_H }} />
      <Label value="EXPECT" fontSize={11} color={DIM} uiTransform={{ width: COL_VERDICT, height: ROW_H }} />
    </UiEntity>
  )
}

function laneRow(r: LaneReadout) {
  const verdictColor = r.predicted ? GREEN : RED
  // Proximity lanes ignore camera distance entirely -- show it struck through as 'n/a'
  // rather than a number a reader might expect to matter.
  const camText = r.kind === 'cursor' ? `${r.camDist.toFixed(1)}m` : 'n/a'

  return (
    <UiEntity uiTransform={{ width: '100%', height: ROW_H, flexDirection: 'row' }}>
      <Label value={r.laneId} fontSize={12} color={verdictColor} uiTransform={{ width: COL_LANE, height: ROW_H }} />
      <Label value={`z=${r.z}`} fontSize={11} color={DIM} uiTransform={{ width: COL_Z, height: ROW_H }} />
      <Label value={r.configLabel} fontSize={11} uiTransform={{ width: COL_CONFIG, height: ROW_H }} />
      <Label value={`${r.playerDist.toFixed(1)}m`} fontSize={12} uiTransform={{ width: COL_PLAYER, height: ROW_H }} />
      <Label
        value={camText}
        fontSize={12}
        color={r.kind === 'cursor' ? Color4.White() : DIM}
        uiTransform={{ width: COL_CAM, height: ROW_H }}
      />
      <Label
        value={r.predicted ? 'LIVE' : 'DEAD'}
        fontSize={12}
        color={verdictColor}
        uiTransform={{ width: COL_VERDICT, height: ROW_H }}
      />
    </UiEntity>
  )
}

function hud() {
  const playerPos = Transform.getOrNull(engine.PlayerEntity)?.position
  const camPos = Transform.getOrNull(engine.CameraEntity)?.position
  const camModeComp = CameraModeComponent.getOrNull(engine.CameraEntity)

  return (
    <UiEntity
      uiTransform={{
        width: 580,
        height: 'auto',
        positionType: 'absolute',
        position: { right: '2%', top: '3%' },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
    >
      <Label value="Pointer Events - Distance Rules" fontSize={18} uiTransform={{ width: '100%', height: 24 }} />

      <Label
        value={`Scene camera mode: ${getCameraMode()}`}
        fontSize={14}
        color={getCameraMode() === 'DEFAULT' ? Color4.White() : Color4.Yellow()}
        uiTransform={{ width: '100%', height: 20, margin: { top: 6 } }}
      />

      <Label
        value={`Explorer camera view: ${personModeLabel(camModeComp?.mode)}`}
        fontSize={13}
        uiTransform={{ width: '100%', height: 18 }}
      />

      <Label value={`Player pos: ${formatVector(playerPos)}`} fontSize={13} uiTransform={{ width: '100%', height: 18 }} />

      <Label value={`Camera pos: ${formatVector(camPos)}`} fontSize={13} uiTransform={{ width: '100%', height: 18 }} />

      <Label
        value="Lane table - compare EXPECT against the actual hover highlight"
        fontSize={12}
        color={DIM}
        uiTransform={{ width: '100%', height: 18, margin: { top: 10 } }}
      />
      <UiEntity
        uiTransform={{
          width: '100%',
          height: ROW_H * 9,
          flexDirection: 'column',
          flexShrink: 0
        }}
      >
        {headerRow()}
        {getLaneReadouts().map((r) => laneRow(r))}
      </UiEntity>

      <Label
        value={
          '1 = cycle scene camera (DEFAULT / NEAR / FAR)\n' +
          'Left click = cursor lanes (z 1,3,5,7,9,11)\n' +
          'E = proximity lanes (z 13,15)\n' +
          'Proximity requires facing the cube, unobstructed,\n' +
          'and is measured from ~1m above the feet (capsule center).'
        }
        fontSize={12}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 110, margin: { top: 10 } }}
      />
    </UiEntity>
  )
}
