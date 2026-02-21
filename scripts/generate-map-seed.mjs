import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAP_WIDTH = 100
const MAP_HEIGHT = 300
const TILE_SIZE_PX = 10
const CHUNK_SIZE = 20
const MAP_VERSION = 1
const DEFAULT_SEED = 9527
const DEFAULT_COUNTY_COUNT = 1500
const DEFAULT_DUCHY_COUNT = 240
const DEFAULT_KINGDOM_COUNT = 30

class XorShift32 {
  constructor(seed) {
    this.state = (seed | 0) || 1
  }

  next() {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x | 0
    return (x >>> 0) / 4294967296
  }

  nextInt(maxExclusive) {
    if (maxExclusive <= 0) {
      throw new Error(`maxExclusive must be > 0, got ${maxExclusive}`)
    }
    return Math.floor(this.next() * maxExclusive)
  }
}

function parseIntArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) {
    return fallback
  }
  const value = Number.parseInt(found.slice(prefix.length), 10)
  if (!Number.isInteger(value)) {
    throw new Error(`invalid value for --${name}: ${found}`)
  }
  return value
}

function tileNeighbors(tileId, width, height) {
  const x = tileId % width
  const y = Math.floor(tileId / width)
  const out = []
  if (x > 0) out.push(tileId - 1)
  if (x + 1 < width) out.push(tileId + 1)
  if (y > 0) out.push(tileId - width)
  if (y + 1 < height) out.push(tileId + width)
  return out
}

function chooseUniqueSeeds(totalNodes, seedCount, rng) {
  if (seedCount > totalNodes) {
    throw new Error(`seedCount(${seedCount}) must be <= totalNodes(${totalNodes})`)
  }
  const used = new Set()
  const out = []
  while (out.length < seedCount) {
    const candidate = rng.nextInt(totalNodes)
    if (!used.has(candidate)) {
      used.add(candidate)
      out.push(candidate)
    }
  }
  return out
}

function buildDesiredSizes(total, bucketCount, rng) {
  const base = Math.floor(total / bucketCount)
  const variance = Math.max(1, Math.floor(base * 0.35))
  const desired = new Array(bucketCount)
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
      desired[index] += 1
      diff -= 1
      continue
    }
    if (desired[index] > 1) {
      desired[index] -= 1
      diff += 1
    }
  }
  return desired
}

function removeAtSwap(buffer, index) {
  const lastIndex = buffer.length - 1
  buffer[index] = buffer[lastIndex]
  buffer.pop()
}

function regionGrow(totalNodes, seedCount, rng, adjacency) {
  const owner = new Array(totalNodes).fill(-1)
  const regionSizes = new Array(seedCount).fill(0)
  const desiredSizes = buildDesiredSizes(totalNodes, seedCount, rng)
  const frontiers = new Array(seedCount)

  const seeds = chooseUniqueSeeds(totalNodes, seedCount, rng)
  for (let regionId = 0; regionId < seedCount; regionId += 1) {
    const seed = seeds[regionId]
    owner[seed] = regionId
    regionSizes[regionId] = 1
    frontiers[regionId] = [seed]
  }

  let unassigned = totalNodes - seedCount
  while (unassigned > 0) {
    const preferred = []
    const fallback = []

    for (let regionId = 0; regionId < seedCount; regionId += 1) {
      if (frontiers[regionId].length === 0) {
        continue
      }
      fallback.push(regionId)
      if (regionSizes[regionId] < desiredSizes[regionId]) {
        preferred.push(regionId)
      }
    }

    const candidates = preferred.length > 0 ? preferred : fallback
    if (candidates.length === 0) {
      throw new Error('regionGrow stuck: no expandable frontier while nodes remain')
    }

    const regionId = candidates[rng.nextInt(candidates.length)]
    const frontier = frontiers[regionId]
    let expanded = false

    while (frontier.length > 0 && !expanded) {
      const frontierIndex = rng.nextInt(frontier.length)
      const node = frontier[frontierIndex]
      const unclaimed = adjacency[node].filter((next) => owner[next] === -1)

      if (unclaimed.length === 0) {
        removeAtSwap(frontier, frontierIndex)
        continue
      }

      const nextNode = unclaimed[rng.nextInt(unclaimed.length)]
      owner[nextNode] = regionId
      regionSizes[regionId] += 1
      frontier.push(nextNode)
      unassigned -= 1
      expanded = true
    }
  }

  return owner
}

