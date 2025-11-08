<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-file-upload</v-icon>
      Upload Gaussian Splat File
    </v-card-title>
    <v-card-text>
      <div
        ref="dropZone"
        :class="['drop-zone', { 'drag-over': isDragOver, 'has-file': selectedFile }]"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
        @click="triggerFileInput"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".spz,.ply,.splat"
          style="display: none"
          @change="handleFileInputChange"
        />
        <div class="drop-zone-content">
          <v-icon size="48" :color="isDragOver ? 'primary' : 'grey'">
            {{ isDragOver ? 'mdi-cloud-upload' : 'mdi-file-upload' }}
          </v-icon>
          <p class="text-h6 mt-2 mb-1">
            {{ isDragOver ? 'Drop file here' : selectedFile ? selectedFile.name : 'Drag & drop file here' }}
          </p>
          <p class="text-body-2 text-medium-emphasis">
            {{ selectedFile ? formatFileSize(selectedFile.size) : 'or click to browse' }}
          </p>
          <p class="text-caption text-medium-emphasis mt-1">
            Supported formats: .spz, .ply, .splat
          </p>
        </div>
      </div>
      
      <div v-if="selectedFile" class="mt-3">
        <v-chip size="small" color="primary" prepend-icon="mdi-file-check" closable @click:close="clearFile">
          {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
        </v-chip>
      </div>
      
      <v-alert
        v-if="errorMessage"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-3"
        closable
        @click:close="errorMessage = ''"
      >
        {{ errorMessage }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const dropZone = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isDragOver = ref(false)
const errorMessage = ref('')

const emit = defineEmits<{
  fileSelected: [file: File]
}>()

const validExtensions = ['.spz', '.ply', '.splat']

function isValidFileType(file: File): boolean {
  const fileName = file.name.toLowerCase()
  return validExtensions.some(ext => fileName.endsWith(ext))
}

function handleFile(file: File): void {
  if (!isValidFileType(file)) {
    errorMessage.value = `Invalid file type. Supported formats: ${validExtensions.join(', ')}`
    return
  }
  
  errorMessage.value = ''
  selectedFile.value = file
  emit('fileSelected', file)
}

function handleDragOver(event: DragEvent): void {
  isDragOver.value = true
  event.dataTransfer.dropEffect = 'copy'
}

function handleDragLeave(event: DragEvent): void {
  const relatedTarget = event.relatedTarget as HTMLElement | null
  if (!dropZone.value?.contains(relatedTarget)) {
    isDragOver.value = false
  }
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) {
    errorMessage.value = 'No files dropped'
    return
  }
  
  const file = files[0]
  handleFile(file)
}

function triggerFileInput(): void {
  fileInput.value?.click()
}

function handleFileInputChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function clearFile(): void {
  selectedFile.value = null
  errorMessage.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
</script>

<style scoped>
.drop-zone {
  border: 2px dashed rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: rgba(255, 255, 255, 0.02);
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover {
  border-color: rgba(255, 255, 255, 0.3);
  background-color: rgba(255, 255, 255, 0.05);
}

.drop-zone.drag-over {
  border-color: rgb(25, 118, 210);
  background-color: rgba(25, 118, 210, 0.1);
  border-style: solid;
  transform: scale(1.02);
}

.drop-zone.has-file {
  border-color: rgba(76, 175, 80, 0.5);
  background-color: rgba(76, 175, 80, 0.05);
}

.drop-zone-content {
  width: 100%;
  pointer-events: none;
}

.drop-zone-content * {
  pointer-events: none;
}
</style>
