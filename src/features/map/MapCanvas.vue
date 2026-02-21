<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Application } from 'vue3-pixi'
import { useMapStore } from '../../stores/mapStore'
import MapScene from './MapScene.vue'
import { MapRenderer } from './render/MapRenderer'

const mapStore = useMapStore()
const hostRef = ref<HTMLElement | null>(null)
const canvasWidth = ref(1280)
const canvasHeight = ref(720)
const renderer = new MapRenderer()
const snapshot = computed(() => mapStore.renderSnapshot)
const resolution = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

const dragState = {
  active: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
  movedDistance: 0,
}

let resizeObserver: ResizeObserver | null = null
let usingWindowResize = false

function updateCanvasSize(): void {
  const host = hostRef.value
  if (!host) {
    return
  }
  canvasWidth.value = Math.max(1, Math.round(host.clientWidth))
  canvasHeight.value = Math.max(1, Math.round(host.clientHeight))
}

function toTileId(clientX: number, clientY: number): number | null {
  const host = hostRef.value
  if (!host || !mapStore.isReady) {
    return null
  }

  const rect = host.getBoundingClientRect()
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  const { viewportX, viewportY, zoom } = mapStore.view
  const { width, height, tileSizePx } = mapStore.grid

  const worldX = (localX - viewportX) / zoom
  const worldY = (localY - viewportY) / zoom
  const tileX = Math.floor(worldX / tileSizePx)
  const tileY = Math.floor(worldY / tileSizePx)

  if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
    return null
  }
  return tileY * width + tileX
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !mapStore.isReady) {
    return
  }
  dragState.active = true
  dragState.pointerId = event.pointerId
  dragState.lastX = event.clientX
  dragState.lastY = event.clientY
  dragState.movedDistance = 0
  hostRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!mapStore.isReady) {
    return
  }

  const hoveredTileId = toTileId(event.clientX, event.clientY)
  mapStore.setHoveredTile(hoveredTileId)

  if (!dragState.active || dragState.pointerId !== event.pointerId) {
    return
  }

  const dx = event.clientX - dragState.lastX
  const dy = event.clientY - dragState.lastY
  dragState.lastX = event.clientX
  dragState.lastY = event.clientY
  dragState.movedDistance += Math.hypot(dx, dy)

  if (dx !== 0 || dy !== 0) {
    mapStore.panBy(dx, dy)
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!dragState.active || dragState.pointerId !== event.pointerId || !mapStore.isReady) {
    return
  }

  hostRef.value?.releasePointerCapture(event.pointerId)
  const tileId = toTileId(event.clientX, event.clientY)
  mapStore.setHoveredTile(tileId)

  if (dragState.movedDistance < 4) {
    mapStore.selectTile(tileId)
  }

  dragState.active = false
  dragState.pointerId = -1
}

function onPointerCancel(event: PointerEvent): void {
  if (!dragState.active || dragState.pointerId !== event.pointerId) {
    return
  }
  hostRef.value?.releasePointerCapture(event.pointerId)
  dragState.active = false
  dragState.pointerId = -1
}

function onPointerLeave(): void {
  if (!dragState.active) {
    mapStore.setHoveredTile(null)
  }
}

function onWheel(event: WheelEvent): void {
  if (!mapStore.isReady || !hostRef.value) {
    return
  }
  event.preventDefault()
  const rect = hostRef.value.getBoundingClientRect()
  const screenX = event.clientX - rect.left
  const screenY = event.clientY - rect.top
  mapStore.zoomAt(screenX, screenY, event.deltaY)
}

onMounted(() => {
  updateCanvasSize()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateCanvasSize)
    if (hostRef.value) {
      resizeObserver.observe(hostRef.value)
    }
  } else {
    usingWindowResize = true
    window.addEventListener('resize', updateCanvasSize)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (usingWindowResize) {
    window.removeEventListener('resize', updateCanvasSize)
  }
  renderer.destroy()
})
</script>

<template>
  <div
    ref="hostRef"
    class="map-canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="onPointerLeave"
    @wheel="onWheel"
  >
    <Application
      :width="canvasWidth"
      :height="canvasHeight"
      :resolution="resolution"
      :auto-density="true"
      :background-color="0x15120f"
    >
      <MapScene :renderer="renderer" :snapshot="snapshot" />
    </Application>
    <div v-if="!mapStore.isReady" class="loading-mask">
      <span v-if="mapStore.loading">Loading map...</span>
      <span v-else-if="mapStore.loadError">{{ mapStore.loadError }}</span>
      <span v-else>Map data unavailable</span>
    </div>
  </div>
</template>

<style scoped>
.map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid #3f3528;
  border-radius: 10px;
  background: #15120f;
}

.map-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.loading-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #e7d9c4;
  font-weight: 600;
  letter-spacing: 0.02em;
  backdrop-filter: blur(1px);
}
</style>
