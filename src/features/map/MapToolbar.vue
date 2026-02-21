<script setup lang="ts">
import { MAP_LEVELS, MAP_MODES, type MapLevel, type MapMode } from '../../domain/map/types'
import { useMapStore } from '../../stores/mapStore'

const mapStore = useMapStore()

const modeLabel: Record<MapMode, string> = {
  deJure: 'De Jure',
  deFacto: 'De Facto',
}

const levelLabel: Record<MapLevel, string> = {
  county: 'County',
  duchy: 'Duchy',
  kingdom: 'Kingdom',
}

function selectMode(mode: MapMode): void {
  mapStore.setMode(mode)
}

function selectLevel(level: MapLevel): void {
  mapStore.setLevel(level)
}
</script>

<template>
  <header class="toolbar">
    <section class="group">
      <span class="title">Map Mode</span>
      <button
        v-for="mode in MAP_MODES"
        :key="mode"
        type="button"
        class="tool-btn"
        :class="{ active: mapStore.view.mode === mode }"
        :disabled="!mapStore.isReady"
        @click="selectMode(mode)"
      >
        {{ modeLabel[mode] }}
      </button>
    </section>

    <section class="group">
      <span class="title">Map Level</span>
      <button
        v-for="level in MAP_LEVELS"
        :key="level"
        type="button"
        class="tool-btn"
        :class="{ active: mapStore.view.level === level }"
        :disabled="!mapStore.isReady"
        @click="selectLevel(level)"
      >
        {{ levelLabel[level] }}
      </button>
    </section>

    <section class="status">
      <span>Zoom: {{ mapStore.view.zoom.toFixed(2) }}x</span>
    </section>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem 1.4rem;
  padding: 0.75rem 1rem;
  border: 1px solid #4a3f31;
  border-radius: 10px;
  background: linear-gradient(180deg, #2a231a 0%, #1f1a14 100%);
}

.group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.title {
  font-size: 0.82rem;
  color: #cfbea4;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tool-btn {
  border: 1px solid #66543d;
  background: #241d14;
  color: #eadcc6;
  border-radius: 8px;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
}

.tool-btn.active {
  background: #a78652;
  border-color: #d3ba8e;
  color: #1f170d;
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  margin-left: auto;
  color: #dbc6a4;
  font-size: 0.9rem;
}
</style>
