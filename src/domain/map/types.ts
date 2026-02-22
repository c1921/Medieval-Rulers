export const MAP_WIDTH = 80 as const
export const MAP_HEIGHT = 80 as const
export const TILE_SIZE_PX = 10 as const
export const CHUNK_SIZE = 20 as const
export const DEFAULT_SEED = 9527
export const MAP_VERSION = 2 as const

export type MapMode = 'deJure' | 'deFacto'
export type MapLevel = 'county' | 'duchy' | 'kingdom'
export type TitleRank = 'county' | 'duchy' | 'kingdom'
export type TitleId = `${TitleRank}:${number}`
export type CharacterId = `character:${number}`

export interface GridConfig {
  width: 80
  height: 80
  tileSizePx: 10
  chunkSize: 20
  seed: number
}

export interface HierarchyData {
  tileToCounty: number[]
  countyToDuchy: number[]
  duchyToKingdom: number[]
  countyNames: string[]
  duchyNames: string[]
  kingdomNames: string[]
}

export interface MapTitle {
  id: TitleId
  rank: TitleRank
  entityId: number
  name: string
  mapColor: number
  coatOfArmsSeed: string
  holderCharacterId: CharacterId
  deJureParentTitleId: TitleId | null
  deFactoParentTitleId: TitleId | null
}

export interface MapCharacter {
  id: CharacterId
  name: string
  primaryTitleId: TitleId
  heldTitleIds: TitleId[]
}

export interface WorldMapDataV2 {
  version: 2
  grid: GridConfig
  modes: Record<MapMode, HierarchyData>
  titles: MapTitle[]
  characters: MapCharacter[]
}

export type WorldMapData = WorldMapDataV2

export interface MapViewState {
  mode: MapMode
  level: MapLevel
  hoveredTileId: number | null
  selectedEntityId: number | null
  viewportX: number
  viewportY: number
  zoom: number
}

export interface MapRenderSnapshot {
  grid: GridConfig
  mode: MapMode
  level: MapLevel
  viewportX: number
  viewportY: number
  zoom: number
  hoveredTileId: number | null
  selectedEntityId: number | null
  activeEntityByTile: readonly number[]
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tileSizePx: TILE_SIZE_PX,
  chunkSize: CHUNK_SIZE,
  seed: DEFAULT_SEED,
}

export const MAP_MODES: readonly MapMode[] = ['deJure', 'deFacto']
export const MAP_LEVELS: readonly MapLevel[] = ['county', 'duchy', 'kingdom']
