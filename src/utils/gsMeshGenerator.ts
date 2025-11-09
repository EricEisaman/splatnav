import Delaunator from 'delaunator'
import type { NavigablePointCloud } from '@/types'
import type { Scene, Mesh } from '@babylonjs/core'
import { Mesh as BabylonMesh, VertexData as BabylonVertexData } from '@babylonjs/core'

interface ValidatedPoint {
  x: number
  z: number
  originalIndex: number
  y: number
}

interface ValidationResult {
  validatedPoints: ValidatedPoint[]
  originalIndices: number[]
  boundingBox: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
    width: number
    height: number
  }
}

const POINT_TOLERANCE = 1e-6
const MAX_POINTS_FOR_TRIANGULATION = 100000
const NEAR_COLLINEAR_TOLERANCE = 1e-3
const MIN_BOUNDING_BOX_AREA = 1e-6
const MIN_POINT_SPREAD_RATIO = 0.001

type TriangulationResult =
  | { type: 'success'; triangles: Uint32Array; pointCount: number }
  | { type: 'empty'; pointCount: number; reason: string }
  | { type: 'error'; message: string; pointCount: number }

type DownsampleStrategy =
  | { type: 'none'; pointCount: number }
  | { type: 'grid'; pointCount: number; gridSize: number; originalCount: number }
  | { type: 'progressive'; pointCount: number; ratio: number; originalCount: number; attempt: number }

type CoordinateValidationResult =
  | { type: 'valid'; validPoints: ValidatedPoint[] }
  | { type: 'invalid'; reason: string; invalidCount: number; validPoints: ValidatedPoint[] }

interface DownsampledPoints {
  points: ValidatedPoint[]
  originalIndices: number[]
  strategy: DownsampleStrategy
}

interface CoordinateRange {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  spreadX: number
  spreadZ: number
  centerX: number
  centerZ: number
}

interface NormalizedCoordinates {
  coords: Float64Array
  transform: {
    offsetX: number
    offsetZ: number
    scaleX: number
    scaleZ: number
  }
}

function hashPoint(x: number, z: number, tolerance: number): string {
  const gridX = Math.floor(x / tolerance)
  const gridZ = Math.floor(z / tolerance)
  return `${gridX},${gridZ}`
}

function validateCoordinates(points: ValidatedPoint[]): CoordinateValidationResult {
  const validPoints: ValidatedPoint[] = []
  let invalidCount = 0
  let hasNaN = false
  let hasInfinity = false

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const x = point.x
    const z = point.z

    if (Number.isNaN(x) || Number.isNaN(z)) {
      hasNaN = true
      invalidCount++
      continue
    }

    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      hasInfinity = true
      invalidCount++
      continue
    }

    validPoints.push(point)
  }

  if (invalidCount > 0) {
    let reason = ''
    if (hasNaN && hasInfinity) {
      reason = 'NaN and Infinity values found'
    } else if (hasNaN) {
      reason = 'NaN values found'
    } else {
      reason = 'Infinity values found'
    }

    return {
      type: 'invalid',
      reason,
      invalidCount,
      validPoints,
    }
  }

  return {
    type: 'valid',
    validPoints: points,
  }
}

function computeCoordinateRange(points: ValidatedPoint[]): CoordinateRange {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.z < minZ) minZ = point.z
    if (point.z > maxZ) maxZ = point.z
  }

  const spreadX = maxX - minX
  const spreadZ = maxZ - minZ
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    spreadX,
    spreadZ,
    centerX,
    centerZ,
  }
}

