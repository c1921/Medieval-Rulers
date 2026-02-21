import {
  CHUNK_SIZE,
  MAP_HEIGHT,
  MAP_MODES,
  MAP_VERSION,
  MAP_WIDTH,
  TILE_SIZE_PX,
  type HierarchyData,
  type WorldMapDataV1,
} from './types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[map validation] ${message}`)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item))
}

function assertIndexBounds(indices: number[], size: number, field: string): void {
  for (let i = 0; i < indices.length; i += 1) {
    const value = indices[i]
    assert(value !== undefined, `${field}[${i}] is undefined`)
    assert(value >= 0 && value < size, `${field}[${i}] out of bounds: ${value}, size=${size}`)
  }
}

function assertNonEmptyDistribution(indices: number[], size: number, field: string): void {
  const counts = new Array<number>(size).fill(0)
  for (const index of indices) {
    const current = counts[index]
    assert(current !== undefined, `${field}: index out of bounds: ${index}`)
    counts[index] = current + 1
  }
  for (let i = 0; i < counts.length; i += 1) {
    const count = counts[i]
    assert(count !== undefined, `${field}: missing counter for id=${i}`)
    assert(count > 0, `${field} has empty entity at id=${i}`)
  }
}

function validateHierarchy(raw: unknown, tileCount: number, mode: string): HierarchyData {
  assert(isObject(raw), `${mode}: hierarchy must be an object`)

  const tileToCounty = raw.tileToCounty
  const countyToDuchy = raw.countyToDuchy
  const duchyToKingdom = raw.duchyToKingdom
  const countyNames = raw.countyNames
  const duchyNames = raw.duchyNames
  const kingdomNames = raw.kingdomNames

  assert(isIntArray(tileToCounty), `${mode}: tileToCounty must be number[]`)
  assert(isIntArray(countyToDuchy), `${mode}: countyToDuchy must be number[]`)
  assert(isIntArray(duchyToKingdom), `${mode}: duchyToKingdom must be number[]`)
  assert(
    Array.isArray(countyNames) && countyNames.every((v) => typeof v === 'string'),
    `${mode}: countyNames must be string[]`,
  )
  assert(
    Array.isArray(duchyNames) && duchyNames.every((v) => typeof v === 'string'),
    `${mode}: duchyNames must be string[]`,
  )
  assert(
    Array.isArray(kingdomNames) && kingdomNames.every((v) => typeof v === 'string'),
    `${mode}: kingdomNames must be string[]`,
  )

  assert(tileToCounty.length === tileCount, `${mode}: tileToCounty length must be ${tileCount}`)
  assert(countyNames.length > 0, `${mode}: countyNames cannot be empty`)
  assert(duchyNames.length > 0, `${mode}: duchyNames cannot be empty`)
  assert(kingdomNames.length > 0, `${mode}: kingdomNames cannot be empty`)
  assert(
    countyToDuchy.length === countyNames.length,
    `${mode}: countyToDuchy length must match countyNames`,
  )
  assert(
    duchyToKingdom.length === duchyNames.length,
    `${mode}: duchyToKingdom length must match duchyNames`,
  )

  assertIndexBounds(tileToCounty, countyNames.length, `${mode}: tileToCounty`)
  assertIndexBounds(countyToDuchy, duchyNames.length, `${mode}: countyToDuchy`)
  assertIndexBounds(duchyToKingdom, kingdomNames.length, `${mode}: duchyToKingdom`)

  assertNonEmptyDistribution(tileToCounty, countyNames.length, `${mode}: county`)
  assertNonEmptyDistribution(countyToDuchy, duchyNames.length, `${mode}: duchy`)
  assertNonEmptyDistribution(duchyToKingdom, kingdomNames.length, `${mode}: kingdom`)

  return {
    tileToCounty,
    countyToDuchy,
    duchyToKingdom,
    countyNames,
    duchyNames,
    kingdomNames,
  }
}

export function validateWorldMapData(raw: unknown): WorldMapDataV1 {
  assert(isObject(raw), 'map payload must be an object')
  assert(raw.version === MAP_VERSION, `version must be ${MAP_VERSION}`)
  assert(isObject(raw.grid), 'grid must be an object')
  assert(raw.grid.width === MAP_WIDTH, `grid.width must be ${MAP_WIDTH}`)
  assert(raw.grid.height === MAP_HEIGHT, `grid.height must be ${MAP_HEIGHT}`)
  assert(raw.grid.tileSizePx === TILE_SIZE_PX, `grid.tileSizePx must be ${TILE_SIZE_PX}`)
  assert(raw.grid.chunkSize === CHUNK_SIZE, `grid.chunkSize must be ${CHUNK_SIZE}`)
  assert(Number.isInteger(raw.grid.seed), 'grid.seed must be integer')

  assert(isObject(raw.modes), 'modes must be an object')
  const tileCount = MAP_WIDTH * MAP_HEIGHT
  const modes = {
    deJure: validateHierarchy(raw.modes.deJure, tileCount, 'deJure'),
    deFacto: validateHierarchy(raw.modes.deFacto, tileCount, 'deFacto'),
  }

  for (const mode of MAP_MODES) assert(mode in modes, `missing mode ${mode}`)

  const seed = raw.grid.seed as number

  return {
    version: MAP_VERSION,
    grid: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileSizePx: TILE_SIZE_PX,
      chunkSize: CHUNK_SIZE,
      seed,
    },
    modes,
  }
}