function buildTileAdjacency(width, height) {
  const total = width * height
  const out = new Array(total)
  for (let tileId = 0; tileId < total; tileId += 1) {
    out[tileId] = tileNeighbors(tileId, width, height)
  }
  return out
}

function buildRegionAdjacencyFromTiles(tileOwner, regionCount, width, height) {
  const sets = Array.from({ length: regionCount }, () => new Set())

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileId = y * width + x
      const region = tileOwner[tileId]

      if (x + 1 < width) {
        const eastRegion = tileOwner[tileId + 1]
        if (eastRegion !== region) {
          sets[region].add(eastRegion)
          sets[eastRegion].add(region)
        }
      }
      if (y + 1 < height) {
        const southRegion = tileOwner[tileId + width]
        if (southRegion !== region) {
          sets[region].add(southRegion)
          sets[southRegion].add(region)
        }
      }
    }
  }

  return sets.map((set) => Array.from(set).sort((a, b) => a - b))
}

function projectAdjacency(sourceAdjacency, sourceToTarget, targetCount) {
  const sets = Array.from({ length: targetCount }, () => new Set())
  for (let sourceId = 0; sourceId < sourceAdjacency.length; sourceId += 1) {
    const targetA = sourceToTarget[sourceId]
    for (const sourceNeighbor of sourceAdjacency[sourceId]) {
      const targetB = sourceToTarget[sourceNeighbor]
      if (targetA === targetB) {
        continue
      }
      sets[targetA].add(targetB)
      sets[targetB].add(targetA)
    }
  }
  return sets.map((set) => Array.from(set).sort((a, b) => a - b))
}

function buildNames(prefix, count) {
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) {
    out[i] = `${prefix} ${i + 1}`
  }
  return out
}

