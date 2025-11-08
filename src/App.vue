<template>
  <v-app>
    <v-main>
      <v-container fluid class="pa-4">
        <v-row>
          <v-col cols="12">
            <h1 class="text-h4 mb-2">Gaussian Splat Navigation Mesh Generator</h1>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Upload a Gaussian splat file (.spz, .ply, or .splat) to generate a navigation mesh
            </p>
          </v-col>
        </v-row>
        
        <v-row>
          <v-col cols="12" md="6">
            <FileUploader @file-selected="handleFileSelected" />
          </v-col>
          <v-col cols="12" md="6">
            <NavMeshParameters
              :parameters="navMeshParams"
              @parameters-changed="handleParametersChanged"
            />
          </v-col>
        </v-row>
        
        <v-row>
          <v-col cols="12">
            <ProcessingStatus ref="processingStatusRef" :status="processingStatus" />
          </v-col>
        </v-row>
        
        <v-row>
          <v-col cols="12">
            <Viewer3D :point-cloud="pointCloud" />
          </v-col>
        </v-row>
        
        <v-row>
          <v-col cols="12" class="text-center">
            <v-btn
              color="primary"
              size="large"
              prepend-icon="mdi-cog"
              :disabled="!pointCloud || (processingStatus.stage !== 'idle' && processingStatus.stage !== 'complete')"
              :loading="processingStatus.stage === 'converting' || processingStatus.stage === 'generating'"
              @click="generateNavMesh"
            >
              Generate Navigation Mesh
            </v-btn>
            <v-select
              v-if="navMeshData"
              v-model="exportFormat"
              :items="exportFormats"
              label="Export Format"
              density="compact"
              variant="outlined"
              class="mt-4"
              style="max-width: 200px; margin: 0 auto;"
            ></v-select>
            <v-btn
              v-if="navMeshData"
              color="success"
              size="large"
              prepend-icon="mdi-download"
              class="ml-2 mt-2"
              @click="downloadNavMesh"
            >
              Download Navigation Mesh
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import FileUploader from './components/FileUploader.vue'
import Viewer3D from './components/Viewer3D.vue'
import NavMeshParameters from './components/NavMeshParameters.vue'
import ProcessingStatus from './components/ProcessingStatus.vue'
import { parseSplatFile } from './utils/splatParsers'
import { convertPointCloudToMesh } from './utils/meshConverter'
import { generateNavMesh as generateNavMeshUtil, type NavMeshData } from './utils/navMeshGenerator'
import { downloadNavMesh as downloadNavMeshFile, exportNavMeshAsGLB } from './utils/fileDownload'
import type { PointCloud, NavMeshParameters as NavMeshParametersType, ProcessingStatus as ProcessingStatusType, Mesh } from './types'

const pointCloud = ref<PointCloud | null>(null)
const navMeshParams = ref<NavMeshParametersType>({
  agentRadius: 0.5,
  maxSlope: 30,
  walkableHeight: 2.0,
  walkableClimb: 0.4,
  cellSize: 0.2,
  cellHeight: 0.2,
})

const processingStatus = ref<ProcessingStatusType>({
  stage: 'idle',
  message: 'Ready to upload a file',
  progress: 0,
})

const navMeshData = ref<NavMeshData | null>(null)
const navMeshMesh = ref<Mesh | null>(null)
const exportFormat = ref<'navmesh' | 'glb'>('navmesh')
const exportFormats = [
  { title: '.navmesh', value: 'navmesh' },
  { title: '.glb', value: 'glb' },
]

const processingStatusRef = ref<InstanceType<typeof ProcessingStatus> | null>(null)

watch(() => processingStatus.value.stage, async (newStage) => {
  if (newStage === 'error') {
    await nextTick()
    if (processingStatusRef.value && processingStatusRef.value.statusCard) {
      const cardRef = processingStatusRef.value.statusCard
      let element: HTMLElement | null = null
      
      if (cardRef instanceof HTMLElement) {
        element = cardRef
      } else if (cardRef && typeof cardRef === 'object') {
        if ('$el' in cardRef && cardRef.$el instanceof HTMLElement) {
          element = cardRef.$el
        } else if ('el' in cardRef && cardRef.el instanceof HTMLElement) {
          element = cardRef.el
        }
      }
      
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }
})

async function handleFileSelected(file: File): Promise<void> {
  if (!file) {
    processingStatus.value = {
      stage: 'error',
      message: 'No file selected',
      progress: 0,
    }
    return
  }
  
  processingStatus.value = {
    stage: 'parsing',
    message: `Parsing file: ${file.name}...`,
    progress: 10,
  }
  
  try {
    const parsed = await parseSplatFile(file)
    pointCloud.value = parsed
    
    processingStatus.value = {
      stage: 'idle',
      message: `File loaded: ${parsed.count} points`,
      progress: 100,
    }
    
    navMeshData.value = null
    navMeshMesh.value = null
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    processingStatus.value = {
      stage: 'error',
      message: `Error parsing file: ${errorMessage}`,
      progress: 0,
    }
    pointCloud.value = null
  }
}

function handleParametersChanged(params: NavMeshParametersType): void {
  navMeshParams.value = params
}

async function generateNavMesh(): Promise<void> {
  if (!pointCloud.value) return
  
  processingStatus.value = {
    stage: 'converting',
    message: 'Converting point cloud to mesh...',
    progress: 30,
  }
  
  try {
    const mesh = convertPointCloudToMesh(pointCloud.value)
    
    processingStatus.value = {
      stage: 'generating',
      message: 'Generating navigation mesh...',
      progress: 60,
    }
    
    const navMesh = generateNavMeshUtil(mesh, navMeshParams.value)
    navMeshData.value = navMesh
    navMeshMesh.value = mesh
    
    processingStatus.value = {
      stage: 'complete',
      message: 'Navigation mesh generated successfully!',
      progress: 100,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    processingStatus.value = {
      stage: 'error',
      message: `Error generating navigation mesh: ${errorMessage}`,
      progress: 0,
    }
  }
}

async function downloadNavMesh(): Promise<void> {
  if (!navMeshData.value) return
  
  if (exportFormat.value === 'glb' && navMeshMesh.value) {
    try {
      await exportNavMeshAsGLB(navMeshMesh.value, 'navigation_mesh.glb')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      processingStatus.value = {
        stage: 'error',
        message: `GLB export failed: ${errorMessage}`,
        progress: 0,
      }
    }
  } else {
    downloadNavMeshFile(navMeshData.value, 'navigation_mesh.navmesh')
  }
}
</script>

