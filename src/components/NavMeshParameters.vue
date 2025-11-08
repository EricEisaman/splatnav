<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-tune</v-icon>
      Navigation Mesh Parameters
    </v-card-title>
    <v-card-text>
      <v-slider
        v-model="localParams.agentRadius"
        label="Agent Radius"
        min="0.1"
        max="2.0"
        step="0.1"
        thumb-label
        @update:model-value="updateParams"
      ></v-slider>
      
      <v-slider
        v-model="localParams.maxSlope"
        label="Max Slope (degrees)"
        min="0"
        max="45"
        step="1"
        thumb-label
        @update:model-value="updateParams"
      ></v-slider>
      
      <v-slider
        v-model="localParams.walkableHeight"
        label="Walkable Height"
        min="0.5"
        max="5.0"
        step="0.1"
        thumb-label
        @update:model-value="updateParams"
      ></v-slider>
      
      <v-slider
        v-model="localParams.walkableClimb"
        label="Walkable Climb"
        min="0.1"
        max="2.0"
        step="0.1"
        thumb-label
        @update:model-value="updateParams"
      ></v-slider>
      
      <v-slider
        v-model="localParams.cellSize"
        label="Cell Size"
        min="0.1"
        max="1.0"
        step="0.05"
        thumb-label
        @update:model-value="updateParams"
      ></v-slider>
      
      <v-slider
        v-model="localParams.cellHeight"
        label="Cell Height"
        min="0.1"
        max="1.0"
        step="0.05"
        thumb-label
        @update:model-value="updateParams"
      ></v-slider>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { NavMeshParameters } from '@/types'

const props = defineProps<{
  parameters: NavMeshParameters
}>()

const emit = defineEmits<{
  parametersChanged: [params: NavMeshParameters]
}>()

const localParams = ref<NavMeshParameters>({ ...props.parameters })

watch(() => props.parameters, (newParams) => {
  localParams.value = { ...newParams }
}, { deep: true })

function updateParams(): void {
  emit('parametersChanged', { ...localParams.value })
}
</script>

