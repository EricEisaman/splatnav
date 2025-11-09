import type { GaussianSplattingMesh, Scene } from '@babylonjs/core'
import { Vector3 } from '@babylonjs/core'
import type { NavigablePointCloud } from '@/types'

function isFloat32Array(value: unknown): value is Float32Array {
  return value instanceof Float32Array
}

function hasPositionsProperty(obj: unknown): obj is { positions?: Float32Array } {
  return typeof obj === 'object' && obj !== null && 'positions' in obj
}

export function extractAndFilterGroundPointCloud(
  gsMesh: GaussianSplattingMesh,
  _scene: Scene,
  groundHeightTolerance: number = 0.1,
  downsampleRatio: number = 0.01
): NavigablePointCloud {
  if (!gsMesh.splatCount || gsMesh.splatCount === 0) {
    throw new Error('GaussianSplattingMesh has no splats')
  }

  const splatCount = gsMesh.splatCount

  let rawPositions: Float32Array | null = null

  const meshObj = gsMesh
  const splatDataDesc = Object.getOwnPropertyDescriptor(meshObj, 'splatData')
  const splatDataValue = splatDataDesc?.value
  if (hasPositionsProperty(splatDataValue)) {
    const positions = splatDataValue.positions
    if (isFloat32Array(positions)) {
      rawPositions = positions
    }
  }
  
  if (!rawPositions) {
    const _splatDataDesc = Object.getOwnPropertyDescriptor(meshObj, '_splatData')
    const _splatDataValue = _splatDataDesc?.value
    if (hasPositionsProperty(_splatDataValue)) {
      const positions = _splatDataValue.positions
      if (isFloat32Array(positions)) {
        rawPositions = positions
      }
    }
  }
  
  if (!rawPositions) {
    const _splatPositionsDesc = Object.getOwnPropertyDescriptor(meshObj, '_splatPositions')
    const _splatPositionsValue = _splatPositionsDesc?.value
    if (isFloat32Array(_splatPositionsValue)) {
      rawPositions = _splatPositionsValue
    }
  }
  
  if (!rawPositions) {
    const _positionsDesc = Object.getOwnPropertyDescriptor(meshObj, '_positions')
    const _positionsValue = _positionsDesc?.value
    if (isFloat32Array(_positionsValue)) {
      rawPositions = _positionsValue
    }
  }

  if (!rawPositions || rawPositions.length < splatCount * 3) {
    throw new Error('Could not extract splat positions from GaussianSplattingMesh')
  }

  const worldMatrix = gsMesh.getWorldMatrix()
  const worldPositions = new Float32Array(splatCount * 3)

  for (let i = 0; i < splatCount; i++) {
    const localX = rawPositions[i * 3]
    const localY = rawPositions[i * 3 + 1]
    const localZ = rawPositions[i * 3 + 2]

    Vector3.TransformCoordinatesToRef(
      new Vector3(localX, localY, localZ),
      worldMatrix,
      Vector3.FromArray(worldPositions, i * 3)
    )
  }

  let minWorldY = Number.POSITIVE_INFINITY
  for (let i = 0; i < splatCount; i++) {
    const y = worldPositions[i * 3 + 1]
    if (y < minWorldY) {
      minWorldY = y
    }
  }

  if (minWorldY === Number.POSITIVE_INFINITY) {
    throw new Error('Could not determine minimum Y coordinate')
  }

  const groundThreshold = minWorldY + groundHeightTolerance
  const step = Math.max(1, Math.floor(1 / downsampleRatio))
  const filteredPositions: number[] = []
  let currentSplatCount = 0

  for (let i = 0; i < splatCount; i += step) {
    const y = worldPositions[i * 3 + 1]
    if (y <= groundThreshold) {
      filteredPositions.push(
        worldPositions[i * 3],
        worldPositions[i * 3 + 1],
        worldPositions[i * 3 + 2]
      )
      currentSplatCount++
    }
  }

  if (currentSplatCount === 0) {
    throw new Error('No ground points found after filtering')
  }

  return {
    positions: new Float32Array(filteredPositions),
    count: currentSplatCount,
  }
}