function generateHierarchy(width, height, countyCount, duchyCount, kingdomCount, seed) {
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

function generateWorldMapData(options = {}) {
  const seed = options.seed ?? DEFAULT_SEED
  const countyCount = options.countyCount ?? DEFAULT_COUNTY_COUNT
  const duchyCount = options.duchyCount ?? DEFAULT_DUCHY_COUNT
  const kingdomCount = options.kingdomCount ?? DEFAULT_KINGDOM_COUNT

  if (duchyCount > countyCount) {
    throw new Error('duchyCount must be <= countyCount')
  }
  if (kingdomCount > duchyCount) {
    throw new Error('kingdomCount must be <= duchyCount')
  }

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
      deJure: generateHierarchy(
        MAP_WIDTH,
        MAP_HEIGHT,
        countyCount,
        duchyCount,
        kingdomCount,
        seed ^ 0xa5a5a5a5,
      ),
      deFacto: generateHierarchy(
        MAP_WIDTH,
        MAP_HEIGHT,
        countyCount,
        duchyCount,
        kingdomCount,
        seed ^ 0x5a5a5a5a,
      ),
    },
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[seed validation] ${message}`)
  }
}

function validateHierarchy(hierarchy, tileCount, mode) {
  assert(Array.isArray(hierarchy.tileToCounty), `${mode}.tileToCounty must be array`)
  assert(Array.isArray(hierarchy.countyToDuchy), `${mode}.countyToDuchy must be array`)
  assert(Array.isArray(hierarchy.duchyToKingdom), `${mode}.duchyToKingdom must be array`)
  assert(Array.isArray(hierarchy.countyNames), `${mode}.countyNames must be array`)
  assert(Array.isArray(hierarchy.duchyNames), `${mode}.duchyNames must be array`)
  assert(Array.isArray(hierarchy.kingdomNames), `${mode}.kingdomNames must be array`)
  assert(hierarchy.tileToCounty.length === tileCount, `${mode}.tileToCounty length mismatch`)
  assert(hierarchy.countyToDuchy.length === hierarchy.countyNames.length, `${mode}.countyToDuchy length mismatch`)
  assert(hierarchy.duchyToKingdom.length === hierarchy.duchyNames.length, `${mode}.duchyToKingdom length mismatch`)

  const countySeen = new Array(hierarchy.countyNames.length).fill(0)
  const duchySeen = new Array(hierarchy.duchyNames.length).fill(0)
  const kingdomSeen = new Array(hierarchy.kingdomNames.length).fill(0)

  for (const countyId of hierarchy.tileToCounty) {
    assert(Number.isInteger(countyId) && countyId >= 0 && countyId < hierarchy.countyNames.length, `${mode}: invalid county id ${countyId}`)
    countySeen[countyId] += 1
  }
  for (const duchyId of hierarchy.countyToDuchy) {
    assert(Number.isInteger(duchyId) && duchyId >= 0 && duchyId < hierarchy.duchyNames.length, `${mode}: invalid duchy id ${duchyId}`)
    duchySeen[duchyId] += 1
  }
  for (const kingdomId of hierarchy.duchyToKingdom) {
    assert(Number.isInteger(kingdomId) && kingdomId >= 0 && kingdomId < hierarchy.kingdomNames.length, `${mode}: invalid kingdom id ${kingdomId}`)
    kingdomSeen[kingdomId] += 1
  }

  assert(countySeen.every((v) => v > 0), `${mode}: empty county found`)
  assert(duchySeen.every((v) => v > 0), `${mode}: empty duchy found`)
  assert(kingdomSeen.every((v) => v > 0), `${mode}: empty kingdom found`)
}

function validateWorldMapData(data) {
  assert(data.version === MAP_VERSION, `version must be ${MAP_VERSION}`)
  assert(data.grid.width === MAP_WIDTH, `width must be ${MAP_WIDTH}`)
  assert(data.grid.height === MAP_HEIGHT, `height must be ${MAP_HEIGHT}`)
  assert(data.grid.tileSizePx === TILE_SIZE_PX, `tileSizePx must be ${TILE_SIZE_PX}`)
  assert(data.grid.chunkSize === CHUNK_SIZE, `chunkSize must be ${CHUNK_SIZE}`)
  assert(Number.isInteger(data.grid.seed), 'seed must be integer')
  const tileCount = MAP_WIDTH * MAP_HEIGHT
  validateHierarchy(data.modes.deJure, tileCount, 'deJure')
  validateHierarchy(data.modes.deFacto, tileCount, 'deFacto')
}

async function run() {
  const seed = parseIntArg('seed', DEFAULT_SEED)
  const countyCount = parseIntArg('counties', DEFAULT_COUNTY_COUNT)
  const duchyCount = parseIntArg('duchies', DEFAULT_DUCHY_COUNT)
  const kingdomCount = parseIntArg('kingdoms', DEFAULT_KINGDOM_COUNT)

  const mapData = generateWorldMapData({
    seed,
    countyCount,
    duchyCount,
    kingdomCount,
  })
  validateWorldMapData(mapData)

  const currentFile = fileURLToPath(import.meta.url)
  const rootDir = path.resolve(path.dirname(currentFile), '..')
  const outputPath = path.resolve(rootDir, 'src/data/maps/world.v1.json')

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(mapData, null, 2)}\n`, 'utf8')

  console.log(`Generated map seed at ${outputPath}`)
  console.log(`seed=${seed}, counties=${countyCount}, duchies=${duchyCount}, kingdoms=${kingdomCount}`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
