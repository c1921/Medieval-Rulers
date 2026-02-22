import { describe, expect, it } from 'vitest'
import { generateWorldMapData } from '../domain/map/seedGenerator'
import { validateWorldMapData } from '../domain/map/validation'

describe('map validation', () => {
  it('accepts valid world map data v2', () => {
    const world = generateWorldMapData({ seed: 9527 })
    expect(() => validateWorldMapData(world)).not.toThrow()
  })

  it('rejects title holder that points to missing character', () => {
    const world = generateWorldMapData({ seed: 9527 })
    const payload = structuredClone(world)
    payload.titles[0]!.holderCharacterId = 'character:999999'
    expect(() => validateWorldMapData(payload)).toThrow()
  })

  it('rejects invalid parent rank relation', () => {
    const world = generateWorldMapData({ seed: 9527 })
    const payload = structuredClone(world)
    payload.titles[0]!.deJureParentTitleId = 'kingdom:0'
    expect(() => validateWorldMapData(payload)).toThrow()
  })

  it('rejects duplicate title ids', () => {
    const world = generateWorldMapData({ seed: 9527 })
    const payload = structuredClone(world)
    payload.titles[1]!.id = payload.titles[0]!.id
    expect(() => validateWorldMapData(payload)).toThrow()
  })

  it('rejects character primary title outside held titles', () => {
    const world = generateWorldMapData({ seed: 9527 })
    const payload = structuredClone(world)
    const lastTitle = payload.titles[payload.titles.length - 1]
    payload.characters[0]!.primaryTitleId = lastTitle!.id
    expect(() => validateWorldMapData(payload)).toThrow()
  })
})
