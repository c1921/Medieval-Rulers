<script setup lang="ts">
import { computed } from 'vue'
import { tileIdToCoord } from '../../domain/map/selectors'
import { useMapStore } from '../../stores/mapStore'

const mapStore = useMapStore()

const hoveredCoord = computed(() => {
  if (!mapStore.isReady || mapStore.view.hoveredTileId === null) {
    return null
  }
  return tileIdToCoord(mapStore.view.hoveredTileId, mapStore.grid)
})

const selectedTileCount = computed(() => {
  if (!mapStore.isReady || mapStore.view.selectedEntityId === null) {
    return 0
  }
  let total = 0
  for (const entityId of mapStore.activeEntityByTile) {
    if (entityId === mapStore.view.selectedEntityId) {
      total += 1
    }
  }
  return total
})
</script>

<template>
  <aside class="inspector">
    <h2>Inspector</h2>

    <dl>
      <div>
        <dt>Mode</dt>
        <dd>{{ mapStore.view.mode }}</dd>
      </div>
      <div>
        <dt>Level</dt>
        <dd>{{ mapStore.view.level }}</dd>
      </div>
      <div>
        <dt>Hovered Tile</dt>
        <dd>
          <template v-if="mapStore.view.hoveredTileId !== null">
            #{{ mapStore.view.hoveredTileId }}
            <span v-if="hoveredCoord">({{ hoveredCoord.x }}, {{ hoveredCoord.y }})</span>
          </template>
          <template v-else>none</template>
        </dd>
      </div>
      <div>
        <dt>Selected Entity</dt>
        <dd>
          <template v-if="mapStore.view.selectedEntityId !== null">
            #{{ mapStore.view.selectedEntityId }}
            <span v-if="mapStore.selectedEntityName">({{ mapStore.selectedEntityName }})</span>
          </template>
          <template v-else>none</template>
        </dd>
      </div>
      <div>
        <dt>Selected Tiles</dt>
        <dd>{{ selectedTileCount }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.inspector {
  border: 1px solid #4a3f31;
  border-radius: 10px;
  padding: 1rem;
  background: linear-gradient(180deg, #241e16 0%, #1b1712 100%);
  color: #e8dbc6;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #dcbf8b;
}

dl {
  display: grid;
  gap: 0.6rem;
  margin: 0;
}

dt {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #c2b093;
}

dd {
  margin: 0.2rem 0 0;
  color: #f1e8da;
  word-break: break-word;
}
</style>
