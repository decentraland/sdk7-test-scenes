import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { getPlayer } from '@dcl/sdk/players'
import { HallOfFame, LastRound, RoundPhase, RoundScores, RoundState } from '../shared/schemas'
import { getLifetimeStats, getMyRoundTotal, getToast, isServerAlive } from './state'
import { getPlatform } from '@dcl/sdk/platform'

const platform = getPlatform()
const isMobile = platform === 'mobile';

export function setupUi(): void {
    ReactEcsRenderer.setUiRenderer(uiComponent, { virtualWidth: isMobile ? 1600 : 1920, virtualHeight: isMobile ? 720 : 1080 })
}

// Read the synced, server-authoritative state (there is exactly one entity
// carrying these components — the one the server created and synced).
function readRoundState() {
  for (const [, state] of engine.getEntitiesWith(RoundState)) {
    return { phase: state.phase, roundNumber: state.roundNumber, secondsLeft: state.secondsLeft, gemsRemaining: state.gemsRemaining }
  }
  return { phase: RoundPhase.Lobby, roundNumber: 0, secondsLeft: 0, gemsRemaining: 0 }
}

function readScores() {
  for (const [, board] of engine.getEntitiesWith(RoundScores)) {
    return { addresses: [...board.addresses], names: [...board.names], scores: [...board.scores] }
  }
  return { addresses: [], names: [], scores: [] }
}

function readLastRound() {
  for (const [, last] of engine.getEntitiesWith(LastRound)) {
    return { roundNumber: last.roundNumber, winnerName: last.winnerName, winnerScore: last.winnerScore }
  }
  return { roundNumber: 0, winnerName: '', winnerScore: 0 }
}

function readHallOfFame() {
  for (const [, hof] of engine.getEntitiesWith(HallOfFame)) {
    return {
      names: [...hof.names],
      totalGems: [...hof.totalGems],
      wins: [...hof.wins],
      totalRounds: hof.totalRounds
    }
  }
  return { names: [], totalGems: [], wins: [], totalRounds: 0 }
}

const PANEL_BG = Color4.create(0.04, 0.1, 0.07, 0.85)
const ROW_BG = Color4.create(1, 1, 1, 0.06)
const SELF_BG = Color4.create(0.22, 0.84, 0.94, 0.18)
const ACCENT = Color4.fromHexString('#37d5efff')
const GOLD = Color4.fromHexString('#ffd34eff')
const DIM = Color4.create(1, 1, 1, 0.7)
const ALERT = Color4.fromHexString('#ff4d4dff')
const ALERT_BG = Color4.create(0.5, 0.06, 0.06, 0.85)

function phaseBanner(state: ReturnType<typeof readRoundState>): { text: string; color: Color4 } {
  const mmss = `0:${String(Math.max(0, state.secondsLeft)).padStart(2, '0')}`
  switch (state.phase) {
    case RoundPhase.Active:
      return { text: `ROUND ${state.roundNumber} — ${mmss} · ${state.gemsRemaining} gems left`, color: ACCENT }
    case RoundPhase.Podium:
      return { text: 'ROUND OVER', color: GOLD }
    default:
      return { text: `LOBBY — next round in ${mmss}`, color: DIM }
  }
}

