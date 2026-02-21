import {
  CHUNK_SIZE,
  DEFAULT_SEED,
  MAP_HEIGHT,
  MAP_VERSION,
  MAP_WIDTH,
  TILE_SIZE_PX,
  type HierarchyData,
  type WorldMapDataV1,
} from './types'

interface GenerationOptions {
  seed?: number
  countyCount?: number
  duchyCount?: number
  kingdomCount?: number
}

const DEFAULT_COUNTY_COUNT = 1500
const DEFAULT_DUCHY_COUNT = 240
const DEFAULT_KINGDOM_COUNT = 30

class XorShift32 {
  private state: number

  constructor(seed: number) {
    this.state = (seed | 0) || 1
  }

  next(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x | 0
    return (x >>> 0) / 4294967296
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new Error(`maxExclusive must be > 0, got ${maxExclusive}`)
    }
    return Math.floor(this.next() * maxExclusive)
  }
}

function atOrThrow<T>(array: readonly T[], index: number, label: string): T {
  const value = array[index]
  if (value === undefined) {
    throw new Error(`${label} index out of bounds: ${index}`)
  }
  return value
}

function tileNeighbors(tileId: number, width: number, height: number): number[] {
  const x = tileId % width
  const y = Math.floor(tileId / width)
  const out: number[] = []
  if (x > 0) out.push(tileId - 1)
  if (x + 1 < width) out.push(tileId + 1)
  if (y > 0) out.push(tileId - width)
  if (y + 1 < height) out.push(tileId + width)
  return out
}

function chooseUniqueSeeds(totalNodes: number, seedCount: number, rng: XorShift32): number[] {
  if (seedCount > totalNodes) {
    throw new Error(`seedCount(${seedCount}) must be <= totalNodes(${totalNodes})`)
  }

  const used = new Set<number>()
  const out: number[] = []
  while (out.length < seedCount) {
    const candidate = rng.nextInt(totalNodes)
    if (!used.has(candidate)) {
      used.add(candidate)
      out.push(candidate)
    }
  }
  return out
}

function buildDesiredSizes(total: number, bucketCount: number, rng: XorShift32): number[] {
  const base = Math.floor(total / bucketCount)
  const variance = Math.max(1, Math.floor(base * 0.35))
  const desired = new Array<number>(bucketCount)
  let sum = 0

  for (let i = 0; i < bucketCount; i += 1) {
    const offset = rng.nextInt(variance * 2 + 1) - variance
    const target = Math.max(1, base + offset)
    desired[i] = target
    sum += target
  }

  let diff = total - sum
  while (diff !== 0) {
    const index = rng.nextInt(bucketCount)
    if (diff > 0) {
      desired[index] = atOrThrow(desired, index, 'desired') + 1
      diff -= 1
      continue
    }
    if (atOrThrow(desired, index, 'desired') > 1) {
      desired[index] = atOrThrow(desired, index, 'desired') - 1
      diff += 1
    }
  }

  return desired
}

function removeAtSwap(buffer: number[], index: number): void {
  const lastIndex = buffer.length - 1
  buffer[index] = atOrThrow(buffer, lastIndex, 'buffer')
  buffer.pop()
}

