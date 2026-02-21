<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { onReady } from 'vue3-pixi'
import type { Container } from 'pixi.js'
import type { MapRenderSnapshot } from '../../domain/map/types'
import { MapRenderer } from './render/MapRenderer'

const props = defineProps<{
  renderer: MapRenderer
  snapshot: MapRenderSnapshot | null
}>()

onReady((app) => {
  props.renderer.attach(app.stage as Container)
})

watch(
  () => props.snapshot,
  (snapshot) => {
    if (snapshot) {
      props.renderer.render(snapshot)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  props.renderer.detach()
})
</script>

<template></template>