function normalizeCoordinates(
  points: ValidatedPoint[],
  range: CoordinateRange
): NormalizedCoordinates {
  const coords = new Float64Array(points.length * 2)
  const maxSpread = Math.max(range.spreadX, range.spreadZ)
  const minSpread = Math.min(range.spreadX, range.spreadZ)

  let scale = 1.0
  if (maxSpread > 1e6) {
    scale = 1e-6
  } else if (maxSpread < 1e-3 && maxSpread > 0) {
    scale = 1e3
  } else if (maxSpread === 0) {
    scale = 1.0
  }

  const aspectRatio = maxSpread > 0 ? minSpread / maxSpread : 1
  if (aspectRatio < 1e-6 && maxSpread > 0) {
    const adjustedScale = scale * (1 + aspectRatio)
    scale = adjustedScale
  }

  const epsilon = 1e-10
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    let normalizedX = (point.x - range.centerX) * scale
    let normalizedZ = (point.z - range.centerZ) * scale

    if (Math.abs(normalizedX) < epsilon) {
      normalizedX = 0
    }
    if (Math.abs(normalizedZ) < epsilon) {
      normalizedZ = 0
    }

    if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedZ)) {
      normalizedX = 0
      normalizedZ = 0
    }

    coords[i * 2] = normalizedX
    coords[i * 2 + 1] = normalizedZ
  }

  const normalizedRange = computeCoordinateRange(
    Array.from({ length: points.length }, (_, i) => ({
      x: coords[i * 2],
      z: coords[i * 2 + 1],
      originalIndex: i,
      y: 0,
    }))
  )

  const normalizedSpread = Math.max(normalizedRange.spreadX, normalizedRange.spreadZ)
  if (normalizedSpread < POINT_TOLERANCE && normalizedSpread > 0) {
    const adjustmentScale = POINT_TOLERANCE / normalizedSpread
    for (let i = 0; i < points.length; i++) {
      coords[i * 2] *= adjustmentScale
      coords[i * 2 + 1] *= adjustmentScale
    }
    scale *= adjustmentScale
  }

  return {
    coords,
    transform: {
      offsetX: range.centerX,
      offsetZ: range.centerZ,
      scaleX: scale,
      scaleZ: scale,
    },
  }
}

function validateAndDeduplicatePoints(
  positions: Float32Array,
  count: number,
  originalYCoords: number[]
): ValidationResult {
  const pointMap = new Map<string, ValidatedPoint>()
  const originalIndices: number[] = []
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const z = positions[i * 3 + 2]
    const y = originalYCoords[i]

    const pointKey = hashPoint(x, z, POINT_TOLERANCE)

    if (!pointMap.has(pointKey)) {
      const validatedPoint: ValidatedPoint = {
        x,
        z,
        originalIndex: i,
        y,
      }
      pointMap.set(pointKey, validatedPoint)
      originalIndices.push(i)

      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }

  const validatedPoints: ValidatedPoint[] = Array.from(pointMap.values())

  const boundingBox = {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    height: maxZ - minZ,
  }

  return {
    validatedPoints,
    originalIndices,
    boundingBox,
  }
}

function checkCollinearity(points: ValidatedPoint[]): boolean {
  if (points.length < 3) {
    return false
  }

  const firstPoint = points[0]
  let allSameX = true
  let allSameZ = true

  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i].x - firstPoint.x)
    const dz = Math.abs(points[i].z - firstPoint.z)

    if (dx > POINT_TOLERANCE) {
      allSameX = false
    }
    if (dz > POINT_TOLERANCE) {
      allSameZ = false
    }
  }

  if (allSameX || allSameZ) {
    return true
  }

  const coordRange = computeCoordinateRange(points)
  const maxSpread = Math.max(coordRange.spreadX, coordRange.spreadZ)
  const tolerance = maxSpread * NEAR_COLLINEAR_TOLERANCE

  if (tolerance < POINT_TOLERANCE) {
    return false
  }

  let nearCollinearCount = 0
  const threshold = points.length * 0.9

  for (let i = 0; i < points.length - 2; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2]

    const dx1 = p2.x - p1.x
    const dz1 = p2.z - p1.z
    const dx2 = p3.x - p2.x
    const dz2 = p3.z - p2.z

    const crossProduct = dx1 * dz2 - dz1 * dx2
    const area = Math.abs(crossProduct) / 2

    if (area < tolerance * tolerance) {
      nearCollinearCount++
    }
  }

  return nearCollinearCount >= threshold
}

type GeometryValidationResult =
  | { type: 'valid' }
  | { type: 'invalid'; reason: string; details: string }

