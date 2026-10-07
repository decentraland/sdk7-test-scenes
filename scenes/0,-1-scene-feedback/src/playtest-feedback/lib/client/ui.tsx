import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { MAX_RATING, allQuestions } from '../shared/series'
import { SCALES, ScaleLabels, scaleLabels } from '../shared/scales'
import {
  acceptIntro,
  askQuestions,
  closeGroup,
  declineIntro,
  feedback,
  introAvatar,
  introSpec,
  isCompleted,
  isFirstStep,
  isLastStep,
  isServerAlive,
  nextStep,
  previousStep,
  showIntro,
  setComment,
  setRating,
  submitGroup,
  toastOpacity
} from './state'
import { canSeeDebug, isWallet } from './owner'

// Figma palette. Opaque on purpose: the explorer blends translucent colours in linear space,
// so the design's Black 40% / White 10% come out much lighter.
const PANEL = Color4.fromHexString('#481a77ff')
const SNOW = Color4.fromHexString('#fcfcfcff') // text
const RUBY = Color4.fromHexString('#e84c59ff') // primary button
const MYTHIC = Color4.fromHexString('#ff4bedff') // avatar circle
const SILVER = Color4.fromHexString('#a09ba8ff') // secondary text, placeholders
const SECONDARY = Color4.fromHexString('#3c1752ff') // secondary button
const TILE = Color4.fromHexString('#592f84ff') // tiles, empty bar
const WHITE_50 = Color4.create(1, 1, 1, 0.5) // avatar border
const TILE_SELECTED = Color4.fromHexString('#6e4596ff')
const GRASS = Color4.fromHexString('#28ac00ff') // COMPLETED
// glow images at full strength come out over twice as bright as the design
const GLOW_TINT = Color4.create(1, 1, 1, 0.4)
const INK = Color4.fromHexString('#161518ff') // text typed in the input, toast
const TRANSPARENT = Color4.create(0, 0, 0, 0)
// toast border: the design's #43404A comes out lighter in the explorer
const TOAST_BORDER = Color4.fromHexString('#1c1b1eff')
// Disabled = enabled at half strength over the panel, precomputed. Not opacity: the explorer
// ignores opacity set at creation, only later changes apply.
const RUBY_DISABLED = Color4.fromHexString('#983368ff')
// debug only, not in the design
const DEBUG_BG = Color4.create(0.2, 0.2, 0.25, 0.9)
const WARN = Color4.fromHexString('#ff9d3aff')

// outside src/: .dclignore drops src/ from the deploy
const ASSETS = 'assets/playtest-feedback/'
// Desktop: bottom-right (Figma 1920x1080 frame). Mobile: centred, 35 from bottom (Figma 1600x720 frame).
const PANEL_POSITION = { right: 25, bottom: 54 }
const MOBILE_PANEL_BOTTOM = 35
const TOAST_TOP = 78
// Nine-slices, not stretch, to fill a rounded element: the explorer draws stretch ignoring
// border radius and padding. Zero slices = whole image stretched.
const FILL = { top: 0, bottom: 0, left: 0, right: 0 }
// measured: the explorer draws top-aligned text ~5 px lower than Figma, Input adds ~10/8 inner padding
const TEXT_NUDGE = 5
const INPUT_INSET = { left: 10, top: 8 }

// own renderer: setUiRenderer stays free for the creator's UI
export function setupUi(debug: boolean): void {
  let showDebug = false
  if (debug)
    void canSeeDebug().then((allowed) => {
      showDebug = allowed
      console.log(`[FEEDBACK] debug panel ${allowed ? 'on' : 'hidden: not in preview, not the scene owner or a deployer'}`)
    })
  const ui = () => (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {glyphWarmUp()}
      {showDebug && debugPanel()}
      {showDebug && showScaleGallery && scaleGallery()}
      {feedback.phase === 'intro' && introPanel()}
      {feedback.phase === 'open' && questionPanel()}
      {toast()}
    </UiEntity>
  )
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), ui, {
    virtualWidth: isMobile() ? 1600 : 1920,
    virtualHeight: isMobile() ? 720 : 1080
  })
}

