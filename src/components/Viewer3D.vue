<template>
  <v-card>
    <v-card-title>3D Viewer</v-card-title>
    <v-card-text>
      <div ref="canvasContainer" class="viewer-container"></div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, Color3, MeshBuilder, StandardMaterial, SceneLoader, GaussianSplattingMesh } from '@babylonjs/core'
import '@babylonjs/loaders/SPLAT'
import { SplatFileFormat, type PointCloud } from '@/types'

const props = defineProps<{
  pointCloud: PointCloud | null
}>()

const canvasContainer = ref<HTMLDivElement | null>(null)
let engine: Engine | null = null
let scene: Scene | null = null
let camera: ArcRotateCamera | null = null
let resizeHandler: (() => void) | null = null

onMounted(() => {
  if (!canvasContainer.value) return
  
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvasContainer.value.appendChild(canvas)
  
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
  scene = new Scene(engine)
  
  camera = new ArcRotateCamera(
    'camera',
    Math.PI / 2,
    Math.PI / 3,
    10,
    Vector3.Zero(),
    scene
  )
  camera.attachControl(canvas, false)
  camera.setTarget(Vector3.Zero())
  
  new HemisphericLight('light', new Vector3(0, 1, 0), scene)
  
  engine.runRenderLoop(() => {
    if (scene) {
      scene.render()
    }
  })
  
  resizeHandler = () => {
    if (engine) {
      engine.resize()
    }
  }
  window.addEventListener('resize', resizeHandler)
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (camera) {
    camera.detachControl()
    camera = null
  }
  if (scene) {
    scene.dispose()
    scene = null
  }
  if (engine) {
    engine.dispose()
    engine = null
  }
})

watch(() => props.pointCloud, async (pointCloud) => {
  if (!scene) return
  
  scene.meshes.forEach((mesh) => {
    if (mesh.name.startsWith('point_') || mesh.name.startsWith('gaussian_splat_')) {
      mesh.dispose()
    }
  })
  
  if (pointCloud) {
    if (pointCloud.file && pointCloud.fileFormat === SplatFileFormat.SPZ) {
      await loadSPZInScene(pointCloud.file)
    } else if (pointCloud.gaussianMesh) {
      await renderGaussianSplat(pointCloud).catch(() => {
        renderPointCloud(pointCloud)
      })
    } else {
      renderPointCloud(pointCloud)
    }
  }
}, { immediate: true })

async function loadSPZInScene(file: File): Promise<void> {
  if (!scene) return
  
  try {
    const objectUrl = URL.createObjectURL(file)
    
    const result = await SceneLoader.ImportMeshAsync('', '', objectUrl, scene, undefined, '.spz')
    
    URL.revokeObjectURL(objectUrl)
    
    if (result.meshes.length === 0) {
      throw new Error('No meshes found in SPZ file')
    }
    
    const mesh = result.meshes[0]
    let gaussianMesh: GaussianSplattingMesh | null = null
    
    if (mesh instanceof GaussianSplattingMesh) {
      gaussianMesh = mesh
    } else {
      const gsMesh = scene.getMeshByName(mesh.name)
      if (gsMesh instanceof GaussianSplattingMesh) {
        gaussianMesh = gsMesh
      }
    }
    
    if (!gaussianMesh) {
      throw new Error('Loaded mesh is not a GaussianSplattingMesh instance')
    }
    
    if (!gaussianMesh.splatCount || gaussianMesh.splatCount === 0) {
      throw new Error(`Gaussian mesh has no splats (splatCount: ${gaussianMesh.splatCount})`)
    }
    
    gaussianMesh.name = 'gaussian_splat_0'
    gaussianMesh.setEnabled(true)
    
    if (!gaussianMesh.isEnabled() || !gaussianMesh.isVisible) {
      throw new Error('Mesh failed to enable or become visible')
    }
    
    if (camera && gaussianMesh.splatCount > 0) {
      const boundingInfo = gaussianMesh.getBoundingInfo()
      if (boundingInfo) {
        const center = boundingInfo.boundingBox.centerWorld
        const extend = boundingInfo.boundingBox.extendSize
        const maxDist = Math.max(extend.x, extend.y, extend.z)
        
        camera.setTarget(center)
        camera.radius = maxDist * 2.5
      }
    }
  } catch (error) {
    if (props.pointCloud) {
      renderPointCloud(props.pointCloud)
    }
  }
}

