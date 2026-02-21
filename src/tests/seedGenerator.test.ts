import { describe, expect, it } from 'vitest'
import { resolveEntityId } from '../domain/map/selectors'
import {
  calculateModeDifferenceRatio,
  generateWorldMapData,
} from '../domain/map/seedGenerator'

describe('seed generator', () => {
  it('is deterministic for the same seed', () => {
    const first = generateWorldMapData({ seed: 9527 })
    const second = generateWorldMapData({ seed: 9527 })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('generates 30000 tiles for both modes', () => {
    const world = generateWorldMapData({ seed: 9527 })
    expect(world.modes.deJure.tileToCounty.length).toBe(30000)
    expect(world.modes.deFacto.tileToCounty.length).toBe(30000)
  })

  it('maps every sampled tile to county, duchy and kingdom', () => {
    const world = generateWorldMapData({ seed: 9527 })

    for (let tileId = 0; tileId < 30000; tileId += 97) {
      expect(resolveEntityId(world, 'deJure', 'county', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deJure', 'duchy', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deJure', 'kingdom', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deFacto', 'county', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deFacto', 'duchy', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deFacto', 'kingdom', tileId)).not.toBeNull()
    }
  })

  it('keeps deJure and deFacto sufficiently different', () => {
    const world = generateWorldMapData({ seed: 9527 })
    const ratio = calculateModeDifferenceRatio(
      world.modes.deJure.tileToCounty,
      world.modes.deFacto.tileToCounty,
    )
    expect(ratio).toBeGreaterThan(0.15)
  })
})