// Invisible, until the server is first up. The explorer's font atlas misses a digit the first
// time one is requested, and the glyph comes from the emoji font instead (a grey "2" in "2/3").
// The second request lands in the atlas, and Questions wait for the server, so the counter asks after this one.
let warmedUp = false
function glyphWarmUp() {
  if (!warmedUp) warmedUp = isServerAlive()
  if (warmedUp) return null
  return (
    <Label
      value="0123456789/ <b>0123456789/</b>"
      fontSize={16}
      color={TRANSPARENT}
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 } }}
    />
  )
}

// debug: one button per Question
function debugPanel() {
  const alive = isServerAlive()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 120, left: 24 },
        flexDirection: 'column',
        padding: 12
      }}
      uiBackground={{ color: DEBUG_BG }}
    >
      <Label
        value={alive ? 'DEBUG · server online' : 'DEBUG · server waking up…'}
        fontSize={16}
        color={alive ? Color4.Green() : WARN}
        uiTransform={{ height: 26 }}
      />
      {allQuestions().map((q) =>
        button(
          `Ask ${q.id}`,
          () => void askQuestions([q.id], 'debug', { repeat: true, source: 'debug' }),
          alive && feedback.phase === 'idle',
          q.id
        )
      )}
      {introSpec() !== null && button('Show intro', () => void showIntro('debug', 'debug'), feedback.phase === 'idle', 'show-intro')}
      {button('Scale labels', () => (showScaleGallery = !showScaleGallery), true, 'scale-gallery')}
    </UiEntity>
  )
}

// every scale's labels as tiles, plain and selected, to check each fits
let showScaleGallery = false
function scaleGallery() {
  const seen = new Set<string>()
  const sets: ScaleLabels[] = []
  for (const labels of [...Object.values(SCALES), ...allQuestions().map((q) => scaleLabels(q.scale))]) {
    const key = labels.join('|')
    if (!seen.has(key)) {
      seen.add(key)
      sets.push(labels)
    }
  }
  const row = (labels: ScaleLabels, selected: boolean, key: string) => (
    <UiEntity key={key} uiTransform={{ width: 500, flexDirection: 'row', margin: { bottom: 8 } }}>
      {labels.map((label, i) => tile(i + 1, label, selected, undefined))}
    </UiEntity>
  )
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 40, left: 360 },
        flexDirection: 'column',
        padding: 20,
        borderRadius: 24
      }}
      uiBackground={{ color: PANEL }}
    >
      {sets.map((labels, i) => (
        <UiEntity key={`set-${i}`} uiTransform={{ flexDirection: 'row' }}>
          {row(labels, false, 'plain')}
          {spacer('gap', 24)}
          {row(labels, true, 'selected')}
        </UiEntity>
      ))}
    </UiEntity>
  )
}

// shell of both panels: background, glows, close button
function panel(
  key: string,
  padding: { top: number; bottom: number },
  onClose: (() => void) | null,
  children: ReactEcs.JSX.Element[]
) {
  if (!isMobile()) return card(key, padding, onClose, children, PANEL_POSITION)
  // centred in a full-width row: right for any phone aspect ratio
  return (
    <UiEntity
      key={key}
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: MOBILE_PANEL_BOTTOM, left: 0 },
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center'
      }}
    >
      {card('card', padding, onClose, children)}
    </UiEntity>
  )
}

function card(
  key: string,
  padding: { top: number; bottom: number },
  onClose: (() => void) | null,
  children: ReactEcs.JSX.Element[],
  position?: typeof PANEL_POSITION
) {
  return (
    <UiEntity
      key={key}
      uiTransform={{
        positionType: position ? 'absolute' : 'relative',
        position,
        width: 600,
        borderRadius: 24,
        overflow: 'hidden',
        flexDirection: 'column',
        alignItems: 'center',
        padding: { top: padding.top, bottom: padding.bottom, left: 50, right: 50 }
      }}
      uiBackground={{ color: PANEL }}
    >
      {glow('glow-top.png', 226, 182, { top: 0, right: 0 })}
      {glow('glow-bottom.png', 600, 273, { bottom: 0, left: 0 })}
      {children}
      {onClose && iconClose(onClose)}
    </UiEntity>
  )
}

