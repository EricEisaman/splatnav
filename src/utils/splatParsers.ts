import { SplatFileFormat, type PointCloud } from '@/types'
import { Engine, Scene, SceneLoader, GaussianSplattingMesh } from '@babylonjs/core'
import '@babylonjs/loaders/SPLAT'

/**
 * Internal structure of splatData property in GaussianSplattingMesh.
 * This is not exposed in the public type definition but is available at runtime in Babylon.js 8.36.1+.
 */
interface GaussianSplattingMeshData {
  splatData?: {
    positions?: Float32Array
    colors?: Float32Array
    rotations?: Float32Array
    scales?: Float32Array
  }
}

/**
 * Extended interface for accessing internal properties of GaussianSplattingMesh.
 * These properties exist at runtime but are not in the public type definition.
 */
interface GaussianSplattingMeshInternal extends GaussianSplattingMesh {
  _splatData?: {
    positions?: Float32Array
    colors?: Float32Array
    rotations?: Float32Array
  }
  _splatPositions?: Float32Array
  _positions?: Float32Array
  _colors?: Float32Array
  _rotations?: Float32Array
  geometry?: {
    getVerticesData?: (kind: string) => Float32Array | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Parses a Gaussian splat file (.spz, .ply, or .splat) and extracts point cloud data.
 * @param file - The file to parse
 * @returns Promise resolving to a PointCloud object with vertices, colors, and normals
 * @throws Error if the file is invalid, empty, or in an unsupported format
 */
export async function parseSplatFile(file: File, targetScene?: Scene): Promise<PointCloud> {
  if (!file || file.size === 0) {
    throw new Error('File is empty or invalid')
  }
  
  const fileName = file.name.toLowerCase()
  const extension = fileName.split('.').pop()
  
  if (!extension) {
    throw new Error('File has no extension')
  }
  
  let result: PointCloud
  
  switch (extension) {
    case 'spz':
      result = await parseSPZ(file, targetScene)
      break
    case 'ply':
      result = await parsePLY(file)
      break
    case 'splat':
      result = await parseSplat(file)
      break
    default:
      throw new Error(`Unsupported file format: .${extension}. Supported formats: .spz, .ply, .splat`)
  }
  
  if (!result.file) {
    result.file = file
  }
  if (!result.fileFormat) {
    if (extension === 'spz') {
      result.fileFormat = SplatFileFormat.SPZ
    } else if (extension === 'ply') {
      result.fileFormat = SplatFileFormat.PLY
    } else if (extension === 'splat') {
      result.fileFormat = SplatFileFormat.SPLAT
    }
  }
  
  return result
}

/**
 * Extracts position data from a Float32Array, handling different formats:
 * - 3 floats per splat (x, y, z): use as-is
 * - 4 floats per splat (x, y, z, w): extract x, y, z, skip w component
 * - Other sizes: extract first splatCount * 3 elements
 * @param positions - The position array to extract from
 * @param splatCount - The number of splats
 * @returns Float32Array with exactly splatCount * 3 elements (x, y, z for each splat)
 */
function extractPositions(positions: Float32Array, splatCount: number): Float32Array {
  const expectedSize = splatCount * 3
  const fourFloatSize = splatCount * 4
  const floatsPerSplat = positions.length / splatCount
  
  if (positions.length === expectedSize) {
    // Already in correct format (3 floats per splat)
    return new Float32Array(positions)
  } else if (positions.length >= fourFloatSize && floatsPerSplat >= 3.5 && floatsPerSplat <= 4.5) {
    // 4-float format (x, y, z, w) or similar - extract x, y, z, skip 4th component
    // Handle cases where array might have extra padding at the end
    const result = new Float32Array(expectedSize)
    for (let i = 0; i < splatCount; i++) {
      const srcOffset = i * 4
      const dstOffset = i * 3
      if (srcOffset + 2 < positions.length) {
        result[dstOffset] = positions[srcOffset]     // x
        result[dstOffset + 1] = positions[srcOffset + 1] // y
        result[dstOffset + 2] = positions[srcOffset + 2] // z
        // Skip positions[srcOffset + 3] (w component or padding)
      }
    }
    return result
  } else {
    // Unexpected size - extract first splatCount * 3 elements
    // This handles cases where data might be interleaved differently
    const result = new Float32Array(expectedSize)
    const copyLength = Math.min(positions.length, expectedSize)
    for (let i = 0; i < copyLength; i++) {
      result[i] = positions[i]
    }
    return result
  }
}

/**
 * Parses an SPZ file using Babylon.js SceneLoader.
 * Requires Babylon.js 8.36.1+ for SPZ support.
 * @param file - The SPZ file to parse
 * @returns Promise resolving to a PointCloud object
 * @throws Error if the file cannot be loaded or parsed
 */
async function parseSPZ(file: File, targetScene?: Scene): Promise<PointCloud> {
  let engine: Engine | null = null
  let scene: Scene | null = null
  let objectUrl: string | null = null
  let shouldDisposeScene = false
  
  try {
    if (targetScene) {
      scene = targetScene
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      
      engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: false })
      scene = new Scene(engine)
      shouldDisposeScene = true
    }
    
    objectUrl = URL.createObjectURL(file)
    
    const result = await SceneLoader.ImportMeshAsync('', '', objectUrl, scene, undefined, '.spz')
    
    if (result.meshes.length === 0) {
      throw new Error('No meshes found in SPZ file')
    }
    
    const mesh = result.meshes[0]
    
    let gaussianSplatting: GaussianSplattingMesh | null = null
    if (mesh instanceof GaussianSplattingMesh) {
      gaussianSplatting = mesh
    } else {
      const gsMesh = scene.getMeshByName(mesh.name)
      if (gsMesh instanceof GaussianSplattingMesh) {
        gaussianSplatting = gsMesh
      }
    }
    
    if (!gaussianSplatting) {
      throw new Error('Loaded mesh is not a GaussianSplattingMesh instance')
    }
    
    const splatCount = gaussianSplatting.splatCount || 0
    
    if (splatCount === 0) {
      throw new Error('No splats found in SPZ file - splatCount is 0')
    }
    
    // Comprehensive debugging to find the correct way to access splat data
    const allProps = Object.keys(gaussianSplatting)
    const privateProps = allProps.filter(key => key.startsWith('_'))
    const publicProps = allProps.filter(key => !key.startsWith('_'))
    
    // Check for geometry property
    const gsInternal = gaussianSplatting as GaussianSplattingMeshInternal
    const geometry = gsInternal.geometry
    const geometryProps = geometry ? Object.keys(geometry) : []
    
    // Check for common private property names
    const privateDataProps = privateProps.filter(p => 
      p.includes('splat') || p.includes('data') || p.includes('position') || 
      p.includes('color') || p.includes('rotation') || p.includes('buffer')
    )
    
    // Collect all Float32Array properties for debugging
    const float32Arrays: Array<{ name: string; length: number; meetsSizeReq: boolean }> = []
    
    // Minimum size requirements
    const minPosSize = splatCount * 3
    const minColorSize = splatCount * 3
    const minRotSize = splatCount * 4
    const minInterleavedSize = splatCount * 32 // 32 floats per splat (pos3 + rot4 + scale3 + color15 + opacity1 + other)
    
    // Try to access data through various methods
    let positions: Float32Array | null = null
    let colors: Float32Array | null = null
    let rotations: Float32Array | null = null
    let interleavedBuffer: Float32Array | null = null
    
    // Method 1: Try splatData property (current approach)
    const gsMesh = gaussianSplatting as GaussianSplattingMeshData
    const splatData = gsMesh.splatData
    if (splatData) {
      if (splatData.positions && splatData.positions.length >= minPosSize) {
        positions = splatData.positions
      }
      if (splatData.colors && splatData.colors.length >= minColorSize) {
        colors = splatData.colors
      }
      if (splatData.rotations && splatData.rotations.length >= minRotSize) {
        rotations = splatData.rotations
      }
    }
    
    // Method 2: Try private properties directly (with size validation)
    if (!positions) {
      if (gsInternal._splatData) {
        const data = gsInternal._splatData
        if (data.positions && data.positions.length >= minPosSize) positions = data.positions
        if (data.colors && data.colors.length >= minColorSize) colors = data.colors
        if (data.rotations && data.rotations.length >= minRotSize) rotations = data.rotations
      }
      // Explicit check for _splatPositions (found in error debug output)
      if (gsInternal._splatPositions) {
        if (!positions && gsInternal._splatPositions.length >= minPosSize) {
          positions = gsInternal._splatPositions
        }
      }
      if (!positions && gsInternal._positions && gsInternal._positions.length >= minPosSize) {
        positions = gsInternal._positions
      }
      if (!colors && gsInternal._colors && gsInternal._colors.length >= minColorSize) {
        colors = gsInternal._colors
      }
      if (!rotations && gsInternal._rotations && gsInternal._rotations.length >= minRotSize) {
        rotations = gsInternal._rotations
      }
    }
    
    // Method 3: Try geometry methods (with size validation)
    if (!positions && geometry) {
      try {
        const posData = geometry.getVerticesData?.('position')
        if (posData && posData.length >= minPosSize) positions = posData
        const colData = geometry.getVerticesData?.('color')
        if (colData && colData.length >= minColorSize) colors = colData
      } catch (e) {
        // Geometry methods may not work for GaussianSplattingMesh
      }
    }
    
    // Method 4: Scan all properties for Float32Arrays (with strict size validation)
    // First pass: collect all Float32Arrays for debugging
    for (const prop of allProps) {
      const value = gsInternal[prop]
      if (value instanceof Float32Array) {
        const meetsPosSize = value.length >= minPosSize
        const meetsColorSize = value.length >= minColorSize
        const meetsRotSize = value.length >= minRotSize
        const meetsInterleavedSize = value.length >= minInterleavedSize
        const meetsSizeReq = meetsPosSize || meetsColorSize || meetsRotSize || meetsInterleavedSize
        
        float32Arrays.push({
          name: prop,
          length: value.length,
          meetsSizeReq: meetsSizeReq,
        })
        
        // Only accept arrays that meet size requirements
        // Prioritize explicit _splatPositions check (found in error debug output)
        if (prop === '_splatPositions') {
          if (meetsPosSize && !positions) {
            positions = value
          }
        } else if (prop.includes('position') && meetsPosSize && !positions) {
          positions = value
        } else if (prop.includes('color') && meetsColorSize && !colors) {
          colors = value
        } else if (prop.includes('rotation') && meetsRotSize && !rotations) {
          rotations = value
        } else if (meetsInterleavedSize && !interleavedBuffer) {
          // Found a large buffer that might contain interleaved data
          interleavedBuffer = value
        }
      }
    }
    
    // Method 5: Check geometry internal buffers
    if (!positions && geometry) {
      for (const prop of geometryProps) {
        const value = geometry[prop]
        if (value instanceof Float32Array) {
          float32Arrays.push({
            name: `geometry.${prop}`,
            length: value.length,
            meetsSizeReq: value.length >= minPosSize || value.length >= minColorSize || value.length >= minRotSize || value.length >= minInterleavedSize,
          })
          
          if (value.length >= minPosSize && prop.includes('position') && !positions) {
            positions = value
          } else if (value.length >= minColorSize && prop.includes('color') && !colors) {
            colors = value
          } else if (value.length >= minRotSize && prop.includes('rotation') && !rotations) {
            rotations = value
          } else if (value.length >= minInterleavedSize && !interleavedBuffer) {
            interleavedBuffer = value
          }
        }
      }
    }
    
    // Method 6: Check for interleaved buffer and parse it
    if (interleavedBuffer && (!positions || !colors || !rotations)) {
      // Try to parse interleaved buffer: 32 floats per splat
      // Structure: position(3), rotation(4), scale(3), spherical_harmonics(15), opacity(1), other(6)
      const expectedSize = splatCount * 32
      if (interleavedBuffer.length >= expectedSize) {
        positions = new Float32Array(splatCount * 3)
        colors = new Float32Array(splatCount * 3)
        rotations = new Float32Array(splatCount * 4)
        
        for (let i = 0; i < splatCount; i++) {
          const offset = i * 32
          
          // Extract position (floats 0-2)
          positions[i * 3] = interleavedBuffer[offset]
          positions[i * 3 + 1] = interleavedBuffer[offset + 1]
          positions[i * 3 + 2] = interleavedBuffer[offset + 2]
          
          // Extract rotation quaternion (floats 3-6)
          rotations[i * 4] = interleavedBuffer[offset + 3]
          rotations[i * 4 + 1] = interleavedBuffer[offset + 4]
          rotations[i * 4 + 2] = interleavedBuffer[offset + 5]
          rotations[i * 4 + 3] = interleavedBuffer[offset + 6]
          
          // Extract color from spherical harmonics (simplified - use first 3 coefficients)
          // Spherical harmonics start at offset 7 (after position and rotation)
          // For simplicity, we'll use a default color or try to extract from SH
          colors[i * 3] = 0.5
          colors[i * 3 + 1] = 0.5
          colors[i * 3 + 2] = 0.5
        }
      }
    }
    
    // If still no data found, throw detailed error with all found arrays
    if (!positions) {
      const debugInfo = {
        splatCount,
        expectedMinSizes: {
          positions: minPosSize,
          colors: minColorSize,
          rotations: minRotSize,
          interleaved: minInterleavedSize,
        },
        foundFloat32Arrays: float32Arrays,
        publicProps: publicProps.slice(0, 20).join(', '),
        privateProps: privateProps.slice(0, 20).join(', '),
        privateDataProps: privateDataProps.join(', '),
        hasGeometry: !!geometry,
        geometryProps: geometryProps.slice(0, 10).join(', '),
      }
      throw new Error(
        `No splat data found. Debug info: ${JSON.stringify(debugInfo, null, 2)}`
      )
    }
    
    // Validate positions array
    if (!positions || positions.length < splatCount * 3) {
      throw new Error(`Could not extract positions. positions length: ${positions ? positions.length : 0}, expected: ${splatCount * 3}`)
    }
    
    // Extract vertices (positions) using helper function to handle different formats
    const vertices = extractPositions(positions, splatCount)
    
    // Extract colors
    let colorsArray: Float32Array
    if (colors && colors.length >= splatCount * 3) {
      const actualColorLength = Math.min(colors.length, splatCount * 3)
      colorsArray = new Float32Array(actualColorLength)
      for (let i = 0; i < actualColorLength; i++) {
        colorsArray[i] = colors[i]
      }
    } else {
      // Default gray color if no colors found
      colorsArray = new Float32Array(splatCount * 3)
      for (let i = 0; i < splatCount; i++) {
        colorsArray[i * 3] = 0.5
        colorsArray[i * 3 + 1] = 0.5
        colorsArray[i * 3 + 2] = 0.5
      }
    }
    
    // Extract normals from rotations (quaternions)
    let normalsArray: Float32Array | null = null
    if (rotations && rotations.length >= splatCount * 4) {
      normalsArray = new Float32Array(splatCount * 3)
      for (let i = 0; i < splatCount; i++) {
        const offset = i * 4
        if (offset + 3 < rotations.length) {
          const rotW = rotations[offset]
          const rotX = rotations[offset + 1]
          const rotY = rotations[offset + 2]
          const rotZ = rotations[offset + 3]
          
          // Compute normal from rotation quaternion
          normalsArray[i * 3] = 2 * (rotX * rotZ + rotW * rotY)
          normalsArray[i * 3 + 1] = 2 * (rotY * rotZ - rotW * rotX)
          normalsArray[i * 3 + 2] = 1 - 2 * (rotX * rotX + rotY * rotY)
        }
      }
    }
    
    // Calculate actual count based on extracted vertices
    const actualCount = vertices.length / 3
    
    // If targetScene was provided, keep mesh in scene. Otherwise detach for transfer
    if (!targetScene && gaussianSplatting && scene) {
      gaussianSplatting.setEnabled(false)
      gaussianSplatting.setParent(null)
      scene.removeMesh(gaussianSplatting, false)
    }
    
    const pointCloudResult: PointCloud = {
      vertices,
      colors: colorsArray,
      normals: normalsArray,
      count: actualCount,
      gaussianMesh: targetScene ? gaussianSplatting : undefined,
      file: targetScene ? file : undefined,
      fileFormat: SplatFileFormat.SPZ,
    }
    
    // Dispose scene and engine only if we created them (not if targetScene was provided)
    if (objectUrl) {
      if (!targetScene) {
        URL.revokeObjectURL(objectUrl)
      }
      objectUrl = null
    }
    if (shouldDisposeScene && scene) {
      scene.dispose()
      scene = null
    }
    if (engine) {
      engine.dispose()
      engine = null
    }
    
    return pointCloudResult
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error loading SPZ file'
    throw new Error(`Failed to load SPZ file: ${errorMessage}`)
  } finally {
    if (objectUrl && !targetScene) {
      URL.revokeObjectURL(objectUrl)
    }
    if (shouldDisposeScene && scene) {
      scene.dispose()
    }
    if (engine) {
      engine.dispose()
    }
  }
}

