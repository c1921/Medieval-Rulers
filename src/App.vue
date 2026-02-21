<script setup lang="ts">
import { onMounted } from 'vue'
import MapCanvas from './features/map/MapCanvas.vue'
import MapInspector from './features/map/MapInspector.vue'
import MapToolbar from './features/map/MapToolbar.vue'
import { useMapStore } from './stores/mapStore'

const mapStore = useMapStore()

onMounted(() => {
  void mapStore.loadMapData()
})
</script>

<template>
  <div class="app-shell">
    <h1>Medieval Rulers Map System</h1>
    <MapToolbar />

    <main class="workspace">
      <section class="canvas-panel">
        <MapCanvas />
      </section>
      <section class="side-panel">
        <MapInspector />
      </section>
    </main>
  </div>
</template>