// glows as images: scene UI has no gradients
function glow(file: string, width: number, height: number, position: { top?: number; right?: number; bottom?: number; left?: number }) {
  return (
    <UiEntity
      key={file}
      uiTransform={{ positionType: 'absolute', position, width, height }}
      uiBackground={{ textureMode: 'stretch', texture: { src: ASSETS + file }, color: GLOW_TINT }}
    />
  )
}

function iconClose(onClick: () => void) {
  return (
    <UiEntity
      key="close"
      uiTransform={{
        positionType: 'absolute',
        position: { top: 7, right: 7 },
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      onMouseDown={onClick}
    >
      <UiEntity
        uiTransform={{ width: 20, height: 20 }}
        uiBackground={{ textureMode: 'stretch', texture: { src: ASSETS + 'close.png' } }}
      />
    </UiEntity>
  )
}

function introPanel() {
  const intro = introSpec()
  if (!intro) return null
  // no picture yet (owner not found): the circle keeps its place
  const picture = introAvatar()
  const withAvatar = intro.avatar !== null
  return panel('intro', { top: 50, bottom: 50 }, declineIntro, [
    withAvatar ? avatar(picture) : spacer('no-avatar', 0),
    <Label
      key="title"
      value={intro.title}
      fontSize={20}
      color={SNOW}
      textAlign="middle-center"
      textWrap="wrap"
      uiTransform={{ width: 500, minHeight: 24, margin: { top: withAvatar ? 24 : 0 } }}
    />,
    <Label
      key="text"
      value={intro.text}
      fontSize={16}
      color={SNOW}
      textAlign="middle-center"
      textWrap="wrap"
      uiTransform={{ width: 500, minHeight: 38, margin: { top: 32 } }}
    />,
    <UiEntity key="ctas" uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: 44 } }}>
      {cta('skip', declineIntro, { kind: 'secondary', width: 190, key: 'intro-skip' })}
      {spacer('intro-gap', 20)}
      {cta('give feedback', acceptIntro, { kind: 'primary', width: 190, arrow: 'right', key: 'intro-yes' })}
    </UiEntity>
  ])
}

// wallet address: the explorer fetches that profile's face. Else an image path or URL.
function avatar(source: string | null) {
  const texture =
    source === null
      ? null
      : isWallet(source)
        ? { avatarTexture: { userId: source.toLowerCase() } }
        : { texture: { src: source } }
  return (
    <UiEntity
      key="avatar"
      uiTransform={{ width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: WHITE_50 }}
      uiBackground={{ color: MYTHIC }}
    >
      {texture && (
        <UiEntity
          uiTransform={{ width: '100%', height: '100%', borderRadius: 27 }}
          uiBackground={{ textureMode: 'nine-slices', textureSlices: FILL, ...texture }}
        />
      )}
    </UiEntity>
  )
}

function questionPanel() {
  const q = feedback.question
  if (!q) return null
  const labels = scaleLabels(q.scale)

  return panel('question', { top: 60, bottom: 50 }, closeGroup, [
    ...(feedback.steps > 1 ? [isCompleted() ? completedLabel() : progressBar()] : []),
    <Label
      key="title"
      value={q.text}
      fontSize={20}
      color={SNOW}
      textAlign="top-left"
      textWrap="wrap"
      uiTransform={{ width: 500, minHeight: 24, margin: { top: (feedback.steps > 1 ? 32 : 0) - TEXT_NUDGE } }}
    />,
    <UiEntity key="tiles" uiTransform={{ width: 500, flexDirection: 'row', margin: { top: 40 + TEXT_NUDGE } }}>
      {Array.from({ length: MAX_RATING }, (_, i) =>
        tile(i + 1, labels[i], i + 1 === feedback.rating, () => setRating(i + 1))
      )}
    </UiEntity>,
    ...(feedback.withComment ? [commentField(q.commentPrompt ?? '')] : []),
    footer()
  ])
}

