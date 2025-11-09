import type { NavMeshParameters } from '@/types'
import type { NavMeshData } from './gsNavMeshPlugin'
import { GaussianSplatNavMesh } from './gsNavMeshPlugin'
import type { Scene } from '@babylonjs/core'
import { Mesh as BabylonMesh } from '@babylonjs/core'
import type { Mesh } from '@/types'

export type { NavMeshData }

export async function generateNavMesh(
  mesh: Mesh | BabylonMesh,
  parameters: NavMeshParameters,
  scene: Scene,
  workerURL?: string
): Promise<NavMeshData> {
  if (mesh instanceof BabylonMesh) {
    const navManager = new GaussianSplatNavMesh(scene, parameters, workerURL)
    await navManager.initializePluginAsync()
    await navManager.generateNavMeshAsync(mesh)
    const navMeshData = navManager.getNavMeshData()
    if (!navMeshData) {
      throw new Error('Failed to generate navigation mesh data')
    }
    navManager.dispose()
    return navMeshData
  } else {
    throw new Error('Legacy Mesh format not supported. Use Babylon.js Mesh instead.')
  }
}

