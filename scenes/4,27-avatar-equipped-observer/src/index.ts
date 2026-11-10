import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { AvatarEquippedData, engine, Material, MeshRenderer, TextAlignMode, TextShape, Transform } from '@dcl/sdk/ecs'
import { getEquippedWearables } from './equippedWearables'

const REFRESH_SECONDS = 0.5
const UNSET_GRACE_SECONDS = 5

const GREEN = Color4.create(0.3, 1, 0.3, 1)
const RED = Color4.create(1, 0.25, 0.25, 1)
const WHITE = Color4.White()

let elapsed = 0
let sinceRefresh = REFRESH_SECONDS
let changes = 0
let lastSnapshot: string | undefined
let lastSummary = ''

const board = engine.addEntity()
Transform.create(board, { position: Vector3.create(8, 3, 1) })
TextShape.create(board, {
  text: '',
  fontSize: 3,
  width: 9,
  height: 5,
  textWrapping: false,
  textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
  textColor: WHITE
})

for (const rotation of [Quaternion.Identity(), Quaternion.fromEulerDegrees(0, 180, 0)]) {
  const backing = engine.addEntity()
  Transform.create(backing, {
    position: Vector3.create(8, 3, 1.05),
    scale: Vector3.create(9.5, 5.5, 1),
    rotation
  })
  MeshRenderer.setPlane(backing)
  Material.setPbrMaterial(backing, { albedoColor: Color4.create(0.05, 0.05, 0.08, 1), roughness: 1, metallic: 0 })
}

function visibility(visible: boolean | undefined): string {
  if (visible === undefined) return 'unset'
  return visible ? 'visible' : 'hidden'
}

function shortName(urn: string): string {
  const parts = urn.split(':')
  return parts[parts.length - 1] || urn
}

engine.addSystem((dt: number) => {
  elapsed += dt
  sinceRefresh += dt
  if (sinceRefresh < REFRESH_SECONDS) return
  sinceRefresh = 0

  const component = AvatarEquippedData.getOrNull(engine.PlayerEntity)
  const text = TextShape.getMutable(board)
  const seconds = Math.floor(elapsed)
  const header = `AvatarEquippedData (4,27)\nt=${seconds}s  changes=${changes}`

  if (!component) {
    text.text = `${header}\nno AvatarEquippedData`
    text.textColor = WHITE
    return
  }

  const snapshot = JSON.stringify(component)
  if (snapshot !== lastSnapshot) {
    if (lastSnapshot !== undefined) changes++
    lastSnapshot = snapshot
  }

  const wearables = getEquippedWearables(engine.PlayerEntity) ?? []
  const unset = wearables.filter((w) => w.visible === undefined).length
  const summary = `unset: ${unset}/${wearables.length}`
  const lines = wearables.map((w) => `${shortName(w.urn)}: ${visibility(w.visible)}`)

  text.text = [header, ...lines, summary].join('\n')
  if (unset === 0) text.textColor = GREEN
  else text.textColor = elapsed > UNSET_GRACE_SECONDS ? RED : WHITE

  const logLine = `${summary} | ${lines.join(', ')}`
  if (logLine !== lastSummary) {
    lastSummary = logLine
    console.log(`[observer] t=${seconds}s changes=${changes} ${logLine}`)
  }
})