function validatePointSetGeometry(
  points: ValidatedPoint[],
  boundingBox: ValidationResult['boundingBox']
): GeometryValidationResult {
  if (points.length < 3) {
    return {
      type: 'invalid',
      reason: 'Insufficient points',
      details: `Only ${points.length} points (minimum 3 required)`,
    }
  }

  const area = boundingBox.width * boundingBox.height
  if (area < MIN_BOUNDING_BOX_AREA) {
    return {
      type: 'invalid',
      reason: 'Bounding box area too small',
      details: `Area: ${area.toFixed(10)} (minimum: ${MIN_BOUNDING_BOX_AREA})`,
    }
  }

  const maxSpread = Math.max(boundingBox.width, boundingBox.height)
  const minSpread = Math.min(boundingBox.width, boundingBox.height)
  const spreadRatio = minSpread / maxSpread

  if (spreadRatio < MIN_POINT_SPREAD_RATIO && maxSpread > 0) {
    return {
      type: 'invalid',
      reason: 'Point spread too narrow',
      details: `Spread ratio: ${spreadRatio.toFixed(6)} (minimum: ${MIN_POINT_SPREAD_RATIO})`,
    }
  }

  let uniqueCount = 0
  const pointSet = new Set<string>()
  for (let i = 0; i < points.length; i++) {
    const key = hashPoint(points[i].x, points[i].z, POINT_TOLERANCE)
    if (!pointSet.has(key)) {
      pointSet.add(key)
      uniqueCount++
    }
  }

  const diversityRatio = uniqueCount / points.length
  if (diversityRatio < 0.5 && points.length > 10) {
    return {
      type: 'invalid',
      reason: 'Low geometric diversity',
      details: `Unique points: ${uniqueCount}/${points.length} (${(diversityRatio * 100).toFixed(1)}%)`,
    }
  }

  return { type: 'valid' }
}

function applyCollinearityOffset(
  points: ValidatedPoint[],
  boundingBox: ValidationResult['boundingBox']
): ValidatedPoint[] {
  const offsetX = boundingBox.width * 0.0001
  const offsetZ = boundingBox.height * 0.0001

  const isHorizontalLine = Math.abs(boundingBox.width) < POINT_TOLERANCE
  const isVerticalLine = Math.abs(boundingBox.height) < POINT_TOLERANCE

  return points.map((point, index) => {
    if (isHorizontalLine) {
      return {
        ...point,
        x: point.x + offsetX * (index % 2 === 0 ? 1 : -1),
      }
    }
    if (isVerticalLine) {
      return {
        ...point,
        z: point.z + offsetZ * (index % 2 === 0 ? 1 : -1),
      }
    }
    return {
      ...point,
      x: point.x + offsetX * (index % 2 === 0 ? 1 : -1),
      z: point.z + offsetZ * (index % 3 === 0 ? 1 : -1),
    }
  })
}

function downsamplePoints(
  points: ValidatedPoint[],
  boundingBox: ValidationResult['boundingBox'],
  targetCount: number
): DownsampledPoints {
  if (points.length <= targetCount) {
    return {
      points,
      originalIndices: points.map((p) => p.originalIndex),
      strategy: { type: 'none', pointCount: points.length },
    }
  }

  const maxSpread = Math.max(boundingBox.width, boundingBox.height)
  const minSpread = Math.min(boundingBox.width, boundingBox.height)
  const aspectRatio = maxSpread > 0 ? minSpread / maxSpread : 1

  const adjustedTargetCount = Math.max(3, Math.floor(targetCount * (1 + aspectRatio * 0.5)))
  const gridSize = Math.ceil(Math.sqrt(adjustedTargetCount))
  const cellWidth = boundingBox.width > 0 ? boundingBox.width / gridSize : 1
  const cellHeight = boundingBox.height > 0 ? boundingBox.height / gridSize : 1

  const gridMap = new Map<string, ValidatedPoint[]>()

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const cellX = Math.floor((point.x - boundingBox.minX) / cellWidth)
    const cellZ = Math.floor((point.z - boundingBox.minZ) / cellHeight)
    const cellKey = `${cellX},${cellZ}`

    const cellPoints = gridMap.get(cellKey)
    if (cellPoints) {
      cellPoints.push(point)
    } else {
      gridMap.set(cellKey, [point])
    }
  }

  const downsampledPoints: ValidatedPoint[] = []
  const originalIndices: number[] = []
  const usedPoints = new Set<string>()

  for (const [, cellPoints] of gridMap.entries()) {
    if (cellPoints.length > 0) {
      const pointKey = hashPoint(cellPoints[0].x, cellPoints[0].z, POINT_TOLERANCE)
      if (!usedPoints.has(pointKey)) {
        const selectedPoint = cellPoints[Math.floor(cellPoints.length / 2)]
        downsampledPoints.push(selectedPoint)
        originalIndices.push(selectedPoint.originalIndex)
        usedPoints.add(pointKey)
      }
    }
  }

  const result = {
    points: downsampledPoints,
    originalIndices,
    strategy: {
      type: 'grid' as const,
      pointCount: downsampledPoints.length,
      gridSize,
      originalCount: points.length,
    },
  }

  const geometryValidation = validatePointSetGeometry(result.points, boundingBox)
  if (geometryValidation.type === 'invalid' && result.points.length >= 3) {
    const minPointsPerCell = Math.max(1, Math.floor(points.length / (gridSize * gridSize)))
    if (minPointsPerCell > 1) {
      const enhancedPoints: ValidatedPoint[] = []
      const enhancedIndices: number[] = []

      for (const [, cellPoints] of gridMap.entries()) {
        if (cellPoints.length > 0) {
          const sampleCount = Math.min(minPointsPerCell, cellPoints.length)
          const step = Math.max(1, Math.floor(cellPoints.length / sampleCount))

          for (let j = 0; j < cellPoints.length; j += step) {
            const point = cellPoints[j]
            const pointKey = hashPoint(point.x, point.z, POINT_TOLERANCE)
            if (!usedPoints.has(pointKey)) {
              enhancedPoints.push(point)
              enhancedIndices.push(point.originalIndex)
              usedPoints.add(pointKey)
            }
          }
        }
      }

      if (enhancedPoints.length >= 3) {
        return {
          points: enhancedPoints,
          originalIndices: enhancedIndices,
          strategy: {
            type: 'grid' as const,
            pointCount: enhancedPoints.length,
            gridSize,
            originalCount: points.length,
          },
        }
      }
    }
  }

  return result
}

