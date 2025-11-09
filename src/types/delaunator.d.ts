declare module 'delaunator' {
  interface DelaunatorResult {
    triangles: Uint32Array
    halfedges: Int32Array
    hull: Uint32Array
  }

  class Delaunator {
    triangles: Uint32Array
    halfedges: Int32Array
    hull: Uint32Array

    static from(points: number[] | Float32Array | Float64Array): Delaunator
  }

  export default Delaunator
}