function regionGrow(
  totalNodes: number,
  seedCount: number,
  rng: XorShift32,
  adjacency: ReadonlyArray<ReadonlyArray<number>>,
): number[] {
  const owner = new Array<number>(totalNodes).fill(-1)
  const regionSizes = new Array<number>(seedCount).fill(0)
  const desiredSizes = buildDesiredSizes(totalNodes, seedCount, rng)
  const frontiers = new Array<number[]>(seedCount)

  const seeds = chooseUniqueSeeds(totalNodes, seedCount, rng)
  for (let regionId = 0; regionId < seedCount; regionId += 1) {
    const seed = atOrThrow(seeds, regionId, 'seeds')
    owner[seed] = regionId
    regionSizes[regionId] = 1
    frontiers[regionId] = [seed]
  }

  let unassigned = totalNodes - seedCount
  while (unassigned > 0) {
    const preferred: number[] = []
    const fallback: number[] = []

    for (let regionId = 0; regionId < seedCount; regionId += 1) {
      const frontier = atOrThrow(frontiers, regionId, 'frontiers')
      if (frontier.length === 0) {
        continue
      }
      fallback.push(regionId)
      if (atOrThrow(regionSizes, regionId, 'regionSizes') < atOrThrow(desiredSizes, regionId, 'desiredSizes')) {
        preferred.push(regionId)
      }
    }

    const candidates = preferred.length > 0 ? preferred : fallback
    if (candidates.length === 0) {
      throw new Error('regionGrow stuck: no expandable frontier while nodes remain')
    }

    const regionId = atOrThrow(candidates, rng.nextInt(candidates.length), 'candidates')
    const frontier = atOrThrow(frontiers, regionId, 'frontiers')

    let expanded = false
    while (frontier.length > 0 && !expanded) {
      const frontierIndex = rng.nextInt(frontier.length)
      const node = atOrThrow(frontier, frontierIndex, 'frontier')
      const neighbors = atOrThrow(adjacency, node, 'adjacency')
      const unclaimedNeighbors = neighbors.filter((next) => owner[next] === -1)

      if (unclaimedNeighbors.length === 0) {
        removeAtSwap(frontier, frontierIndex)
        continue
      }

      const nextNode = atOrThrow(
        unclaimedNeighbors,
        rng.nextInt(unclaimedNeighbors.length),
        'unclaimedNeighbors',
      )
      owner[nextNode] = regionId
      regionSizes[regionId] = atOrThrow(regionSizes, regionId, 'regionSizes') + 1
      frontier.push(nextNode)
      unassigned -= 1
      expanded = true
    }
  }

  return owner
}

function buildTileAdjacency(width: number, height: number): number[][] {
  const total = width * height
  const out = new Array<number[]>(total)
  for (let tileId = 0; tileId < total; tileId += 1) {
    out[tileId] = tileNeighbors(tileId, width, height)
  }
  return out
}

function buildRegionAdjacencyFromTiles(
  tileOwner: readonly number[],
  regionCount: number,
  width: number,
  height: number,
): number[][] {
  const sets = Array.from({ length: regionCount }, () => new Set<number>())

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileId = y * width + x
      const region = atOrThrow(tileOwner, tileId, 'tileOwner')

      if (x + 1 < width) {
        const eastRegion = atOrThrow(tileOwner, tileId + 1, 'tileOwner')
        if (eastRegion !== region) {
          atOrThrow(sets, region, 'sets').add(eastRegion)
          atOrThrow(sets, eastRegion, 'sets').add(region)
        }
      }

      if (y + 1 < height) {
        const southRegion = atOrThrow(tileOwner, tileId + width, 'tileOwner')
        if (southRegion !== region) {
          atOrThrow(sets, region, 'sets').add(southRegion)
          atOrThrow(sets, southRegion, 'sets').add(region)
        }
      }
    }
  }

  return sets.map((set) => Array.from(set).sort((a, b) => a - b))
}

function projectAdjacency(
  sourceAdjacency: ReadonlyArray<ReadonlyArray<number>>,
  sourceToTarget: readonly number[],
  targetCount: number,
): number[][] {
  const sets = Array.from({ length: targetCount }, () => new Set<number>())

  for (let sourceId = 0; sourceId < sourceAdjacency.length; sourceId += 1) {
    const targetA = atOrThrow(sourceToTarget, sourceId, 'sourceToTarget')
    for (const sourceNeighbor of atOrThrow(sourceAdjacency, sourceId, 'sourceAdjacency')) {
      const targetB = atOrThrow(sourceToTarget, sourceNeighbor, 'sourceToTarget')
      if (targetA === targetB) {
        continue
      }
      atOrThrow(sets, targetA, 'sets').add(targetB)
      atOrThrow(sets, targetB, 'sets').add(targetA)
    }
  }

  return sets.map((set) => Array.from(set).sort((a, b) => a - b))
}

