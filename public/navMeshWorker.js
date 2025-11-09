self.onmessage = async function(event) {
  const { type, data } = event.data

  if (type === 'generateNavMesh') {
    try {
      const Recast = await import('recast-detour')
      const recastModule = Recast.default || Recast
      const recast = await recastModule()

      const { RecastJSPlugin } = await import('@babylonjs/core/Navigation/Plugins/recastJSPlugin')
      const navigationPlugin = new RecastJSPlugin(recast)

      const { meshes, parameters } = data
      navigationPlugin.createNavMesh(meshes, parameters)

      const navMeshData = navigationPlugin.getNavMeshData?.()

      self.postMessage({
        type: 'navMeshGenerated',
        navMeshData: navMeshData
      })
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error in worker'
      })
    }
  }
}

