import type { PointCloud, Mesh } from '@/types'

const MAX_POINTS_FOR_MESH = 50000

/**
 * Downsamples a point cloud to a maximum number of points using uniform sampling.
 * @param pointCloud - The point cloud to downsample
 * @param maxPoints - Maximum number of points to keep (default: MAX_POINTS_FOR_MESH)
 * @returns A downsampled PointCloud
 */
function downsamplePointCloud(pointCloud: PointCloud, maxPoints: number = MAX_POINTS_FOR_MESH): PointCloud {
  if (pointCloud.count <= maxPoints) {
    return pointCloud
  }
  
  const step = Math.ceil(pointCloud.count / maxPoints)
  const newCount = Math.floor(pointCloud.count / step)
  const newVertices = new Float32Array(newCount * 3)
  const newColors = new Float32Array(newCount * 3)
  const newNormals = pointCloud.normals ? new Float32Array(newCount * 3) : null
  
  for (let i = 0; i < newCount; i++) {
    const srcIndex = i * step
    const dstIndex = i * 3
    
    newVertices[dstIndex] = pointCloud.vertices[srcIndex * 3]
    newVertices[dstIndex + 1] = pointCloud.vertices[srcIndex * 3 + 1]
    newVertices[dstIndex + 2] = pointCloud.vertices[srcIndex * 3 + 2]
    
    newColors[dstIndex] = pointCloud.colors[srcIndex * 3]
    newColors[dstIndex + 1] = pointCloud.colors[srcIndex * 3 + 1]
    newColors[dstIndex + 2] = pointCloud.colors[srcIndex * 3 + 2]
    
    if (newNormals && pointCloud.normals) {
      newNormals[dstIndex] = pointCloud.normals[srcIndex * 3]
      newNormals[dstIndex + 1] = pointCloud.normals[srcIndex * 3 + 1]
      newNormals[dstIndex + 2] = pointCloud.normals[srcIndex * 3 + 2]
    }
  }
  
  return {
    vertices: newVertices,
    colors: newColors,
    normals: newNormals,
    count: newCount,
  }
}

/**
 * Converts a point cloud to a mesh using Delaunay triangulation.
 * Automatically downsamples large point clouds to prevent O(n³) explosion.
 * @param pointCloud - The point cloud to convert
 * @returns A Mesh object with vertices, indices, and normals
 * @throws Error if the point cloud has fewer than 3 points
 */
export function convertPointCloudToMesh(pointCloud: PointCloud): Mesh {
  if (pointCloud.count < 3) {
    throw new Error('Point cloud must have at least 3 points')
  }
  
  const downsampled = downsamplePointCloud(pointCloud)
  return delaunayTriangulation(downsampled)
}

function delaunayTriangulation(pointCloud: PointCloud): Mesh {
  const vertices = pointCloud.vertices
  const count = pointCloud.count
  
  const MAX_TRIANGLES = 10000000
  const indices: number[] = []
  let triangleCount = 0
  
  for (let i = 0; i < count - 2 && triangleCount < MAX_TRIANGLES; i++) {
    for (let j = i + 1; j < count - 1 && triangleCount < MAX_TRIANGLES; j++) {
      for (let k = j + 1; k < count && triangleCount < MAX_TRIANGLES; k++) {
        const v0 = i * 3
        const v1 = j * 3
        const v2 = k * 3
        
        const p0 = {
          x: vertices[v0],
          y: vertices[v0 + 1],
          z: vertices[v0 + 2],
        }
        const p1 = {
          x: vertices[v1],
          y: vertices[v1 + 1],
          z: vertices[v1 + 2],
        }
        const p2 = {
          x: vertices[v2],
          y: vertices[v2 + 1],
          z: vertices[v2 + 2],
        }
        
        if (isValidTriangle(p0, p1, p2)) {
          indices.push(i, j, k)
          triangleCount++
        }
      }
    }
  }
  
  if (indices.length === 0) {
    throw new Error('No valid triangles found in point cloud')
  }
  
  const indicesArray = new Uint32Array(indices)
  const normals = computeNormals(vertices, indicesArray, triangleCount)
  
  return {
    vertices: new Float32Array(vertices),
    indices: indicesArray,
    normals,
    vertexCount: count,
    indexCount: indices.length,
  }
}

function isValidTriangle(p0: { x: number; y: number; z: number }, p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): boolean {
  const dx1 = p1.x - p0.x
  const dy1 = p1.y - p0.y
  const dz1 = p1.z - p0.z
  
  const dx2 = p2.x - p0.x
  const dy2 = p2.y - p0.y
  const dz2 = p2.z - p0.z
  
  const crossX = dy1 * dz2 - dz1 * dy2
  const crossY = dz1 * dx2 - dx1 * dz2
  const crossZ = dx1 * dy2 - dy1 * dx2
  
  const area = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)
  
  return area > 0.0001
}

function computeNormals(vertices: Float32Array, indices: Uint32Array, triangleCount: number): Float32Array {
  const normals = new Float32Array(vertices.length)
  const counts = new Float32Array(vertices.length / 3)
  
  for (let i = 0; i < triangleCount; i++) {
    const i0 = indices[i * 3] * 3
    const i1 = indices[i * 3 + 1] * 3
    const i2 = indices[i * 3 + 2] * 3
    
    const v0x = vertices[i0]
    const v0y = vertices[i0 + 1]
    const v0z = vertices[i0 + 2]
    
    const v1x = vertices[i1] - v0x
    const v1y = vertices[i1 + 1] - v0y
    const v1z = vertices[i1 + 2] - v0z
    
    const v2x = vertices[i2] - v0x
    const v2y = vertices[i2 + 1] - v0y
    const v2z = vertices[i2 + 2] - v0z
    
    const nx = v1y * v2z - v1z * v2y
    const ny = v1z * v2x - v1x * v2z
    const nz = v1x * v2y - v1y * v2x
    
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len > 0.0001) {
      const invLen = 1.0 / len
      const normalX = nx * invLen
      const normalY = ny * invLen
      const normalZ = nz * invLen
      
      normals[i0] += normalX
      normals[i0 + 1] += normalY
      normals[i0 + 2] += normalZ
      counts[i0 / 3] += 1
      
      normals[i1] += normalX
      normals[i1 + 1] += normalY
      normals[i1 + 2] += normalZ
      counts[i1 / 3] += 1
      
      normals[i2] += normalX
      normals[i2 + 1] += normalY
      normals[i2 + 2] += normalZ
      counts[i2 / 3] += 1
    }
  }
  
  for (let i = 0; i < normals.length; i += 3) {
    const count = counts[i / 3]
    if (count > 0) {
      const invCount = 1.0 / count
      normals[i] *= invCount
      normals[i + 1] *= invCount
      normals[i + 2] *= invCount
      
      const len = Math.sqrt(normals[i] * normals[i] + normals[i + 1] * normals[i + 1] + normals[i + 2] * normals[i + 2])
      if (len > 0.0001) {
        const invLen = 1.0 / len
        normals[i] *= invLen
        normals[i + 1] *= invLen
        normals[i + 2] *= invLen
      }
    }
  }
  
  return normals
}