function ensureNonDegeneratePoints(
  points: ValidatedPoint[],
  boundingBox: ValidationResult['boundingBox']
): ValidatedPoint[] {
  if (points.length < 3) {
    return points
  }

  const isCollinear = checkCollinearity(points)
  if (!isCollinear) {
    const geometryValidation = validatePointSetGeometry(points, boundingBox)
    if (geometryValidation.type === 'valid') {
      return points
    }
  }

  const maxSpread = Math.max(boundingBox.width, boundingBox.height)
  const perturbationScale = maxSpread * 0.0001
  const minPerturbation = POINT_TOLERANCE * 10

  const perturbedPoints: ValidatedPoint[] = []
  const usedPositions = new Map<string, number>()

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    let x = point.x
    let z = point.z
    let attempts = 0
    const maxAttempts = 10

    while (attempts < maxAttempts) {
      const key = hashPoint(x, z, POINT_TOLERANCE)
      const existingCount = usedPositions.get(key) || 0

      if (existingCount === 0) {
        usedPositions.set(key, 1)
        break
      }

      const angle = (i * 137.508 + attempts * 42.0) * (Math.PI / 180.0)
      const radius = perturbationScale * (1 + attempts * 0.1)
      x = point.x + Math.cos(angle) * radius
      z = point.z + Math.sin(angle) * radius
      attempts++
    }

    if (attempts >= maxAttempts) {
      const angle = (i * 137.508) * (Math.PI / 180.0)
      const radius = Math.max(perturbationScale, minPerturbation)
      x = point.x + Math.cos(angle) * radius
      z = point.z + Math.sin(angle) * radius
    }

    perturbedPoints.push({
      ...point,
      x,
      z,
    })
  }

  const perturbedBoundingBox = {
    ...boundingBox,
    minX: Math.min(...perturbedPoints.map((p) => p.x)),
    maxX: Math.max(...perturbedPoints.map((p) => p.x)),
    minZ: Math.min(...perturbedPoints.map((p) => p.z)),
    maxZ: Math.max(...perturbedPoints.map((p) => p.z)),
    width: 0,
    height: 0,
  }
  perturbedBoundingBox.width = perturbedBoundingBox.maxX - perturbedBoundingBox.minX
  perturbedBoundingBox.height = perturbedBoundingBox.maxZ - perturbedBoundingBox.minZ

  const finalValidation = validatePointSetGeometry(perturbedPoints, perturbedBoundingBox)
  if (finalValidation.type === 'valid') {
    return perturbedPoints
  }

  return points
}