async function parsePLY(file: File): Promise<PointCloud> {
  const text = await file.text()
  const lines = text.split('\n')
  
  let headerEnd = -1
  let vertexCount = 0
  let hasColor = false
  let hasNormal = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('element vertex')) {
      vertexCount = parseInt(line.split(' ')[2], 10)
    } else if (line.includes('red') || line.includes('green') || line.includes('blue')) {
      hasColor = true
    } else if (line.includes('nx') || line.includes('ny') || line.includes('nz')) {
      hasNormal = true
    } else if (line === 'end_header') {
      headerEnd = i + 1
      break
    }
  }
  
  if (headerEnd === -1 || vertexCount === 0) {
    throw new Error('Invalid PLY file: missing header or vertex count')
  }
  
  const vertices = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const normals = hasNormal ? new Float32Array(vertexCount * 3) : new Float32Array(0)
  
  let vertexIndex = 0
  for (let i = headerEnd; i < lines.length && vertexIndex < vertexCount; i++) {
    const parts = lines[i].trim().split(/\s+/)
    if (parts.length < 3) continue
    
    const x = parseFloat(parts[0])
    const y = parseFloat(parts[1])
    const z = parseFloat(parts[2])
    
    vertices[vertexIndex * 3] = x
    vertices[vertexIndex * 3 + 1] = y
    vertices[vertexIndex * 3 + 2] = z
    
    if (hasColor && parts.length >= 6) {
      colors[vertexIndex * 3] = parseFloat(parts[3]) / 255.0
      colors[vertexIndex * 3 + 1] = parseFloat(parts[4]) / 255.0
      colors[vertexIndex * 3 + 2] = parseFloat(parts[5]) / 255.0
    } else {
      colors[vertexIndex * 3] = 0.5
      colors[vertexIndex * 3 + 1] = 0.5
      colors[vertexIndex * 3 + 2] = 0.5
    }
    
    if (hasNormal && parts.length >= 9) {
      normals[vertexIndex * 3] = parseFloat(parts[6])
      normals[vertexIndex * 3 + 1] = parseFloat(parts[7])
      normals[vertexIndex * 3 + 2] = parseFloat(parts[8])
    }
    
    vertexIndex++
  }
  
  return {
    vertices,
    colors,
    normals: hasNormal ? normals : null,
    count: vertexCount,
  }
}

