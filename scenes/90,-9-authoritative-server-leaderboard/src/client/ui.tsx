import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { room } from '../shared/messages'
import { Leaderboard } from '../shared/schemas'
import { getMyScore, getToast, isLocalAdmin, isServerAlive, showToast } from './state'
import { getPlatform } from '@dcl/sdk/platform'

const platform = getPlatform()
const isMobile = platform === 'mobile';

export function setupUi(): void {
    ReactEcsRenderer.setUiRenderer(uiComponent, { virtualWidth: isMobile ? 1600 : 1920, virtualHeight: isMobile ? 720 : 1080 })
}

// Read the synced, server-authoritative leaderboard (there is exactly one entity
// carrying this component — the one the server created and synced).
function readBoard(): { names: string[]; scores: number[] } {
  for (const [, board] of engine.getEntitiesWith(Leaderboard)) {
    return { names: [...board.names], scores: [...board.scores] }
  }
  return { names: [], scores: [] }
}

const PANEL_BG = Color4.create(0.05, 0.08, 0.16, 0.85)
const ROW_BG = Color4.create(1, 1, 1, 0.06)
const ACCENT = Color4.fromHexString('#ffd34eff')

function row(rank: number, name: string, score: number) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`
  return (
    <UiEntity
      key={rank}
      uiTransform={{
        width: '100%',
        height: 45,
        margin: { bottom: 6 },
        padding: { left: 15, right: 15 },
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: ROW_BG }}
    >
      <Label value={`${medal}  ${name}`} fontSize={21} color={Color4.White()} />
      <Label value={`${score}`} fontSize={24} color={ACCENT} />
    </UiEntity>
  )
}

// Admin-only: ask the server to wipe the board. The server re-verifies the sender
// against ADMINS, so a non-admin firing this (somehow) is a no-op server-side.
function resetLeaderboard(): void {
  room.send('resetLeaderboard', {})
  showToast('Leaderboard reset requested…')
}

const uiComponent = () => {
  const { names, scores } = readBoard()
  const alive = isServerAlive()
  const toast = getToast()
  const admin = isLocalAdmin()

  return (
    // Full-screen container: right-anchored (justifyContent flex-end on the row
    // main axis) and vertically centred (alignItems center on the cross axis).
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, right: 0 },
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          width: 450,
          height: 'auto',
          margin: { right: 24 },
          flexDirection: 'column',
          padding: 21
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        {/* Header */}
        <Label value="🏆 LEADERBOARD" fontSize={30} color={ACCENT} uiTransform={{ height: 42 }} />

        {/* Server status */}
        <Label
          value={alive ? '● server online' : '○ server waking up…'}
          fontSize={18}
          color={alive ? Color4.Green() : Color4.fromHexString('#ff9d3aff')}
          uiTransform={{ height: 30, margin: { bottom: 12 } }}
        />

        {/* Ranked rows */}
        {names.length === 0 ? (
          <Label
            value="No scores yet.\nClick the orb to be first!"
            fontSize={20}
            color={Color4.create(1, 1, 1, 0.7)}
            uiTransform={{ height: 75 }}
          />
        ) : (
          names.map((name, i) => row(i + 1, name, scores[i] ?? 0))
        )}

        {/* Your score */}
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 48,
            margin: { top: 12 },
            padding: { left: 15, right: 15 },
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(1, 0.83, 0.3, 0.18) }}
        >
          <Label value="YOUR SCORE" fontSize={20} color={Color4.White()} />
          <Label value={`${getMyScore()}`} fontSize={27} color={ACCENT} />
        </UiEntity>

        {/* Admin-only reset button (shown only to wallets in ADMINS) */}
        {admin && (
          <UiEntity
            uiTransform={{
              width: '100%',
              height: 40,
              margin: { top: 12 },
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: Color4.create(0.8, 0.2, 0.2, 0.85) }}
            onMouseDown={resetLeaderboard}
          >
            <Label value="🗑  RESET LEADERBOARD" fontSize={18} color={Color4.White()} />
          </UiEntity>
        )}

        {/* Transient toast */}
        {toast !== '' && (
          <Label
            value={toast}
            fontSize={20}
            color={Color4.fromHexString('#ff9d3aff')}
            uiTransform={{ height: 36, margin: { top: 12 } }}
          />
        )}
      </UiEntity>
    </UiEntity>
  )
}
