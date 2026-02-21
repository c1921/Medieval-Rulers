import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMapStore } from '../stores/mapStore'

function findTileWithDistinctLevelIds(store: ReturnType<typeof useMapStore>): number {
  if (!store.data) {
    throw new Error('store data not loaded')
  }
  for (let tileId = 0; tileId < store.data.grid.width * store.data.grid.height; tileId += 1) {
    const county = store.data.modes.deJure.tileToCounty[tileId]
    if (county === undefined) {
      continue
    }
    const duchy = store.data.modes.deJure.countyToDuchy[county]
    if (duchy === undefined) {
      continue
    }
    const kingdom = store.data.modes.deJure.duchyToKingdom[duchy]
    if (kingdom === undefined) {
      continue
    }
    if (county !== duchy && duchy !== kingdom && county !== kingdom) {
      return tileId
    }
  }
  throw new Error('No tile found with distinct IDs across levels')
}

describe('map store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('switches mode/level and updates activeEntityByTile', async () => {
    const store = useMapStore()
    await store.loadMapData()

    store.setMode('deJure')
    store.setLevel('county')
    const first = store.activeEntityByTile.slice(0, 1000)

    store.setLevel('duchy')
    const second = store.activeEntityByTile.slice(0, 1000)

    store.setMode('deFacto')
    const third = store.activeEntityByTile.slice(0, 1000)

    expect(first).not.toEqual(second)
    expect(second).not.toEqual(third)
  })

  it('maps one tile to different entities across county/duchy/kingdom levels', async () => {
    const store = useMapStore()
    await store.loadMapData()
    store.setMode('deJure')

    const tileId = findTileWithDistinctLevelIds(store)

    store.setLevel('county')
    store.selectTile(tileId)
    const countyId = store.view.selectedEntityId

    store.setLevel('duchy')
    store.selectTile(tileId)
    const duchyId = store.view.selectedEntityId

    store.setLevel('kingdom')
    store.selectTile(tileId)
    const kingdomId = store.view.selectedEntityId

    expect(countyId).not.toBeNull()
    expect(duchyId).not.toBeNull()
    expect(kingdomId).not.toBeNull()
    expect(countyId).not.toBe(duchyId)
    expect(duchyId).not.toBe(kingdomId)
    expect(countyId).not.toBe(kingdomId)
  })
})