async function renderGaussianSplat(pointCloud: PointCloud): Promise<void> {
  if (!scene || !pointCloud.gaussianMesh) return
  
  const gaussianMesh = pointCloud.gaussianMesh
  
  try {
    // Validate mesh has splats
    if (!gaussianMesh.splatCount || gaussianMesh.splatCount === 0) {
      throw new Error(`Gaussian mesh has no splats (splatCount: ${gaussianMesh.splatCount})`)
    }
    
    const meshScene = gaussianMesh.getScene()
    
    if (!meshScene || meshScene !== scene) {
      if (meshScene) {
        meshScene.removeMesh(gaussianMesh, false)
      }
      gaussianMesh.setParent(null)
      scene.addMesh(gaussianMesh)
      
      // Force mesh to update for new scene - refresh bounding info
      gaussianMesh.refreshBoundingInfo()
    }
    
    gaussianMesh.name = 'gaussian_splat_0'
    gaussianMesh.setEnabled(true)
    
    // Verify mesh is properly in scene
    if (gaussianMesh.getScene() !== scene) {
      throw new Error('Mesh failed to attach to scene')
    }
    
    if (!gaussianMesh.isEnabled() || !gaussianMesh.isVisible) {
      throw new Error('Mesh failed to enable or become visible')
    }
  } catch (error) {
    renderPointCloud(pointCloud)
    return
  }
  
  if (camera && pointCloud.count > 0) {
    const vertices = pointCloud.vertices
    let centerX = 0
    let centerY = 0
    let centerZ = 0
    
    for (let i = 0; i < pointCloud.count; i++) {
      centerX += vertices[i * 3]
      centerY += vertices[i * 3 + 1]
      centerZ += vertices[i * 3 + 2]
    }
    
    centerX /= pointCloud.count
    centerY /= pointCloud.count
    centerZ /= pointCloud.count
    
    let maxDist = 0
    for (let i = 0; i < pointCloud.count; i++) {
      const dx = vertices[i * 3] - centerX
      const dy = vertices[i * 3 + 1] - centerY
      const dz = vertices[i * 3 + 2] - centerZ
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > maxDist) {
        maxDist = dist
      }
    }
    
    camera.setTarget(new Vector3(centerX, centerY, centerZ))
    camera.radius = maxDist * 2.5
  }
}

function renderPointCloud(pointCloud: PointCloud): void {
  if (!scene) return
  
  const vertices = pointCloud.vertices
  const colors = pointCloud.colors
  const count = pointCloud.count
  
  if (count === 0) return
  
  const maxPointsToRender = 5000
  const step = Math.max(1, Math.floor(count / maxPointsToRender))
  
  for (let i = 0; i < count; i += step) {
    const point = MeshBuilder.CreateSphere(`point_${i}`, { diameter: 0.05, segments: 4 }, scene)
    point.position = new Vector3(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2])
    const pointMaterial = new StandardMaterial(`pointMat_${i}`, scene)
    pointMaterial.emissiveColor = new Color3(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
    pointMaterial.disableLighting = true
    point.material = pointMaterial
  }
  
  if (camera && count > 0) {
    let centerX = 0
    let centerY = 0
    let centerZ = 0
    
    for (let i = 0; i < count; i++) {
      centerX += vertices[i * 3]
      centerY += vertices[i * 3 + 1]
      centerZ += vertices[i * 3 + 2]
    }
    
    centerX /= count
    centerY /= count
    centerZ /= count
    
    let maxDist = 0
    for (let i = 0; i < count; i++) {
      const dx = vertices[i * 3] - centerX
      const dy = vertices[i * 3 + 1] - centerY
      const dz = vertices[i * 3 + 2] - centerZ
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > maxDist) {
        maxDist = dist
      }
    }
    
    camera.setTarget(new Vector3(centerX, centerY, centerZ))
    camera.radius = maxDist * 2.5
  }
}
</script>

<style scoped>
.viewer-container {
  width: 100%;
  height: 500px;
  position: relative;
}
</style>

