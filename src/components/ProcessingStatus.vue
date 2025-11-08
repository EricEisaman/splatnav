<template>
  <v-card ref="statusCard">
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-information</v-icon>
      Processing Status
    </v-card-title>
    <v-card-text>
      <v-progress-linear
        :model-value="status.progress"
        :color="getProgressColor()"
        height="25"
        rounded
      >
        <template v-slot:default="{ value }">
          <strong>{{ Math.ceil(value) }}%</strong>
        </template>
      </v-progress-linear>
      <div class="mt-3">
        <v-alert
          :type="getAlertType()"
          :text="status.message"
          variant="tonal"
        ></v-alert>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ProcessingStatus } from '@/types'

const props = defineProps<{
  status: ProcessingStatus
}>()

const statusCard = ref<HTMLElement | null>(null)

defineExpose({
  statusCard
})

function getProgressColor(): string {
  switch (props.status.stage) {
    case 'error':
      return 'error'
    case 'complete':
      return 'success'
    case 'parsing':
    case 'converting':
    case 'generating':
      return 'primary'
    default:
      return 'primary'
  }
}

function getAlertType(): 'success' | 'info' | 'warning' | 'error' {
  switch (props.status.stage) {
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
    case 'idle':
      return 'info'
    default:
      return 'info'
  }
}
</script>

