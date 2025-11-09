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
            <Viewer3D :point-cloud="pointCloudForViewer" />
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
import { ref, watch, nextTick, computed } from 'vue'
import FileUploader from './components/FileUploader.vue'
import Viewer3D from './components/Viewer3D.vue'
import NavMeshParameters from './components/NavMeshParameters.vue'
import ProcessingStatus from './components/ProcessingStatus.vue'
import { parseSplatFile } from './utils/splatParsers'
import { convertPointCloudToMesh } from './utils/meshConverter'
import { generateNavMesh as generateNavMeshUtil, type NavMeshData } from './utils/navMeshGenerator'
import { downloadNavMesh as downloadNavMeshFile, exportNavMeshAsGLB } from './utils/fileDownload'
import { createGaussianSplatNavMesh } from './utils/gsNavMeshPlugin'
import { Engine, Scene, Mesh as BabylonMesh, GaussianSplattingMesh } from '@babylonjs/core'
import type { PointCloud, NavMeshParameters as NavMeshParametersType, ProcessingStatus as ProcessingStatusType, Mesh, SplatFileFormat } from './types'

const pointCloud = ref<PointCloud | null>(null)

const pointCloudForViewer = computed(() => {
  const pc = pointCloud.value
  if (!pc) {
    return null
  }
  const vertices = new Float32Array(pc.vertices.length)
  vertices.set(pc.vertices)
  const colors = new Float32Array(pc.colors.length)
  colors.set(pc.colors)
  const normals = pc.normals ? (() => {
    const arr = new Float32Array(pc.normals.length)
    arr.set(pc.normals)
    return arr
  })() : null
  const gaussianMeshValue = pc.gaussianMesh && pc.gaussianMesh instanceof GaussianSplattingMesh ? pc.gaussianMesh : undefined
  const result: PointCloud = {
    vertices,
    colors,
    normals,
    count: pc.count,
    gaussianMesh: gaussianMeshValue,
    file: pc.file,
    fileFormat: pc.fileFormat,
  }
  return result
})

