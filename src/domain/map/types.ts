export const MAP_WIDTH = 100 as const
export const MAP_HEIGHT = 300 as const
export const TILE_SIZE_PX = 10 as const
export const CHUNK_SIZE = 20 as const
export const DEFAULT_SEED = 9527
export const MAP_VERSION = 1 as const

export type MapMode = 'deJure' | 'deFacto'
export type MapLevel = 'county' | 'duchy' | 'kingdom'

export interface GridConfig {
  width: 100
  height: 300
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

export interface WorldMapDataV1 {
  version: 1
  grid: GridConfig
  modes: Record<MapMode, HierarchyData>
}

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
