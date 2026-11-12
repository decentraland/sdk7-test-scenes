// Writes assets/grid-10m.png: one 10 m x 10 m ground tile with lines every 1 m, stronger every 5 m and strongest on
// the tile edge (every 10 m once repeated). Run with `npm run grid-texture` (pnpm: `pnpm run grid-texture`).
// No dependencies: the PNG is encoded with Node's zlib.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 512 // pixels per tile side
const METRES = 10 // tile side in metres
const PX_PER_M = SIZE / METRES

const BASE = [74, 79, 87]
// [every n metres, line width in px, colour]; later entries draw over earlier ones
const LINES = [
  [1, 2.5, [122, 128, 137]],
  [5, 5, [196, 201, 209]],
  [10, 9, [255, 255, 255]]
]

// Distance in px from coordinate c to the nearest line repeating every `period` px, wrapping at the tile edge.
function distanceToLine(c, period) {
  const m = ((c % period) + period) % period
  return Math.min(m, period - m)
}

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1))
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 3 + 1)
  raw[row] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    let colour = BASE
    for (const [everyM, width, lineColour] of LINES) {
      const period = everyM * PX_PER_M
      const d = Math.min(distanceToLine(x + 0.5, period), distanceToLine(y + 0.5, period))
      const coverage = Math.max(0, Math.min(1, width / 2 + 0.5 - d))
      if (coverage > 0) colour = colour.map((c, i) => Math.round(c + (lineColour[i] - c) * coverage))
    }
    raw.set(colour, row + 1 + x * 3)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // bit depth
header[9] = 2 // colour type: RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = path.join(__dirname, '..', 'assets', 'grid-10m.png')
fs.writeFileSync(out, png)
console.log(`wrote ${out} (${png.length} bytes)`)
