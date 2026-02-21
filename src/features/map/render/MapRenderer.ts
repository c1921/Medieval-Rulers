import { Container, Graphics } from 'pixi.js'
import type { GridConfig, MapRenderSnapshot } from '../../../domain/map/types'
import { paintChunk } from './chunkPainter'

interface ChunkRef {
  col: number
  row: number
  graphics: Graphics
}

export class MapRenderer {
  private stage: Container | null = null
  private readonly root = new Container()
  private readonly baseLayer = new Container()
  private readonly overlayLayer = new Container()
  private readonly selectionOverlay = new Graphics()
  private readonly hoverOverlay = new Graphics()
  private chunks: ChunkRef[] = []
  private lastGridSignature = ''
  private lastActiveEntityRef: readonly number[] | null = null
  private lastHoveredTileId: number | null = null
  private lastSelectedEntityId: number | null = null

  constructor() {
    this.root.addChild(this.baseLayer)
    this.root.addChild(this.overlayLayer)
    this.overlayLayer.addChild(this.selectionOverlay)
    this.overlayLayer.addChild(this.hoverOverlay)
  }

  attach(stage: Container): void {
    if (this.stage === stage) {
      return
    }

    this.detach()
    this.stage = stage
    this.stage.addChild(this.root)
  }

  detach(): void {
    if (this.stage) {
      this.stage.removeChild(this.root)
    }
    this.stage = null
  }

  destroy(): void {
    this.detach()
    this.clearChunks()
    this.selectionOverlay.destroy()
    this.hoverOverlay.destroy()
    this.overlayLayer.destroy()
    this.baseLayer.destroy()
    this.root.destroy()
  }

  render(snapshot: MapRenderSnapshot): void {
    if (!this.stage) {
      return
    }

    this.root.position.set(snapshot.viewportX, snapshot.viewportY)
    this.root.scale.set(snapshot.zoom, snapshot.zoom)

    const gridSignature = this.getGridSignature(snapshot.grid)
    if (gridSignature !== this.lastGridSignature) {
      this.rebuildChunks(snapshot.grid)
      this.lastGridSignature = gridSignature
      this.lastActiveEntityRef = null
      this.lastHoveredTileId = null
      this.lastSelectedEntityId = null
    }

    const activeEntityChanged = this.lastActiveEntityRef !== snapshot.activeEntityByTile
    if (activeEntityChanged) {
      this.drawBaseChunks(snapshot)
      this.lastActiveEntityRef = snapshot.activeEntityByTile
    }

    if (
      activeEntityChanged ||
      this.lastHoveredTileId !== snapshot.hoveredTileId ||
      this.lastSelectedEntityId !== snapshot.selectedEntityId
    ) {
      this.drawOverlays(snapshot)
      this.lastHoveredTileId = snapshot.hoveredTileId
      this.lastSelectedEntityId = snapshot.selectedEntityId
    }
  }

  private getGridSignature(grid: GridConfig): string {
    return `${grid.width}:${grid.height}:${grid.tileSizePx}:${grid.chunkSize}`
  }

  private rebuildChunks(grid: GridConfig): void {
    this.clearChunks()

    const cols = Math.ceil(grid.width / grid.chunkSize)
    const rows = Math.ceil(grid.height / grid.chunkSize)

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const graphics = new Graphics()
        this.baseLayer.addChild(graphics)
        this.chunks.push({ col, row, graphics })
      }
    }
  }

  private clearChunks(): void {
    for (const chunk of this.chunks) {
      this.baseLayer.removeChild(chunk.graphics)
      chunk.graphics.destroy()
    }
    this.chunks = []
  }

  private drawBaseChunks(snapshot: MapRenderSnapshot): void {
    for (const chunk of this.chunks) {
      paintChunk({
        graphics: chunk.graphics,
        chunkCol: chunk.col,
        chunkRow: chunk.row,
        grid: snapshot.grid,
        activeEntityByTile: snapshot.activeEntityByTile,
      })
    }
  }

  private drawOverlays(snapshot: MapRenderSnapshot): void {
    this.selectionOverlay.clear()
    this.hoverOverlay.clear()
    this.drawSelectionOverlay(snapshot)
    this.drawHoverOverlay(snapshot)
  }

  private drawSelectionOverlay(snapshot: MapRenderSnapshot): void {
    const selectedEntityId = snapshot.selectedEntityId
    if (selectedEntityId === null) {
      return
    }

    const { grid, activeEntityByTile } = snapshot
    this.selectionOverlay.beginFill(0xf6d28f, 0.3)
    this.selectionOverlay.lineStyle(1, 0xf6d28f, 0.7)

    for (let tileId = 0; tileId < activeEntityByTile.length; tileId += 1) {
      if (activeEntityByTile[tileId] !== selectedEntityId) {
        continue
      }
      const x = tileId % grid.width
      const y = Math.floor(tileId / grid.width)
      this.selectionOverlay.drawRect(
        x * grid.tileSizePx,
        y * grid.tileSizePx,
        grid.tileSizePx,
        grid.tileSizePx,
      )
    }

    this.selectionOverlay.endFill()
  }

  private drawHoverOverlay(snapshot: MapRenderSnapshot): void {
    const tileId = snapshot.hoveredTileId
    if (tileId === null) {
      return
    }

    const { grid } = snapshot
    const maxTile = grid.width * grid.height
    if (tileId < 0 || tileId >= maxTile) {
      return
    }

    const x = tileId % grid.width
    const y = Math.floor(tileId / grid.width)
    this.hoverOverlay.lineStyle(2, 0xfff2c4, 1)
    this.hoverOverlay.beginFill(0xfff2c4, 0.08)
    this.hoverOverlay.drawRect(x * grid.tileSizePx, y * grid.tileSizePx, grid.tileSizePx, grid.tileSizePx)
    this.hoverOverlay.endFill()
  }
}