function downsamplePointsProgressive(
  points: ValidatedPoint[],
  boundingBox: ValidationResult['boundingBox'],
  ratios: number[],
  attempt: number
): DownsampledPoints | null {
  if (attempt >= ratios.length) {
    return null
  }

  const ratio = ratios[attempt]
  const targetCount = Math.max(3, Math.floor(points.length * ratio))
  const downsampled = downsamplePoints(points, boundingBox, targetCount)

  if (downsampled.strategy.type === 'grid') {
    return {
      ...downsampled,
      strategy: {
        type: 'progressive',
        pointCount: downsampled.strategy.pointCount,
        ratio,
        originalCount: downsampled.strategy.originalCount,
        attempt,
      },
    }
  }

  return downsampled
}

function createFallbackTriangulation(
  points: ValidatedPoint[],
  boundingBox: ValidationResult['boundingBox']
): TriangulationResult {
  if (points.length < 3) {
    return {
      type: 'error',
      message: 'Insufficient points for fallback triangulation',
      pointCount: points.length,
    }
  }

  const corners: ValidatedPoint[] = [
    { x: boundingBox.minX, z: boundingBox.minZ, originalIndex: -1, y: 0 },
    { x: boundingBox.maxX, z: boundingBox.minZ, originalIndex: -1, y: 0 },
    { x: boundingBox.maxX, z: boundingBox.maxZ, originalIndex: -1, y: 0 },
    { x: boundingBox.minX, z: boundingBox.maxZ, originalIndex: -1, y: 0 },
  ]

  const combinedPoints = [...points, ...corners]
  const coordRange = computeCoordinateRange(combinedPoints)
  const normalized = normalizeCoordinates(combinedPoints, coordRange)

  let delaunayResult: Delaunator | null = null
  try {
    delaunayResult = Delaunator.from(normalized.coords)
  } catch {
    return {
      type: 'error',
      message: 'Fallback triangulation failed to create Delaunay triangulation',
      pointCount: combinedPoints.length,
    }
  }

  const validation = validateDelaunatorResult(delaunayResult, combinedPoints.length)
  if (validation.type === 'success') {
    const filteredTriangles: number[] = []
    const pointCount = points.length

    for (let i = 0; i < validation.triangles.length; i += 3) {
      const i0 = validation.triangles[i]
      const i1 = validation.triangles[i + 1]
      const i2 = validation.triangles[i + 2]

      if (i0 < pointCount && i1 < pointCount && i2 < pointCount) {
        filteredTriangles.push(i0, i1, i2)
      }
    }

    if (filteredTriangles.length >= 3) {
      return {
        type: 'success',
        triangles: new Uint32Array(filteredTriangles),
        pointCount: points.length,
      }
    }
  }

  return {
    type: 'error',
    message: 'Fallback triangulation produced no valid triangles',
    pointCount: points.length,
  }
}

function validateDelaunatorResult(
  result: Delaunator,
  pointCount: number
): TriangulationResult {
  const trianglesDesc = Object.getOwnPropertyDescriptor(result, 'triangles')
  const trianglesValue = trianglesDesc?.value

  if (!trianglesValue) {
    return {
      type: 'empty',
      pointCount,
      reason: 'triangles property is undefined or null',
    }
  }

  if (!(trianglesValue instanceof Uint32Array)) {
    return {
      type: 'error',
      message: `triangles is not a Uint32Array, got ${typeof trianglesValue}`,
      pointCount,
    }
  }

  const triangles = trianglesValue
  const halfedges = result.halfedges

  if (triangles.length === 0) {
    return {
      type: 'empty',
      pointCount,
      reason: 'triangles array length is zero',
    }
  }

  if (triangles.length % 3 !== 0) {
    return {
      type: 'error',
      message: `Invalid triangles array length: ${triangles.length} (must be multiple of 3)`,
      pointCount,
    }
  }

  const triangleCount = triangles.length / 3
  if (triangleCount === 0) {
    return {
      type: 'empty',
      pointCount,
      reason: 'triangle count is zero',
    }
  }

  for (let i = 0; i < triangles.length; i++) {
    const index = triangles[i]
    if (index >= pointCount) {
      return {
        type: 'error',
        message: `Triangle index ${index} at position ${i} exceeds point count ${pointCount}`,
        pointCount,
      }
    }
  }

  if (halfedges && halfedges.length !== triangles.length) {
    return {
      type: 'error',
      message: `Halfedges length ${halfedges.length} does not match triangles length ${triangles.length}`,
      pointCount,
    }
  }

  return {
    type: 'success',
    triangles,
    pointCount,
  }
}

