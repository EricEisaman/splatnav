declare module 'recast-detour' {
  interface RecastModule {
    [key: string]: unknown
  }

  const recast: () => Promise<RecastModule>
  export default recast
}