async function parseSplat(file: File): Promise<PointCloud> {
  const arrayBuffer = await file.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)
  
  const bytesPerSplat = 44
  const count = Math.floor(data.length / bytesPerSplat)
  const vertices = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  
  for (let i = 0; i < count; i++) {
    const offset = i * bytesPerSplat
    
    vertices[i * 3] = new DataView(arrayBuffer, offset, 4).getFloat32(0, true)
    vertices[i * 3 + 1] = new DataView(arrayBuffer, offset + 4, 4).getFloat32(0, true)
    vertices[i * 3 + 2] = new DataView(arrayBuffer, offset + 8, 4).getFloat32(0, true)
    
    const r = data[offset + 24]
    const g = data[offset + 25]
    const b = data[offset + 26]
    
    colors[i * 3] = r / 255.0
    colors[i * 3 + 1] = g / 255.0
    colors[i * 3 + 2] = b / 255.0
    
    const rotW = new DataView(arrayBuffer, offset + 28, 4).getFloat32(0, true)
    const rotX = new DataView(arrayBuffer, offset + 32, 4).getFloat32(0, true)
    const rotY = new DataView(arrayBuffer, offset + 36, 4).getFloat32(0, true)
    const rotZ = new DataView(arrayBuffer, offset + 40, 4).getFloat32(0, true)
    
    const qx = rotX
    const qy = rotY
    const qz = rotZ
    const qw = rotW
    
    normals[i * 3] = 2 * (qx * qz + qw * qy)
    normals[i * 3 + 1] = 2 * (qy * qz - qw * qx)
    normals[i * 3 + 2] = 1 - 2 * (qx * qx + qy * qy)
  }
  
  return {
    vertices,
    colors,
    normals,
    count,
  }
}