export function generateNavigableMesh(
  pointCloud: NavigablePointCloud,
  scene: Scene,
  name: string = 'GS_NavMesh_Source'
): Mesh {
  const { positions, count } = pointCloud

  if (count < 3) {
    throw new Error(
      `Point cloud must have at least 3 points for triangulation. Received ${count} points.`
    )
  }

  const originalYCoords: number[] = []
  for (let i = 0; i < count; i++) {
    const y = positions[i * 3 + 1]
    originalYCoords.push(y)
  }

  let validationResult = validateAndDeduplicatePoints(positions, count, originalYCoords)
  const initialPointCount = validationResult.validatedPoints.length

  if (initialPointCount < 3) {
    throw new Error(
      `After deduplication, only ${initialPointCount} unique points remain (minimum 3 required). ` +
      `Original point count: ${count}. ` +
      `Bounding box: width=${validationResult.boundingBox.width.toFixed(6)}, ` +
      `height=${validationResult.boundingBox.height.toFixed(6)}. ` +
      `Consider adjusting groundHeightTolerance or downsampleRatio parameters.`
    )
  }

  let isCollinear = checkCollinearity(validationResult.validatedPoints)
  if (isCollinear) {
    validationResult = {
      ...validationResult,
      validatedPoints: applyCollinearityOffset(
        validationResult.validatedPoints,
        validationResult.boundingBox
      ),
    }
    isCollinear = checkCollinearity(validationResult.validatedPoints)
  }

  if (isCollinear) {
    throw new Error(
      `Points are collinear and could not be corrected. ` +
      `Unique points: ${initialPointCount}. ` +
      `Bounding box: width=${validationResult.boundingBox.width.toFixed(6)}, ` +
      `height=${validationResult.boundingBox.height.toFixed(6)}. ` +
      `All points share the same X or Z coordinate. ` +
      `Consider adjusting groundHeightTolerance or downsampleRatio parameters.`
    )
  }

  let currentPoints = validationResult.validatedPoints
  let currentStrategy: DownsampleStrategy = { type: 'none', pointCount: currentPoints.length }
  const attemptedStrategies: DownsampleStrategy[] = []

  const initialGeometryValidation = validatePointSetGeometry(currentPoints, validationResult.boundingBox)
  if (initialGeometryValidation.type === 'invalid') {
    currentPoints = ensureNonDegeneratePoints(currentPoints, validationResult.boundingBox)
    const postPerturbationValidation = validatePointSetGeometry(currentPoints, validationResult.boundingBox)
    if (postPerturbationValidation.type === 'invalid') {
      throw new Error(
        `Point set geometry validation failed: ${initialGeometryValidation.reason}. ${initialGeometryValidation.details}. ` +
        `After perturbation: ${postPerturbationValidation.reason}. ${postPerturbationValidation.details}. ` +
        `Consider adjusting groundHeightTolerance or downsampleRatio parameters.`
      )
    }
  }

  if (currentPoints.length > MAX_POINTS_FOR_TRIANGULATION) {
    const downsampled = downsamplePoints(
      currentPoints,
      validationResult.boundingBox,
      MAX_POINTS_FOR_TRIANGULATION
    )
    currentPoints = downsampled.points
    currentStrategy = downsampled.strategy
    attemptedStrategies.push(currentStrategy)

    const downsampledGeometryValidation = validatePointSetGeometry(currentPoints, validationResult.boundingBox)
    if (downsampledGeometryValidation.type === 'invalid') {
      currentPoints = ensureNonDegeneratePoints(currentPoints, validationResult.boundingBox)
    }
  }

  const progressiveRatios = [0.5, 0.25, 0.1, 0.05, 0.01]
  let triangulationResult: TriangulationResult | null = null
  let attemptCount = 0

  while (attemptCount <= progressiveRatios.length) {
    const coordValidation = validateCoordinates(currentPoints)
    if (coordValidation.type === 'invalid') {
      if (coordValidation.validPoints.length < 3) {
        triangulationResult = {
          type: 'error',
          message: `Coordinate validation failed: ${coordValidation.reason}. Only ${coordValidation.validPoints.length} valid points remain (minimum 3 required). Invalid count: ${coordValidation.invalidCount}`,
          pointCount: currentPoints.length,
        }
        attemptedStrategies.push(currentStrategy)
        attemptCount++
        if (attemptCount <= progressiveRatios.length) {
          const progressiveResult = downsamplePointsProgressive(
            validationResult.validatedPoints,
            validationResult.boundingBox,
            progressiveRatios,
            attemptCount - 1
          )
          if (progressiveResult) {
            currentPoints = progressiveResult.points
            currentStrategy = progressiveResult.strategy
            attemptedStrategies.push(currentStrategy)
            continue
          }
        }
        break
      }
      currentPoints = coordValidation.validPoints
    } else {
      currentPoints = coordValidation.validPoints
    }

    const geometryValidation = validatePointSetGeometry(currentPoints, validationResult.boundingBox)
    if (geometryValidation.type === 'invalid') {
      currentPoints = ensureNonDegeneratePoints(currentPoints, validationResult.boundingBox)
      const postPerturbationValidation = validatePointSetGeometry(currentPoints, validationResult.boundingBox)
      if (postPerturbationValidation.type === 'invalid' && attemptCount === 0) {
        attemptedStrategies.push(currentStrategy)
        attemptCount++
        if (attemptCount <= progressiveRatios.length) {
          const progressiveResult = downsamplePointsProgressive(
            validationResult.validatedPoints,
            validationResult.boundingBox,
            progressiveRatios,
            attemptCount - 1
          )
          if (progressiveResult) {
            currentPoints = progressiveResult.points
            currentStrategy = progressiveResult.strategy
            attemptedStrategies.push(currentStrategy)
            continue
          }
        }
      }
    }

    const coordRange = computeCoordinateRange(currentPoints)
    const normalized = normalizeCoordinates(currentPoints, coordRange)

    let delaunayResult: Delaunator | null = null
    let lastError: string | null = null

    interface CoordFormat {
      name: string
      coords: number[] | Float32Array | Float64Array
    }

    const formats: CoordFormat[] = [
      { name: 'Float64Array', coords: normalized.coords },
      { name: 'Float32Array', coords: new Float32Array(normalized.coords) },
      { name: 'number[]', coords: Array.from(normalized.coords) },
    ]

    for (const format of formats) {
      try {
        delaunayResult = Delaunator.from(format.coords)
        break
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        lastError = errorMessage
        continue
      }
    }

    if (!delaunayResult) {
      triangulationResult = {
        type: 'error',
        message: `Delaunator.from() failed with all coordinate formats. Last error: ${lastError || 'Unknown'}. Coordinate range: x=[${coordRange.minX.toFixed(3)}, ${coordRange.maxX.toFixed(3)}], z=[${coordRange.minZ.toFixed(3)}, ${coordRange.maxZ.toFixed(3)}], spread: x=${coordRange.spreadX.toFixed(3)}, z=${coordRange.spreadZ.toFixed(3)}`,
        pointCount: currentPoints.length,
      }
      if (attemptCount === 0) {
        attemptedStrategies.push(currentStrategy)
      }
      attemptCount++
      if (attemptCount <= progressiveRatios.length) {
        const progressiveResult = downsamplePointsProgressive(
          validationResult.validatedPoints,
          validationResult.boundingBox,
          progressiveRatios,
          attemptCount - 1
        )
        if (progressiveResult) {
          currentPoints = progressiveResult.points
          currentStrategy = progressiveResult.strategy
          continue
        }
      }
      break
    }

    triangulationResult = validateDelaunatorResult(delaunayResult, currentPoints.length)

    if (triangulationResult.type === 'success') {
      break
    }

    if (triangulationResult.type === 'empty' || triangulationResult.type === 'error') {
      if (attemptCount === 0) {
        attemptedStrategies.push(currentStrategy)
      }
      attemptCount++
      if (attemptCount <= progressiveRatios.length) {
        const progressiveResult = downsamplePointsProgressive(
          validationResult.validatedPoints,
          validationResult.boundingBox,
          progressiveRatios,
          attemptCount - 1
        )
        if (progressiveResult) {
          currentPoints = progressiveResult.points
          currentStrategy = progressiveResult.strategy
          continue
        }
      }
      break
    }
  }

  if (!triangulationResult || triangulationResult.type !== 'success') {
    const fallbackResult = createFallbackTriangulation(currentPoints, validationResult.boundingBox)
    if (fallbackResult.type === 'success') {
      triangulationResult = fallbackResult
    } else {
      const uniqueStrategies = new Map<string, DownsampleStrategy>()
      for (const strategy of attemptedStrategies) {
        let key: string
        if (strategy.type === 'none') {
          key = `none-${strategy.pointCount}`
        } else if (strategy.type === 'grid') {
          key = `grid-${strategy.originalCount}-${strategy.pointCount}-${strategy.gridSize}`
        } else {
          key = `progressive-${strategy.ratio}-${strategy.originalCount}-${strategy.pointCount}-${strategy.attempt}`
        }
        if (!uniqueStrategies.has(key)) {
          uniqueStrategies.set(key, strategy)
        }
      }

      const strategyDetails = Array.from(uniqueStrategies.values())
        .map((s) => {
          if (s.type === 'none') {
            return `none (${s.pointCount} points)`
          }
          if (s.type === 'grid') {
            return `grid (${s.originalCount} -> ${s.pointCount}, grid=${s.gridSize})`
          }
          return `progressive ratio=${s.ratio} (${s.originalCount} -> ${s.pointCount}, attempt=${s.attempt})`
        })
        .join('; ')

      const resultDetails =
        triangulationResult?.type === 'empty'
          ? `Empty result: ${triangulationResult.reason}`
          : triangulationResult?.type === 'error'
            ? `Error: ${triangulationResult.message}`
            : 'Unknown error'

      const finalCoordRange = computeCoordinateRange(currentPoints)
      const finalGeometryValidation = validatePointSetGeometry(currentPoints, validationResult.boundingBox)

      const fallbackMessage =
        fallbackResult.type === 'error' ? fallbackResult.message : fallbackResult.reason

      throw new Error(
        `Delaunay triangulation failed after ${attemptCount} attempts. ` +
        `${resultDetails}. ` +
        `Fallback triangulation also failed: ${fallbackMessage}. ` +
        `Original points: ${count}, validated: ${initialPointCount}. ` +
        `Final attempt: ${currentPoints.length} points. ` +
        `Bounding box: width=${validationResult.boundingBox.width.toFixed(6)}, ` +
        `height=${validationResult.boundingBox.height.toFixed(6)}. ` +
        `Final coordinate range: x=[${finalCoordRange.minX.toFixed(3)}, ${finalCoordRange.maxX.toFixed(3)}], z=[${finalCoordRange.minZ.toFixed(3)}, ${finalCoordRange.maxZ.toFixed(3)}], spread: x=${finalCoordRange.spreadX.toFixed(3)}, z=${finalCoordRange.spreadZ.toFixed(3)}. ` +
        `Collinear: ${isCollinear}. ` +
        `Geometry validation: ${finalGeometryValidation.type === 'invalid' ? finalGeometryValidation.reason + ' - ' + finalGeometryValidation.details : 'valid'}. ` +
        `Strategies attempted: ${strategyDetails || 'none'}. ` +
        `Suggested maximum point count: ${MAX_POINTS_FOR_TRIANGULATION}. ` +
        `Consider adjusting groundHeightTolerance or downsampleRatio parameters.`
      )
    }
  }

  const triangles = triangulationResult.triangles
  validationResult = {
    ...validationResult,
    validatedPoints: currentPoints,
  }

  const validatedPositions = new Float32Array(validationResult.validatedPoints.length * 3)
  for (let i = 0; i < validationResult.validatedPoints.length; i++) {
    const point = validationResult.validatedPoints[i]
    validatedPositions[i * 3] = point.x
    validatedPositions[i * 3 + 1] = point.y
    validatedPositions[i * 3 + 2] = point.z
  }

  const indices = new Uint32Array(triangles.length)
  for (let i = 0; i < triangles.length; i++) {
    indices[i] = triangles[i]
  }

  const customMesh = new BabylonMesh(name, scene)
  const vertexData = new BabylonVertexData()

  vertexData.positions = validatedPositions
  vertexData.indices = indices

  const normals = new Float32Array(validatedPositions.length)
  BabylonVertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals)
  vertexData.normals = normals

  vertexData.applyToMesh(customMesh)

  customMesh.isVisible = false

  return customMesh
}

