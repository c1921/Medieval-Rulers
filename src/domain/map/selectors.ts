import type { GridConfig, HierarchyData, MapLevel, MapMode, WorldMapData } from './types'

export function getTileCount(grid: GridConfig): number {
  return grid.width * grid.height
}

export function isValidTileId(tileId: number, grid: GridConfig): boolean {
  return Number.isInteger(tileId) && tileId >= 0 && tileId < getTileCount(grid)
}

export function tileIdToCoord(tileId: number, grid: GridConfig): { x: number; y: number } {
  const x = tileId % grid.width
  const y = Math.floor(tileId / grid.width)
  return { x, y }
}

export function coordToTileId(x: number, y: number, grid: GridConfig): number | null {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null
  }
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    return null
  }
  return y * grid.width + x
}

export function getHierarchyByMode(data: WorldMapData, mode: MapMode): HierarchyData {
  return data.modes[mode]
}

export function getEntityIdForTile(
  hierarchy: HierarchyData,
  tileId: number,
  level: MapLevel,
): number | null {
  const countyId = hierarchy.tileToCounty[tileId]

  if (countyId === undefined) {
    return null
  }
  if (level === 'county') {
    return countyId
  }

  const duchyId = hierarchy.countyToDuchy[countyId]
  if (duchyId === undefined) {
    return null
  }
  if (level === 'duchy') {
    return duchyId
  }

  const kingdomId = hierarchy.duchyToKingdom[duchyId]
  return kingdomId ?? null
}

export function resolveEntityId(
  data: WorldMapData,
  mode: MapMode,
  level: MapLevel,
  tileId: number,
): number | null {
  if (!isValidTileId(tileId, data.grid)) {
    return null
  }
  return getEntityIdForTile(data.modes[mode], tileId, level)
}

export function buildActiveEntityByTile(
  data: WorldMapData,
  mode: MapMode,
  level: MapLevel,
): number[] {
  const hierarchy = data.modes[mode]
  if (level === 'county') {
    return hierarchy.tileToCounty.slice()
  }

  const out = new Array<number>(hierarchy.tileToCounty.length)
  for (let tileId = 0; tileId < hierarchy.tileToCounty.length; tileId += 1) {
    const countyId = hierarchy.tileToCounty[tileId]
    if (countyId === undefined) {
      out[tileId] = -1
      continue
    }
    const duchyId = hierarchy.countyToDuchy[countyId]
    if (duchyId === undefined) {
      out[tileId] = -1
      continue
    }
    if (level === 'duchy') {
      out[tileId] = duchyId
      continue
    }
    out[tileId] = hierarchy.duchyToKingdom[duchyId] ?? -1
  }
  return out
}

export function getEntityName(
  hierarchy: HierarchyData,
  level: MapLevel,
  entityId: number | null,
): string | null {
  if (entityId === null) {
    return null
  }
  const names =
    level === 'county'
      ? hierarchy.countyNames
      : level === 'duchy'
        ? hierarchy.duchyNames
        : hierarchy.kingdomNames

  return names[entityId] ?? null
}
