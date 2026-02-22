import { defineStore } from 'pinia'
import rawMapData from '../data/maps/world.v2.json'
import {
  DEFAULT_GRID_CONFIG,
  type MapMode,
  type MapLevel,
  type MapRenderSnapshot,
  type MapViewState,
  type WorldMapDataV2,
} from '../domain/map/types'
import {
  buildActiveEntityByTile,
  getEntityName,
  getHierarchyByMode,
  resolveEntityId,
} from '../domain/map/selectors'
import { validateWorldMapData } from '../domain/map/validation'

interface MapStoreState {
  data: WorldMapDataV2 | null
  loading: boolean
  loadError: string | null
  view: MapViewState
  selectedTileId: number | null
}

const INITIAL_VIEW: MapViewState = {
  mode: 'deJure',
  level: 'county',
  hoveredTileId: null,
  selectedEntityId: null,
  viewportX: 0,
  viewportY: 0,
  zoom: 1,
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

export const useMapStore = defineStore('map', {
  state: (): MapStoreState => ({
    data: null,
    loading: false,
    loadError: null,
    view: { ...INITIAL_VIEW },
    selectedTileId: null,
  }),
  getters: {
    isReady(state): boolean {
      return Boolean(state.data && !state.loading && !state.loadError)
    },
    grid(state) {
      return state.data?.grid ?? DEFAULT_GRID_CONFIG
    },
    activeHierarchy(state) {
      if (!state.data) {
        return null
      }
      return getHierarchyByMode(state.data, state.view.mode)
    },
    activeEntityByTile(state): number[] {
      if (!state.data) {
        return []
      }
      return buildActiveEntityByTile(state.data, state.view.mode, state.view.level)
    },
    renderSnapshot(state): MapRenderSnapshot | null {
      if (!state.data) {
        return null
      }
      return {
        grid: state.data.grid,
        mode: state.view.mode,
        level: state.view.level,
        viewportX: state.view.viewportX,
        viewportY: state.view.viewportY,
        zoom: state.view.zoom,
        hoveredTileId: state.view.hoveredTileId,
        selectedEntityId: state.view.selectedEntityId,
        activeEntityByTile: this.activeEntityByTile,
      }
    },
    selectedEntityName(state): string | null {
      if (!state.data || state.view.selectedEntityId === null) {
        return null
      }
      return getEntityName(
        state.data.modes[state.view.mode],
        state.view.level,
        state.view.selectedEntityId,
      )
    },
  },
  actions: {
    async loadMapData(): Promise<void> {
      if (this.data || this.loading) {
        return
      }
      this.loading = true
      this.loadError = null
      try {
        this.data = validateWorldMapData(rawMapData)
      } catch (error) {
        this.loadError = error instanceof Error ? error.message : String(error)
      } finally {
        this.loading = false
      }
    },
    setMode(mode: MapMode): void {
      if (this.view.mode === mode) {
        return
      }
      this.view.mode = mode
      this.remapSelection()
    },
    setLevel(level: MapLevel): void {
      if (this.view.level === level) {
        return
      }
      this.view.level = level
      this.remapSelection()
    },
    setHoveredTile(tileId: number | null): void {
      if (!this.data || tileId === null) {
        this.view.hoveredTileId = null
        return
      }
      const maxTile = this.data.grid.width * this.data.grid.height
      this.view.hoveredTileId = tileId >= 0 && tileId < maxTile ? tileId : null
    },
    selectTile(tileId: number | null): void {
      if (!this.data || tileId === null) {
        this.selectedTileId = null
        this.view.selectedEntityId = null
        return
      }
      const entityId = resolveEntityId(this.data, this.view.mode, this.view.level, tileId)
      this.selectedTileId = entityId === null ? null : tileId
      this.view.selectedEntityId = entityId
    },
    panBy(dx: number, dy: number): void {
      this.view.viewportX += dx
      this.view.viewportY += dy
    },
    zoomAt(screenX: number, screenY: number, wheelDelta: number): void {
      const previousZoom = this.view.zoom
      const zoomFactor = Math.exp(-wheelDelta * 0.0015)
      const nextZoom = clampZoom(previousZoom * zoomFactor)
      if (nextZoom === previousZoom) {
        return
      }

      const worldX = (screenX - this.view.viewportX) / previousZoom
      const worldY = (screenY - this.view.viewportY) / previousZoom

      this.view.zoom = nextZoom
      this.view.viewportX = screenX - worldX * nextZoom
      this.view.viewportY = screenY - worldY * nextZoom
    },
    remapSelection(): void {
      if (!this.data) {
        return
      }

      const baseTileId = this.selectedTileId ?? this.view.hoveredTileId
      if (baseTileId === null) {
        this.view.selectedEntityId = null
        return
      }

      const entityId = resolveEntityId(this.data, this.view.mode, this.view.level, baseTileId)
      this.view.selectedEntityId = entityId
      if (this.selectedTileId !== null && entityId === null) {
        this.selectedTileId = null
      }
    },
  },
})
