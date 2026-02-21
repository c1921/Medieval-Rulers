import { Graphics } from 'pixi.js'
import type { GridConfig } from '../../../domain/map/types'

interface ChunkPaintOptions {
  graphics: Graphics
  chunkCol: number
  chunkRow: number
  grid: GridConfig
  activeEntityByTile: readonly number[]
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex(h: number, s: number, l: number): number {
  const hue = h / 360
  const sat = s / 100
  const light = l / 100

  let r: number
  let g: number
  let b: number

  if (sat === 0) {
    r = light
    g = light
    b = light
  } else {
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
    const p = 2 * light - q
    r = hueToRgb(p, q, hue + 1 / 3)
    g = hueToRgb(p, q, hue)
    b = hueToRgb(p, q, hue - 1 / 3)
  }

  return ((Math.round(r * 255) & 0xff) << 16) |
    ((Math.round(g * 255) & 0xff) << 8) |
    (Math.round(b * 255) & 0xff)
}

export function colorForEntity(entityId: number): number {
  const hue = (entityId * 137.508) % 360
  return hslToHex(hue, 45, 42)
}

export function paintChunk(options: ChunkPaintOptions): void {
  const { graphics, chunkCol, chunkRow, grid, activeEntityByTile } = options
  const chunkPixelSize = grid.chunkSize * grid.tileSizePx
  const startX = chunkCol * grid.chunkSize
  const startY = chunkRow * grid.chunkSize
  const endX = Math.min(startX + grid.chunkSize, grid.width)
  const endY = Math.min(startY + grid.chunkSize, grid.height)

  graphics.clear()
  graphics.x = startX * grid.tileSizePx
  graphics.y = startY * grid.tileSizePx

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const tileId = y * grid.width + x
      const entityId = activeEntityByTile[tileId] ?? 0
      const localX = (x - startX) * grid.tileSizePx
      const localY = (y - startY) * grid.tileSizePx

      graphics.beginFill(colorForEntity(entityId), 1)
      graphics.drawRect(localX, localY, grid.tileSizePx, grid.tileSizePx)
      graphics.endFill()
    }
  }

  graphics.lineStyle(1, 0x201c16, 0.35)
  graphics.drawRect(0, 0, chunkPixelSize, chunkPixelSize)
}