// Groups of two or more only
const PROGRESS_WIDTH = 465
function progressBar() {
  return (
    <UiEntity
      key="progress"
      uiTransform={{ width: 500, height: 10, flexDirection: 'row', alignItems: 'center' }}
    >
      <UiEntity
        uiTransform={{ width: PROGRESS_WIDTH, height: 10, borderRadius: 5 }}
        uiBackground={{ color: TILE }}
      >
        <UiEntity
          uiTransform={{ width: (PROGRESS_WIDTH * feedback.step) / feedback.steps, height: 10, borderRadius: 5 }}
          uiBackground={{ textureMode: 'nine-slices', textureSlices: FILL, texture: { src: ASSETS + 'progress-fill.png' } }}
        />
      </UiEntity>
      <Label
        value={`${feedback.step}/${feedback.steps}`}
        fontSize={16}
        color={SNOW}
        // left-aligned, so a wider count runs on to the right
        textAlign="middle-left"
        textWrap="nowrap"
        uiTransform={{ width: 500 - PROGRESS_WIDTH - 12, height: 10, margin: { left: 12 } }}
      />
    </UiEntity>
  )
}

function completedLabel() {
  return (
    <UiEntity key="completed" uiTransform={{ width: 500, height: 10, alignItems: 'center' }}>
      <Label value="✔ COMPLETED" fontSize={12} color={GRASS} textAlign="middle-left" uiTransform={{ height: 10 }} />
    </UiEntity>
  )
}

// Every tile keeps a border, transparent when not selected, so selecting shifts nothing.
// The design's pink glow is missing: scene UI has no shadows.
const FACES = ['😞', '🙁', '😐', '🙂', '🤩']
// emoji render ~1.3x font size: 23 shows as the design's 30
const FACE_SIZE = 23
function tile(value: number, label: string, selected: boolean, onClick: (() => void) | undefined) {
  const lines = labelLines(label)
  return (
    <UiEntity
      key={value}
      uiTransform={{
        flexGrow: 1,
        flexBasis: 0,
        height: 84,
        margin: { left: value === 1 ? 0 : 16 },
        flexDirection: 'column',
        alignItems: 'center',
        // the design's 12 a side is too narrow in the explorer's SemiBold; labelLines() breaks lines instead
        padding: { top: 5, bottom: 1, left: 0, right: 0 },
        borderRadius: 6,
        borderWidth: 3,
        borderColor: selected ? RUBY : TRANSPARENT
      }}
      uiBackground={{ color: selected ? TILE_SELECTED : TILE }}
      onMouseDown={onClick}
    >
      <Label value={FACES[value - 1]} fontSize={FACE_SIZE} textAlign="middle-center" uiTransform={{ width: 30, height: 30 }} />
      <Label
        value={selected ? `<b>${lines.join('\n')}</b>` : lines.join('\n')}
        fontSize={labelSize(lines)}
        color={SNOW}
        textAlign="top-center"
        // nowrap: else a bold label loses its last letter to a new line
        textWrap="nowrap"
        // 3 under the design's 8: else a two-line label runs into the selected border
        uiTransform={{ width: '100%', height: 34, margin: { top: 5 - TEXT_NUDGE } }}
      />
    </UiEntity>
  )
}

// 9+ char phrase → two most even lines ("Very\ndifficult"). "A little" stays whole, a single word never breaks.
const LABEL_SIZE = 14
// chars that fit a tile at LABEL_SIZE, bold included
const LABEL_FIT = 9.5
function labelLines(label: string): string[] {
  const words = label.split(' ')
  if (words.length < 2 || label.length < 9) return [label]
  let best: string[] = [label]
  let bestLongest = Infinity
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    const longest = Math.max(lines[0].length, lines[1].length)
    if (longest < bestLongest) {
      best = lines
      bestLongest = longest
    }
  }
  return best
}

// smaller type for a too-long word ("Uncomfortable"), same selected or not, so selecting never resizes
function labelSize(lines: string[]): number {
  const longest = Math.max(...lines.map((l) => l.length))
  return Math.min(LABEL_SIZE, Math.floor((LABEL_SIZE * LABEL_FIT) / longest))
}

