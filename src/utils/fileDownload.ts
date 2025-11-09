import type { NavMeshData } from './navMeshGenerator'
import type { Mesh } from '@/types'
import { Engine, Scene, Mesh as BabylonMesh, VertexData } from '@babylonjs/core'
import { GLTF2Export } from '@babylonjs/serializers'

/**
 * Downloads a navigation mesh file to the user's device.
 * @param data - The navigation mesh data to download
 * @param filename - The filename for the downloaded file (default: 'navigation_mesh.navmesh')
 */
export function downloadNavMesh(data: NavMeshData, filename: string = 'navigation_mesh.navmesh'): void {
  const blob = new Blob([data.buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Validates mesh data before export.
 * @param meshData - The mesh data to validate
 * @throws Error if validation fails
 */
function validateMeshData(meshData: Mesh): void {
  if (!meshData.vertices || meshData.vertices.length === 0) {
    throw new Error('Mesh validation failed: No vertices found')
  }
  
  if (!meshData.indices || meshData.indices.length === 0) {
    throw new Error('Mesh validation failed: No indices found')
  }
  
  if (!meshData.normals || meshData.normals.length === 0) {
    throw new Error('Mesh validation failed: No normals found')
  }
  
  if (meshData.vertexCount < 3) {
    throw new Error('Mesh validation failed: Mesh must have at least 3 vertices')
  }
  
  if (meshData.indexCount < 3) {
    throw new Error('Mesh validation failed: Mesh must have at least 1 triangle (3 indices)')
  }
  
  if (meshData.vertices.length !== meshData.vertexCount * 3) {
    throw new Error(`Mesh validation failed: Vertex array length (${meshData.vertices.length}) does not match vertex count (${meshData.vertexCount * 3})`)
  }
  
  if (meshData.normals.length !== meshData.vertexCount * 3) {
    throw new Error(`Mesh validation failed: Normal array length (${meshData.normals.length}) does not match vertex count (${meshData.vertexCount * 3})`)
  }
  
  if (meshData.indices.length !== meshData.indexCount) {
    throw new Error(`Mesh validation failed: Index array length (${meshData.indices.length}) does not match index count (${meshData.indexCount})`)
  }
  
  for (let i = 0; i < meshData.vertices.length; i++) {
    const value = meshData.vertices[i]
    if (!Number.isFinite(value)) {
      throw new Error(`Mesh validation failed: Invalid vertex data at index ${i}: ${value}`)
    }
  }
  
  for (let i = 0; i < meshData.indices.length; i++) {
    const index = meshData.indices[i]
    if (index >= meshData.vertexCount) {
      throw new Error(`Mesh validation failed: Index ${i} (${index}) references invalid vertex (max: ${meshData.vertexCount - 1})`)
    }
  }
}

/**
 * Converts Mesh data to a Babylon.js Mesh object.
 * @param meshData - The mesh data to convert
 * @param scene - The Babylon.js scene to create the mesh in
 * @returns The created Babylon.js Mesh
 */
function convertMeshToBabylonMesh(meshData: Mesh, scene: Scene): BabylonMesh {
  validateMeshData(meshData)
  
  const vertexData = new VertexData()
  
  vertexData.positions = Array.from(meshData.vertices)
  vertexData.normals = Array.from(meshData.normals)
  vertexData.indices = Array.from(meshData.indices)
  
  const babylonMesh = new BabylonMesh('navMesh', scene)
  vertexData.applyToMesh(babylonMesh)
  
  if (!babylonMesh.getVerticesData('position') || babylonMesh.getVerticesData('position')!.length === 0) {
    throw new Error('Failed to create Babylon.js mesh: No vertex positions applied')
  }
  
  if (!babylonMesh.getIndices() || babylonMesh.getIndices()!.length === 0) {
    throw new Error('Failed to create Babylon.js mesh: No indices applied')
  }
  
  return babylonMesh
}

/**
 * Exports a navigation mesh as a GLB file.
 * Requires @babylonjs/serializers package to be installed.
 * @param meshData - The mesh data to export
 * @param filename - The filename for the exported file (default: 'navigation_mesh.glb')
 * @returns Promise that resolves when export is complete
 * @throws Error if @babylonjs/serializers is not installed
 */
export async function exportNavMeshAsGLB(meshData: Mesh, filename: string = 'navigation_mesh.glb'): Promise<void> {
  let gltf2Export = GLTF2Export
  
  if (!gltf2Export || typeof gltf2Export.GLBAsync !== 'function') {
    try {
      const serializersModule = await import('@babylonjs/serializers')
      gltf2Export = serializersModule.GLTF2Export
      if (!gltf2Export) {
        throw new Error('GLTF2Export is not exported from @babylonjs/serializers')
      }
      if (typeof gltf2Export.GLBAsync !== 'function') {
        throw new Error('GLTF2Export.GLBAsync is not a function')
      }
    } catch (importError) {
      const errorMessage = importError instanceof Error ? importError.message : 'Unknown import error'
      throw new Error(`Failed to import @babylonjs/serializers: ${errorMessage}. Please ensure the package is installed with: npm install @babylonjs/serializers`)
    }
  }
  
  if (!gltf2Export || typeof gltf2Export.GLBAsync !== 'function') {
    throw new Error('GLTF2Export.GLBAsync is not available. The @babylonjs/serializers package may be corrupted or incompatible. Try reinstalling: npm install @babylonjs/serializers')
  }
  
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: false })
  const scene = new Scene(engine)
  
  try {
    const babylonMesh = convertMeshToBabylonMesh(meshData, scene)
    babylonMesh.name = 'NavigationMesh'
    
    const glbData = await gltf2Export.GLBAsync(scene, 'navmesh')
    
    if (!glbData || typeof glbData !== 'object') {
      throw new Error('GLB export failed: Invalid export data')
    }
    
    let glbBinary: ArrayBuffer | null = null
    
    if ('files' in glbData && glbData.files && typeof glbData.files === 'object') {
      const files: Record<string, string | Blob> = glbData.files
      const fileKeys = Object.keys(files)
      
      for (const key of fileKeys) {
        if (key.endsWith('.glb')) {
          const fileData = files[key]
          if (fileData instanceof Blob) {
            const arrayBuffer = await fileData.arrayBuffer()
            glbBinary = arrayBuffer
            break
          } else if (typeof fileData === 'string') {
            const binaryString = atob(fileData)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            glbBinary = bytes.buffer
            break
          }
        }
      }
    }
    
    if (!glbBinary) {
      throw new Error('GLB export failed: No binary data found in export result files dictionary')
    }
    
    if (glbBinary.byteLength < 100) {
      throw new Error(`GLB export failed: Exported file is too small (${glbBinary.byteLength} bytes). Minimum expected size is 100 bytes.`)
    }
    
    const blob = new Blob([glbBinary], { type: 'model/gltf-binary' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Failed to import') || error.message.includes('GLTF2Export is not available') || error.message.includes('GLTF2Export.GLBAsync is not a function')) {
        throw error
      }
      if (error.message.includes('GLB export requires')) {
        throw error
      }
      throw new Error(`GLB export failed: ${error.message}`)
    }
    throw new Error('GLB export failed with unknown error')
  } finally {
    scene.dispose()
    engine.dispose()
  }
}

