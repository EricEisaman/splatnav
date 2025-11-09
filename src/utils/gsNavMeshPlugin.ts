import type { Scene, Mesh, Vector3 } from '@babylonjs/core'
import { RecastJSPlugin } from '@babylonjs/core/Navigation/Plugins/recastJSPlugin'
import type { GaussianSplattingMesh } from '@babylonjs/core'
import type { NavMeshParameters } from '@/types'
import { extractAndFilterGroundPointCloud } from './gsDataExtractor'
import { generateNavigableMesh } from './gsMeshGenerator'

export interface NavMeshData {
  buffer: ArrayBuffer
}

interface NavMeshParametersInternal {
  cs: number
  ch: number
  walkableSlopeAngle: number
  walkableHeight: number
  walkableClimb: number
  walkableRadius: number
  maxEdgeLen: number
  maxSimplificationError: number
  minRegionArea: number
  mergeRegionArea: number
  maxVertsPerPoly: number
  detailSampleDist: number
  detailSampleMaxError: number
  tileSize: number
}

export class GaussianSplatNavMesh {
  private navigationPlugin: RecastJSPlugin | null = null
  private navMeshParameters: NavMeshParametersInternal
  private workerURL: string | null = null

  constructor(_scene: Scene, navParams: NavMeshParameters, workerURL?: string) {
    this.workerURL = workerURL || null

    this.navMeshParameters = {
      cs: navParams.cellSize,
      ch: navParams.cellHeight,
      walkableSlopeAngle: navParams.maxSlope,
      walkableHeight: navParams.walkableHeight,
      walkableClimb: navParams.walkableClimb,
      walkableRadius: navParams.agentRadius,
      maxEdgeLen: 12.0,
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6.0,
      detailSampleMaxError: 1.0,
      tileSize: 16,
    }
  }

  async initializePluginAsync(): Promise<boolean> {
    try {
      const recastModule = await import('recast-detour')
      const Recast = recastModule.default || recastModule
      const recast = await Recast()

      this.navigationPlugin = new RecastJSPlugin(recast)

      if (this.workerURL) {
        this.navigationPlugin.setWorkerURL(this.workerURL)
      }

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to initialize RecastJSPlugin: ${errorMessage}`)
    }
  }

  async generateNavMeshAsync(sourceMesh: Mesh): Promise<void> {
    if (!this.navigationPlugin) {
      throw new Error('RecastJSPlugin not initialized. Call initializePluginAsync() first.')
    }

    try {
      this.navigationPlugin.createNavMesh([sourceMesh], this.navMeshParameters)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to generate navigation mesh: ${errorMessage}`)
    }
  }

  getNavMeshData(): NavMeshData | null {
    if (!this.navigationPlugin) {
      return null
    }

    try {
      const pluginObj = this.navigationPlugin
      const getNavMeshDataDesc = Object.getOwnPropertyDescriptor(pluginObj, 'getNavMeshData')
      const getNavMeshDataFunc = getNavMeshDataDesc?.value
      if (typeof getNavMeshDataFunc === 'function') {
        const navMeshDataResult = getNavMeshDataFunc()
        if (navMeshDataResult instanceof ArrayBuffer) {
          return {
            buffer: navMeshDataResult,
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  computePath(startPoint: Vector3, endPoint: Vector3): Vector3[] {
    if (!this.navigationPlugin) {
      return []
    }

    try {
      return this.navigationPlugin.computePath(startPoint, endPoint)
    } catch (error) {
      return []
    }
  }

  dispose(): void {
    if (this.navigationPlugin) {
      this.navigationPlugin.dispose()
      this.navigationPlugin = null
    }
  }
}

export async function createGaussianSplatNavMesh(
  gsMesh: GaussianSplattingMesh,
  scene: Scene,
  navParams: NavMeshParameters,
  workerURL?: string
): Promise<GaussianSplatNavMesh> {
  const pointCloud = extractAndFilterGroundPointCloud(gsMesh, scene)
  const sourceMesh = generateNavigableMesh(pointCloud, scene)
  const navManager = new GaussianSplatNavMesh(scene, navParams, workerURL)

  await navManager.initializePluginAsync()
  await navManager.generateNavMeshAsync(sourceMesh)

  return navManager
}