function buildNames(prefix: string, count: number): string[] {
  const out = new Array<string>(count)
  for (let i = 0; i < count; i += 1) {
    out[i] = `${prefix} ${i + 1}`
  }
  return out
}

function generateHierarchy(
  width: number,
  height: number,
  countyCount: number,
  duchyCount: number,
  kingdomCount: number,
  seed: number,
): HierarchyData {
  const tileAdjacency = buildTileAdjacency(width, height)
  const countyRng = new XorShift32(seed ^ 0x9e3779b9)
  const tileToCounty = regionGrow(width * height, countyCount, countyRng, tileAdjacency)

  const countyAdjacency = buildRegionAdjacencyFromTiles(tileToCounty, countyCount, width, height)
  const duchyRng = new XorShift32(seed ^ 0x85ebca6b)
  const countyToDuchy = regionGrow(countyCount, duchyCount, duchyRng, countyAdjacency)

  const duchyAdjacency = projectAdjacency(countyAdjacency, countyToDuchy, duchyCount)
  const kingdomRng = new XorShift32(seed ^ 0xc2b2ae35)
  const duchyToKingdom = regionGrow(duchyCount, kingdomCount, kingdomRng, duchyAdjacency)

  return {
    tileToCounty,
    countyToDuchy,
    duchyToKingdom,
    countyNames: buildNames('County', countyCount),
    duchyNames: buildNames('Duchy', duchyCount),
    kingdomNames: buildNames('Kingdom', kingdomCount),
  }
}

export function calculateModeDifferenceRatio(
  leftTileToCounty: readonly number[],
  rightTileToCounty: readonly number[],
): number {
  if (leftTileToCounty.length !== rightTileToCounty.length) {
    throw new Error('tile arrays must have the same length to compare')
  }
  let diff = 0
  for (let i = 0; i < leftTileToCounty.length; i += 1) {
    if (leftTileToCounty[i] !== rightTileToCounty[i]) {
      diff += 1
    }
  }
  return diff / leftTileToCounty.length
}

export function generateWorldMapData(options: GenerationOptions = {}): WorldMapDataV1 {
  const seed = options.seed ?? DEFAULT_SEED
  const countyCount = options.countyCount ?? DEFAULT_COUNTY_COUNT
  const duchyCount = options.duchyCount ?? DEFAULT_DUCHY_COUNT
  const kingdomCount = options.kingdomCount ?? DEFAULT_KINGDOM_COUNT

  if (!Number.isInteger(seed)) {
    throw new Error('seed must be integer')
  }
  if (countyCount <= 0 || duchyCount <= 0 || kingdomCount <= 0) {
    throw new Error('county/duchy/kingdom counts must be > 0')
  }
  if (duchyCount > countyCount) {
    throw new Error('duchyCount must be <= countyCount')
  }
  if (kingdomCount > duchyCount) {
    throw new Error('kingdomCount must be <= duchyCount')
  }

  const deJure = generateHierarchy(
    MAP_WIDTH,
    MAP_HEIGHT,
    countyCount,
    duchyCount,
    kingdomCount,
    seed ^ 0xa5a5a5a5,
  )
  const deFacto = generateHierarchy(
    MAP_WIDTH,
    MAP_HEIGHT,
    countyCount,
    duchyCount,
    kingdomCount,
    seed ^ 0x5a5a5a5a,
  )

  return {
    version: MAP_VERSION,
    grid: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileSizePx: TILE_SIZE_PX,
      chunkSize: CHUNK_SIZE,
      seed,
    },
    modes: {
      deJure,
      deFacto,
    },
  }
}