// The design's input: white, rounded, the prompt as placeholder.
function commentField(prompt: string) {
  return (
    <Input
      key="comment"
      placeholder={prompt}
      placeholderColor={SILVER}
      color={INK}
      value={feedback.comment}
      onChange={setComment}
      fontSize={16}
      textAlign="top-left"
      uiTransform={{
        width: 500,
        height: 86,
        margin: { top: 24 },
        padding: { top: 13 - INPUT_INSET.top, left: 16 - INPUT_INSET.left, right: 16 - INPUT_INSET.left },
        borderRadius: 12,
        borderWidth: 0,
        borderColor: TRANSPARENT
      }}
      uiBackground={{ color: SNOW }}
    />
  )
}

function footer() {
  return (
    <UiEntity
      key="footer"
      uiTransform={{
        width: 500,
        height: 46,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: { top: 44 }
      }}
    >
      {isFirstStep()
        ? cta('skip', closeGroup, { kind: 'secondary', width: 125, key: 'skip' })
        : cta('back', previousStep, { kind: 'secondary', width: 125, arrow: 'left', key: 'back' })}
      {isLastStep()
        ? cta('submit', submitGroup, { kind: 'primary', key: 'submit' })
        : cta('next', nextStep, { kind: 'primary', arrow: 'right', key: 'next' })}
    </UiEntity>
  )
}

// top centre, over everything; the full-width row centres it on any aspect ratio
function toast() {
  const opacity = toastOpacity()
  if (opacity === null) return null
  // Fade through colour alpha, not opacity: the explorer ignores opacity set at creation, so a fade-in would flash.
  const fade = (c: Color4) => Color4.create(c.r, c.g, c.b, c.a * opacity)
  return (
    <UiEntity
      key="toast"
      uiTransform={{
        positionType: 'absolute',
        position: { top: TOAST_TOP, left: 0 },
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center'
      }}
    >
      <UiEntity
        uiTransform={{
          height: 40,
          padding: { left: 10, right: 16 },
          borderRadius: 12,
          borderWidth: 1,
          borderColor: fade(TOAST_BORDER),
          flexDirection: 'row',
          alignItems: 'center'
        }}
        uiBackground={{ color: fade(INK) }}
      >
        <UiEntity
          uiTransform={{ width: 18, height: 18, margin: { right: 6 } }}
          uiBackground={{ textureMode: 'stretch', texture: { src: ASSETS + 'check.png' }, color: fade(SNOW) }}
        />
        <Label value="Thanks for your feedback!" fontSize={14} color={fade(SNOW)} />
      </UiEntity>
    </UiEntity>
  )
}

type CtaOptions = {
  kind: 'primary' | 'secondary'
  key: string
  width?: number
  arrow?: 'left' | 'right'
}
function cta(text: string, onClick: () => void, { kind, key, width, arrow }: CtaOptions) {
  const caps = text.toUpperCase()
  return (
    <UiEntity
      key={key}
      uiTransform={{
        width,
        height: 46,
        padding: width === undefined ? { left: 29, right: 29 } : undefined,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: kind === 'primary' ? RUBY : SECONDARY }}
      onMouseDown={onClick}
    >
      {arrow === 'left' && arrowIcon('left')}
      <Label value={kind === 'primary' ? `<b>${caps}</b>` : caps} fontSize={14} color={SNOW} />
      {arrow === 'right' && arrowIcon('right')}
    </UiEntity>
  )
}

// one chevron image, mirrored through UVs for the left one
const MIRRORED = [1, 0, 1, 1, 0, 1, 0, 0]
function arrowIcon(side: 'left' | 'right') {
  return (
    <UiEntity
      uiTransform={{ width: 8, height: 13, margin: side === 'right' ? { left: 20 } : { right: 10 } }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: ASSETS + 'arrow-right.png' },
        color: SNOW,
        uvs: side === 'left' ? MIRRORED : undefined
      }}
    />
  )
}

function spacer(key: string, width: number) {
  return <UiEntity key={key} uiTransform={{ width, height: 1 }} />
}

// debug buttons only
function button(text: string, onClick: () => void, enabled: boolean, key: string) {
  return (
    <UiEntity
      key={key}
      uiTransform={{
        width: 180,
        height: 40,
        margin: 4,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: enabled ? RUBY : RUBY_DISABLED }}
      onMouseDown={enabled ? onClick : undefined}
    >
      <Label value={text} fontSize={16} color={SNOW} />
    </UiEntity>
  )
}
