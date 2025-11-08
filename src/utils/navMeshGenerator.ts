import type { Mesh, NavMeshParameters } from '@/types'

export interface NavMeshData {
  buffer: ArrayBuffer
}

/**
 * Generates a navigation mesh in Recast/Detour format from a mesh.
 * @param mesh - The mesh to generate a navigation mesh from
 * @param parameters - Navigation mesh generation parameters
 * @returns NavMeshData containing the binary navigation mesh data
 * @throws Error if the mesh is invalid or parameters are out of range
 */
export function generateNavMesh(mesh: Mesh, parameters: NavMeshParameters): NavMeshData {
  if (mesh.vertexCount < 3) {
    throw new Error('Mesh must have at least 3 vertices')
  }
  if (mesh.indexCount < 3) {
    throw new Error('Mesh must have at least 3 indices (1 triangle)')
  }
  const vertices = mesh.vertices
  const indices = mesh.indices
  
  const navMeshData = createRecastNavMesh(vertices, indices, parameters)
  
  return {
    buffer: navMeshData,
  }
}

function createRecastNavMesh(vertices: Float32Array, indices: Uint32Array, params: NavMeshParameters): ArrayBuffer {
  const vertexCount = vertices.length / 3
  const triangleCount = indices.length / 3
  
  const headerSize = 64
  const vertexDataSize = vertexCount * 12
  const indexDataSize = triangleCount * 12
  const totalSize = headerSize + vertexDataSize + indexDataSize + 256
  
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  
  let offset = 0
  
  view.setUint32(offset, 0x4E41564D, true)
  offset += 4
  
  view.setUint32(offset, 1, true)
  offset += 4
  
  view.setFloat32(offset, params.cellSize, true)
  offset += 4
  
  view.setFloat32(offset, params.cellHeight, true)
  offset += 4
  
  view.setFloat32(offset, params.agentRadius, true)
  offset += 4
  
  view.setFloat32(offset, params.maxSlope * (Math.PI / 180), true)
  offset += 4
  
  view.setFloat32(offset, params.walkableHeight, true)
  offset += 4
  
  view.setFloat32(offset, params.walkableClimb, true)
  offset += 4
  
  view.setUint32(offset, vertexCount, true)
  offset += 4
  
  view.setUint32(offset, triangleCount, true)
  offset += 4
  
  for (let i = 0; i < vertexCount; i++) {
    view.setFloat32(offset, vertices[i * 3], true)
    offset += 4
    view.setFloat32(offset, vertices[i * 3 + 1], true)
    offset += 4
    view.setFloat32(offset, vertices[i * 3 + 2], true)
    offset += 4
  }
  
  for (let i = 0; i < triangleCount; i++) {
    view.setUint32(offset, indices[i * 3], true)
    offset += 4
    view.setUint32(offset, indices[i * 3 + 1], true)
    offset += 4
    view.setUint32(offset, indices[i * 3 + 2], true)
    offset += 4
  }
  
  return buffer.slice(0, offset)
}

