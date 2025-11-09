import type { PointCloud, Mesh, NavigablePointCloud } from '@/types'
import { generateNavigableMesh } from './gsMeshGenerator'
import type { Scene } from '@babylonjs/core'

function pointCloudToNavigablePointCloud(pointCloud: PointCloud): NavigablePointCloud {
  return {
    positions: pointCloud.vertices,
    count: pointCloud.count,
  }
}

export function convertPointCloudToMesh(pointCloud: PointCloud, scene: Scene): Mesh {
  if (pointCloud.count < 3) {
    throw new Error('Point cloud must have at least 3 points')
  }

  const navigablePointCloud = pointCloudToNavigablePointCloud(pointCloud)
  const babylonMesh = generateNavigableMesh(navigablePointCloud, scene, 'PointCloud_Mesh')

  const vertexData = babylonMesh.getVerticesData('position')
  const indices = babylonMesh.getIndices()
  const normals = babylonMesh.getVerticesData('normal')

  if (!vertexData || !indices) {
    throw new Error('Failed to extract mesh data from Babylon mesh')
  }

  const verticesArray = vertexData instanceof Float32Array ? vertexData : new Float32Array(vertexData)
  const indicesArray = indices instanceof Uint32Array ? indices : new Uint32Array(indices)
  const normalsArray = normals ? (normals instanceof Float32Array ? normals : new Float32Array(normals)) : new Float32Array(verticesArray.length)

  return {
    vertices: verticesArray,
    indices: indicesArray,
    normals: normalsArray,
    vertexCount: verticesArray.length / 3,
    indexCount: indicesArray.length,
  }
}


