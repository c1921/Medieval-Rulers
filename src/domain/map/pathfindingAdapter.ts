import PF from 'pathfinding'

export interface PathfindingGridInput {
  width: number
  height: number
  blockedTileIds: Iterable<number>
}

function assertTileId(tileId: number, width: number, height: number): void {
  const max = width * height
  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= max) {
    throw new Error(`blocked tile id out of range: ${tileId}`)
  }
}

export function createGridSnapshot(input: PathfindingGridInput): PF.Grid {
  const { width, height, blockedTileIds } = input
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`width must be positive integer, got ${width}`)
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`height must be positive integer, got ${height}`)
  }

  const matrix = Array.from({ length: height }, () => new Array<number>(width).fill(0))

  for (const tileId of blockedTileIds) {
    assertTileId(tileId, width, height)
    const x = tileId % width
    const y = Math.floor(tileId / width)
    const row = matrix[y]
    if (!row) {
      throw new Error(`matrix row out of range for y=${y}`)
    }
    row[x] = 1
  }

  return new PF.Grid(matrix)
}
