export enum SplatFileFormat {
  SPZ = 'spz',
  PLY = 'ply',
  SPLAT = 'splat',
}

export interface Point3D {
  x: number
  y: number
  z: number
}

import type { GaussianSplattingMesh } from '@babylonjs/core'

export interface ColorRGB {
  r: number
  g: number
  b: number
}

export interface PointCloud {
  vertices: Float32Array
  colors: Float32Array
  normals: Float32Array | null
  count: number
  gaussianMesh?: GaussianSplattingMesh
  file?: File
  fileFormat?: SplatFileFormat
}

export interface Mesh {
  vertices: Float32Array
  indices: Uint32Array
  normals: Float32Array
  vertexCount: number
  indexCount: number
}

export interface NavMeshParameters {
  agentRadius: number
  maxSlope: number
  walkableHeight: number
  walkableClimb: number
  cellSize: number
  cellHeight: number
}

export interface ProcessingStatus {
  stage: 'idle' | 'parsing' | 'converting' | 'generating' | 'complete' | 'error'
  message: string
  progress: number
}