function createMutablePointCloudForRef(
  v: Float32Array,
  c: Float32Array,
  n: Float32Array | null,
  cnt: number,
  gm: GaussianSplattingMesh | undefined,
  f: File | undefined,
  ff: SplatFileFormat | undefined
): PointCloud {
  const vertices = new Float32Array(v.length)
  vertices.set(v)
  const colors = new Float32Array(c.length)
  colors.set(c)
  const normals = n ? (() => {
    const arr = new Float32Array(n.length)
    arr.set(n)
    return arr
  })() : null
  return {
    vertices,
    colors,
    normals,
    count: cnt,
    gaussianMesh: gm,
    file: f,
    fileFormat: ff,
  }
}

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
        const cardObj: Record<string, unknown> = cardRef
        if ('$el' in cardObj && cardObj.$el instanceof HTMLElement) {
          element = cardObj.$el
        } else if ('el' in cardObj && cardObj.el instanceof HTMLElement) {
          element = cardObj.el
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
    const verticesCopy = new Float32Array(parsed.vertices.length)
    verticesCopy.set(parsed.vertices)
    const colorsCopy = new Float32Array(parsed.colors.length)
    colorsCopy.set(parsed.colors)
    const normalsCopy = parsed.normals ? (() => {
      const arr = new Float32Array(parsed.normals.length)
      arr.set(parsed.normals)
      return arr
    })() : null
    let gaussianMeshCopy: GaussianSplattingMesh | undefined = undefined
    const parsedGaussianMesh = parsed.gaussianMesh
    if (parsedGaussianMesh && parsedGaussianMesh instanceof GaussianSplattingMesh) {
      gaussianMeshCopy = parsedGaussianMesh
    }
    const countValue = parsed.count
    const fileValue = parsed.file
    const fileFormatValue = parsed.fileFormat
    
    const finalVertices = new Float32Array(verticesCopy.length)
    finalVertices.set(verticesCopy)
    const finalColors = new Float32Array(colorsCopy.length)
    finalColors.set(colorsCopy)
    const finalNormals = normalsCopy ? (() => {
      const arr = new Float32Array(normalsCopy.length)
      arr.set(normalsCopy)
      return arr
    })() : null
    
    const pcVertices = new Float32Array(finalVertices.length)
    pcVertices.set(finalVertices)
    const pcColors = new Float32Array(finalColors.length)
    pcColors.set(finalColors)
    const pcNormals = finalNormals ? (() => {
      const arr = new Float32Array(finalNormals.length)
      arr.set(finalNormals)
      return arr
    })() : null
    
    const pcValue = createMutablePointCloudForRef(pcVertices, pcColors, pcNormals, countValue, gaussianMeshCopy, fileValue, fileFormatValue)
    
    pointCloud.value = pcValue
    
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

  let tempEngine: Engine | null = null
  let tempScene: Scene | null = null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    tempEngine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: false })
    tempScene = new Scene(tempEngine)

    if (pointCloud.value.gaussianMesh) {
      processingStatus.value = {
        stage: 'converting',
        message: 'Extracting ground points from Gaussian Splatting...',
        progress: 20,
      }

      const gaussianMesh = pointCloud.value.gaussianMesh
      if (!(gaussianMesh instanceof GaussianSplattingMesh)) {
        throw new Error('gaussianMesh is not a valid GaussianSplattingMesh instance')
      }

      const navManager = await createGaussianSplatNavMesh(
        gaussianMesh,
        tempScene,
        navMeshParams.value,
        '/navMeshWorker.js'
      )

      processingStatus.value = {
        stage: 'generating',
        message: 'Generating navigation mesh...',
        progress: 70,
      }

      const navMeshDataResult = navManager.getNavMeshData()
      if (!navMeshDataResult) {
        throw new Error('Failed to get navigation mesh data')
      }

      navMeshData.value = navMeshDataResult

      const sourceMesh = tempScene.getMeshByName('GS_NavMesh_Source')
      if (sourceMesh) {
        const vertexData = sourceMesh.getVerticesData('position')
        const indices = sourceMesh.getIndices()
        const normals = sourceMesh.getVerticesData('normal')

        if (vertexData && indices) {
          const verticesArray = vertexData instanceof Float32Array ? vertexData : new Float32Array(vertexData)
          const indicesArray = indices instanceof Uint32Array ? indices : new Uint32Array(indices)
          const normalsArray = normals ? (normals instanceof Float32Array ? normals : new Float32Array(normals)) : new Float32Array(verticesArray.length)

          navMeshMesh.value = {
            vertices: verticesArray,
            indices: indicesArray,
            normals: normalsArray,
            vertexCount: verticesArray.length / 3,
            indexCount: indicesArray.length,
          }
        }
      }

      navManager.dispose()

      processingStatus.value = {
        stage: 'complete',
        message: 'Navigation mesh generated successfully!',
        progress: 100,
      }
    } else {
      processingStatus.value = {
        stage: 'converting',
        message: 'Converting point cloud to mesh...',
        progress: 30,
      }

      const pc = pointCloud.value
      if (!pc) {
        throw new Error('Point cloud is null')
      }
      const verticesCopy = new Float32Array(pc.vertices.length)
      verticesCopy.set(pc.vertices)
      const colorsCopy = new Float32Array(pc.colors.length)
      colorsCopy.set(pc.colors)
      const normalsCopy = pc.normals ? (() => {
        const arr = new Float32Array(pc.normals.length)
        arr.set(pc.normals)
        return arr
      })() : null
      let gaussianMeshCopy: GaussianSplattingMesh | undefined = undefined
      if (pc.gaussianMesh && pc.gaussianMesh instanceof GaussianSplattingMesh) {
        gaussianMeshCopy = pc.gaussianMesh
      }
      const countValue = pc.count
      const fileValue = pc.file
      const fileFormatValue = pc.fileFormat
      
      function createMutablePointCloudForMesh(
        v: Float32Array,
        c: Float32Array,
        n: Float32Array | null,
        cnt: number,
        gm: GaussianSplattingMesh | undefined,
        f: File | undefined,
        ff: SplatFileFormat | undefined
      ): PointCloud {
        return {
          vertices: v,
          colors: c,
          normals: n,
          count: cnt,
          gaussianMesh: gm,
          file: f,
          fileFormat: ff,
        }
      }
      
      const mutablePointCloud = createMutablePointCloudForMesh(verticesCopy, colorsCopy, normalsCopy, countValue, gaussianMeshCopy, fileValue, fileFormatValue)
      const mesh = convertPointCloudToMesh(mutablePointCloud, tempScene)

      processingStatus.value = {
        stage: 'generating',
        message: 'Generating navigation mesh...',
        progress: 60,
      }

      const meshByName = tempScene.getMeshByName('PointCloud_Mesh')
      if (!meshByName) {
        throw new Error('Failed to find generated mesh in scene')
      }
      if (!(meshByName instanceof BabylonMesh)) {
        throw new Error('Found mesh is not a Babylon Mesh instance')
      }
      const babylonMesh = meshByName

      const navMesh = await generateNavMeshUtil(babylonMesh, navMeshParams.value, tempScene, '/navMeshWorker.js')
      navMeshData.value = navMesh
      navMeshMesh.value = mesh

      processingStatus.value = {
        stage: 'complete',
        message: 'Navigation mesh generated successfully!',
        progress: 100,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    processingStatus.value = {
      stage: 'error',
      message: `Error generating navigation mesh: ${errorMessage}`,
      progress: 0,
    }
  } finally {
    if (tempScene) {
      tempScene.dispose()
    }
    if (tempEngine) {
      tempEngine.dispose()
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

