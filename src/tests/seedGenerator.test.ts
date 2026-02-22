import { describe, expect, it } from 'vitest'
import { resolveEntityId } from '../domain/map/selectors'
import { calculateModeDifferenceRatio, generateWorldMapData } from '../domain/map/seedGenerator'

describe('seed generator', () => {
  it('is deterministic for the same seed', () => {
    const first = generateWorldMapData({ seed: 9527 })
    const second = generateWorldMapData({ seed: 9527 })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('generates 6400 tiles for both modes', () => {
    const world = generateWorldMapData({ seed: 9527 })
    expect(world.modes.deJure.tileToCounty.length).toBe(6400)
    expect(world.modes.deFacto.tileToCounty.length).toBe(6400)
    expect(world.grid.width).toBe(80)
    expect(world.grid.height).toBe(80)
  })

  it('maps every sampled tile to county, duchy and kingdom', () => {
    const world = generateWorldMapData({ seed: 9527 })

    for (let tileId = 0; tileId < 6400; tileId += 37) {
      expect(resolveEntityId(world, 'deJure', 'county', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deJure', 'duchy', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deJure', 'kingdom', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deFacto', 'county', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deFacto', 'duchy', tileId)).not.toBeNull()
      expect(resolveEntityId(world, 'deFacto', 'kingdom', tileId)).not.toBeNull()
    }
  })

  it('keeps county base identical across modes', () => {
    const world = generateWorldMapData({ seed: 9527 })
    expect(world.modes.deJure.tileToCounty).toEqual(world.modes.deFacto.tileToCounty)
    expect(world.modes.deJure.countyNames).toEqual(world.modes.deFacto.countyNames)
  })

  it('keeps upper hierarchy difference around 10% across modes', () => {
    const world = generateWorldMapData({ seed: 9527 })
    expect(world.modes.deJure.countyToDuchy).not.toEqual(world.modes.deFacto.countyToDuchy)
    const ratio = calculateModeDifferenceRatio(
      world.modes.deJure.countyToDuchy,
      world.modes.deFacto.countyToDuchy,
    )
    expect(ratio).toBeGreaterThanOrEqual(0.08)
    expect(ratio).toBeLessThanOrEqual(0.12)
  })

  it('generates v2 titles and characters with consistent ownership', () => {
    const world = generateWorldMapData({ seed: 9527 })

    const countyCount = world.modes.deJure.countyNames.length
    const duchyCount = world.modes.deJure.duchyNames.length
    const kingdomCount = world.modes.deJure.kingdomNames.length

    expect(world.version).toBe(2)
    expect(world.characters.length).toBe(countyCount)
    expect(world.titles.length).toBe(countyCount + duchyCount + kingdomCount)

    const charactersById = new Map(world.characters.map((character) => [character.id, character]))
    const heldCounts = new Map<string, number>()

    for (const character of world.characters) {
      expect(character.heldTitleIds).toContain(character.primaryTitleId)
      for (const heldTitleId of character.heldTitleIds) {
        heldCounts.set(heldTitleId, (heldCounts.get(heldTitleId) ?? 0) + 1)
      }
    }

    for (const title of world.titles) {
      expect(charactersById.has(title.holderCharacterId)).toBe(true)
      expect(heldCounts.get(title.id)).toBe(1)
    }

    const hasMultiTitleCharacter = world.characters.some(
      (character) => character.heldTitleIds.length > 1,
    )
    expect(hasMultiTitleCharacter).toBe(true)
  })
})
