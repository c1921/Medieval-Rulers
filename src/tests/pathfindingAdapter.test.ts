import { describe, expect, it } from 'vitest'
import { createGridSnapshot } from '../domain/map/pathfindingAdapter'

describe('pathfinding adapter', () => {
  it('builds PF.Grid from blocked tile ids', () => {
    const grid = createGridSnapshot({
      width: 4,
      height: 3,
      blockedTileIds: [0, 5, 11],
    })

    expect(grid.isWalkableAt(0, 0)).toBe(false)
    expect(grid.isWalkableAt(1, 1)).toBe(false)
    expect(grid.isWalkableAt(3, 2)).toBe(false)
    expect(grid.isWalkableAt(2, 1)).toBe(true)
  })

  it('throws on out-of-range tile ids', () => {
    expect(() =>
      createGridSnapshot({
        width: 4,
        height: 3,
        blockedTileIds: [12],
      }),
    ).toThrow()
  })
})