function scoreRow(rank: number, name: string, score: number, isSelf: boolean) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`
  return (
    <UiEntity
      key={rank}
      uiTransform={{
        width: '100%',
        height: 40,
        margin: { bottom: 5 },
        padding: { left: 12, right: 12 },
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: isSelf ? SELF_BG : ROW_BG }}
    >
      <Label value={`${medal}  ${name}`} fontSize={19} color={Color4.White()} />
      <Label value={`${score}`} fontSize={21} color={ACCENT} />
    </UiEntity>
  )
}

function fameRow(rank: number, name: string, totalGems: number, wins: number) {
  return (
    <UiEntity
      key={rank}
      uiTransform={{
        width: '100%',
        height: 32,
        margin: { bottom: 4 },
        padding: { left: 12, right: 12 },
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      uiBackground={{ color: ROW_BG }}
    >
      <Label value={`${rank}. ${name}`} fontSize={16} color={Color4.White()} />
      <Label value={`💎 ${totalGems}   🏆 ${wins}`} fontSize={16} color={GOLD} />
    </UiEntity>
  )
}

const uiComponent = () => {
  const state = readRoundState()
  const { addresses, names, scores } = readScores()
  const last = readLastRound()
  const fame = readHallOfFame()
  const alive = isServerAlive()
  const toast = getToast()
  const banner = phaseBanner(state)
  const stats = getLifetimeStats()
  const myAddress = getPlayer()?.userId?.toLowerCase()

  return (
    // Full-screen container: right-anchored and vertically centred.
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
          width: 430,
          height: 'auto',
          margin: { right: 24 },
          flexDirection: 'column',
          padding: 20
        }}
        uiBackground={{ color: PANEL_BG }}
      >
        {/* Header */}
        <Label value="💎 GEM RUSH" fontSize={28} color={ACCENT} uiTransform={{ height: 40 }} />

        {/* Server status */}
        <Label
          value={alive ? '● server online' : '○ server waking up…'}
          fontSize={17}
          color={alive ? Color4.Green() : Color4.fromHexString('#ff9d3aff')}
          uiTransform={{ height: 26, margin: { bottom: 8 } }}
        />

        {/* Phase banner + countdown (synced RoundState, updated 1 Hz by the server) */}
        <Label value={banner.text} fontSize={21} color={banner.color} uiTransform={{ height: 32, margin: { bottom: 8 } }} />

        {/* Podium banner (synced LastRound, written once per round) */}
        {state.phase === RoundPhase.Podium && last.winnerName !== '' && (
          <Label
            value={`🏆 Winner: ${last.winnerName} — ${last.winnerScore} gems`}
            fontSize={20}
            color={GOLD}
            uiTransform={{ height: 30, margin: { bottom: 8 } }}
          />
        )}

        {/* Live round scoreboard (synced RoundScores — memory only, never stored) */}
        <Label value="THIS ROUND  (live, in-memory)" fontSize={15} color={DIM} uiTransform={{ height: 24 }} />
        {names.length === 0 ? (
          <Label
            value={state.phase === RoundPhase.Active ? 'No gems collected yet — go!' : 'Waiting for the next round…'}
            fontSize={17}
            color={DIM}
            uiTransform={{ height: 30, margin: { bottom: 6 } }}
          />
        ) : (
          names.map((name, i) => scoreRow(i + 1, name, scores[i] ?? 0, addresses[i] === myAddress))
        )}

        {/* Your round score */}
        <UiEntity
          uiTransform={{
            width: '100%',
            height: 40,
            margin: { top: 6, bottom: 10 },
            padding: { left: 12, right: 12 },
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          uiBackground={{ color: SELF_BG }}
        >
          <Label value="YOUR ROUND SCORE" fontSize={17} color={Color4.White()} />
          <Label value={`${getMyRoundTotal()}`} fontSize={22} color={ACCENT} />
        </UiEntity>

        {/* Hall of fame (synced HallOfFame — the PERSISTED data) */}
        <Label value="HALL OF FAME  (persisted — written once per round)" fontSize={15} color={DIM} uiTransform={{ height: 24 }} />
        {fame.names.length === 0 ? (
          <Label value="No rounds finished yet." fontSize={17} color={DIM} uiTransform={{ height: 28 }} />
        ) : (
          fame.names.map((name, i) => fameRow(i + 1, name, fame.totalGems[i] ?? 0, fame.wins[i] ?? 0))
        )}
        <Label value={`${fame.totalRounds} round(s) played all-time`} fontSize={14} color={DIM} uiTransform={{ height: 22, margin: { bottom: 8 } }} />

        {/* My lifetime stats (from Storage.player via the myStats message) */}
        {stats && (
          <Label
            value={`ME (lifetime): ${stats.gemsCollected} gems · ${stats.wins} wins · best round ${stats.bestRound} · ${stats.gamesPlayed} games`}
            fontSize={15}
            color={GOLD}
            uiTransform={{ height: 26 }}
          />
        )}

        {/* Transient toast. An anti-cheat 'alert' renders as a red boxed banner so a
            server-blocked collect is unmistakable; benign info is plain orange text. */}
        {toast.text !== '' && toast.kind === 'alert' && (
          <UiEntity
            uiTransform={{ width: '100%', height: 'auto', margin: { top: 8 }, padding: 10 }}
            uiBackground={{ color: ALERT_BG }}
          >
            <Label value={toast.text} fontSize={17} color={ALERT} />
          </UiEntity>
        )}
        {toast.text !== '' && toast.kind !== 'alert' && (
          <Label value={toast.text} fontSize={18} color={Color4.fromHexString('#ff9d3aff')} uiTransform={{ height: 30, margin: { top: 8 } }} />
        )}
      </UiEntity>
    </UiEntity>
  )
}
