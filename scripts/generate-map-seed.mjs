import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAP_WIDTH = 80
const MAP_HEIGHT = 80
const TILE_SIZE_PX = 10
const CHUNK_SIZE = 20
const MAP_VERSION = 2
const DEFAULT_SEED = 9527
const DEFAULT_COUNTY_COUNT = 320
const DEFAULT_DUCHY_COUNT = 52
const DEFAULT_KINGDOM_COUNT = 7

const DEFACTO_COUNTY_DIFF_RATIO = 0.1
const DEFACTO_DUCHY_DIFF_RATIO = 0.1

const COUNTY_BASE_SALT = 0x3c6ef372
const DEJURE_SALT = 0xa5a5a5a5
const DEFACTO_SALT = 0x5a5a5a5a
const CHARACTER_SALT = 0x7f4a7c15
const NAME_SALT = 0x6d2b79f5

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
    if (maxExclusive <= 0) throw new Error(`maxExclusive must be > 0, got ${maxExclusive}`)
    return Math.floor(this.next() * maxExclusive)
  }
}

function parseIntArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) return fallback
  const value = Number.parseInt(found.slice(prefix.length), 10)
  if (!Number.isInteger(value)) throw new Error(`invalid value for --${name}: ${found}`)
  return value
}

function atOrThrow(array, index, label) {
  const value = array[index]
  if (value === undefined) throw new Error(`${label} index out of bounds: ${index}`)
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
  if (seedCount > totalNodes) throw new Error(`seedCount(${seedCount}) must be <= totalNodes(${totalNodes})`)
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

function removeAtSwap(buffer, index) {
  const lastIndex = buffer.length - 1
  buffer[index] = atOrThrow(buffer, lastIndex, 'buffer')
  buffer.pop()
}

function regionGrow(totalNodes, seedCount, rng, adjacency) {
  const owner = new Array(totalNodes).fill(-1)
  const regionSizes = new Array(seedCount).fill(0)
  const desiredSizes = buildDesiredSizes(totalNodes, seedCount, rng)
  const frontiers = new Array(seedCount)

  const seeds = chooseUniqueSeeds(totalNodes, seedCount, rng)
  for (let regionId = 0; regionId < seedCount; regionId += 1) {
    const seed = atOrThrow(seeds, regionId, 'seeds')
    owner[seed] = regionId
    regionSizes[regionId] = 1
    frontiers[regionId] = [seed]
  }

  let unassigned = totalNodes - seedCount
  while (unassigned > 0) {
    const preferred = []
    const fallback = []
    for (let regionId = 0; regionId < seedCount; regionId += 1) {
      const frontier = atOrThrow(frontiers, regionId, 'frontiers')
      if (frontier.length === 0) continue
      fallback.push(regionId)
      if (atOrThrow(regionSizes, regionId, 'regionSizes') < atOrThrow(desiredSizes, regionId, 'desiredSizes')) preferred.push(regionId)
    }
    const candidates = preferred.length > 0 ? preferred : fallback
    if (candidates.length === 0) throw new Error('regionGrow stuck: no expandable frontier while nodes remain')

    const regionId = atOrThrow(candidates, rng.nextInt(candidates.length), 'candidates')
    const frontier = atOrThrow(frontiers, regionId, 'frontiers')
    let expanded = false
    while (frontier.length > 0 && !expanded) {
      const frontierIndex = rng.nextInt(frontier.length)
      const node = atOrThrow(frontier, frontierIndex, 'frontier')
      const neighbors = atOrThrow(adjacency, node, 'adjacency')
      const unclaimed = neighbors.filter((next) => owner[next] === -1)
      if (unclaimed.length === 0) {
        removeAtSwap(frontier, frontierIndex)
        continue
      }
      const nextNode = atOrThrow(unclaimed, rng.nextInt(unclaimed.length), 'unclaimed')
      owner[nextNode] = regionId
      regionSizes[regionId] = atOrThrow(regionSizes, regionId, 'regionSizes') + 1
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
  for (let tileId = 0; tileId < total; tileId += 1) out[tileId] = tileNeighbors(tileId, width, height)
  return out
}

function buildRegionAdjacencyFromTiles(tileOwner, regionCount, width, height) {
  const sets = Array.from({ length: regionCount }, () => new Set())
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

function projectAdjacency(sourceAdjacency, sourceToTarget, targetCount) {
  const sets = Array.from({ length: targetCount }, () => new Set())
  for (let sourceId = 0; sourceId < sourceAdjacency.length; sourceId += 1) {
    const targetA = atOrThrow(sourceToTarget, sourceId, 'sourceToTarget')
    for (const sourceNeighbor of atOrThrow(sourceAdjacency, sourceId, 'sourceAdjacency')) {
      const targetB = atOrThrow(sourceToTarget, sourceNeighbor, 'sourceToTarget')
      if (targetA === targetB) continue
      atOrThrow(sets, targetA, 'sets').add(targetB)
      atOrThrow(sets, targetB, 'sets').add(targetA)
    }
  }
  return sets.map((set) => Array.from(set).sort((a, b) => a - b))
}

function shuffledIndices(count, rng) {
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) out[i] = i
  for (let i = count - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

function perturbAssignments(baseAssignments, adjacency, bucketCount, targetDifferences, rng, label) {
  const desiredDifferences = Math.max(1, targetDifferences)
  const out = baseAssignments.slice()
  const counts = new Array(bucketCount).fill(0)
  for (const bucketId of out) counts[bucketId] += 1
  const changedIndices = new Set()
  const maxAttempts = Math.max(500, baseAssignments.length * 120)
  let attempts = 0

  while (changedIndices.size < desiredDifferences && attempts < maxAttempts) {
    attempts += 1
    const nodeId = rng.nextInt(out.length)
    const sourceBucket = atOrThrow(out, nodeId, 'out')
    if (atOrThrow(counts, sourceBucket, 'counts') <= 1) continue
    const candidateSet = new Set()
    for (const neighborNode of atOrThrow(adjacency, nodeId, 'adjacency')) {
      const candidateBucket = atOrThrow(out, neighborNode, 'out')
      if (candidateBucket !== sourceBucket) candidateSet.add(candidateBucket)
    }
    const candidates = Array.from(candidateSet)
    if (candidates.length === 0) continue
    const targetBucket = atOrThrow(candidates, rng.nextInt(candidates.length), 'candidates')
    out[nodeId] = targetBucket
    counts[sourceBucket] -= 1
    counts[targetBucket] += 1
    if (out[nodeId] === baseAssignments[nodeId]) changedIndices.delete(nodeId)
    else changedIndices.add(nodeId)
  }

  if (changedIndices.size < desiredDifferences) throw new Error(`${label} perturbation did not reach target differences`)
  return out
}

function buildTitleId(rank, entityId) {
  return `${rank}:${entityId}`
}

function buildCharacterId(index) {
  return `character:${index + 1}`
}

function hashString(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hueToRgb(p, q, t) {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex(h, s, l) {
  const hue = h / 360
  const sat = s / 100
  const light = l / 100
  let r
  let g
  let b
  if (sat === 0) {
    r = light
    g = light
    b = light
  } else {
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
    const p = 2 * light - q
    r = hueToRgb(p, q, hue + 1 / 3)
    g = hueToRgb(p, q, hue)
    b = hueToRgb(p, q, hue - 1 / 3)
  }
  return ((Math.round(r * 255) & 0xff) << 16) |
    ((Math.round(g * 255) & 0xff) << 8) |
    (Math.round(b * 255) & 0xff)
}

function colorForTitle(rank, entityId) {
  const rankOffset = rank === 'county' ? 17 : rank === 'duchy' ? 131 : 257
  const hue = (entityId * 137.508 + rankOffset) % 360
  return hslToHex(hue, 45, 42)
}

function buildCoatOfArmsSeed(seed, titleId) {
  const value = hashString(`${seed}:${titleId}`)
  return `coa-${value.toString(16).padStart(8, '0')}`
}

function buildCharacterNames(count, rng) {
  const first = [
    'Aldric',
    'Baldwin',
    'Cedric',
    'Darian',
    'Edric',
    'Falk',
    'Garin',
    'Hadrian',
    'Ivar',
    'Joran',
    'Kellan',
    'Leofric',
    'Merek',
    'Niall',
    'Osmund',
    'Perrin',
    'Quint',
    'Roderic',
    'Stefan',
    'Tristan',
    'Ulric',
    'Varric',
    'Wulfric',
    'Yorick',
  ]
  const last = [
    'Ashford',
    'Blackmere',
    'Crownhill',
    'Dunwall',
    'Elden',
    'Frostmere',
    'Greywatch',
    'Highvale',
    'Ironwood',
    'Kingsley',
    'Longford',
    'Mornfield',
    'Northmarch',
    'Oakheart',
    'Ravencrest',
    'Stonehelm',
    'Thornwall',
    'Umber',
    'Valewood',
    'Westmere',
    'Yarborough',
    'Windmere',
    'Stormford',
    'Redwyne',
  ]
  const combos = []
  for (const a of first) for (const b of last) combos.push(`${a} ${b}`)
  const order = shuffledIndices(combos.length, rng)
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) out[i] = combos[order[i]] ?? `Ruler ${i + 1}`
  return out
}

function generateWorldMapData(options = {}) {
  const seed = options.seed ?? DEFAULT_SEED
  const countyCount = options.countyCount ?? DEFAULT_COUNTY_COUNT
  const duchyCount = options.duchyCount ?? DEFAULT_DUCHY_COUNT
  const kingdomCount = options.kingdomCount ?? DEFAULT_KINGDOM_COUNT
  if (!Number.isInteger(seed)) throw new Error('seed must be integer')
  if (countyCount <= 0 || duchyCount <= 0 || kingdomCount <= 0) throw new Error('county/duchy/kingdom counts must be > 0')
  if (duchyCount > countyCount) throw new Error('duchyCount must be <= countyCount')
  if (kingdomCount > duchyCount) throw new Error('kingdomCount must be <= duchyCount')

  const countyBase = (() => {
    const tileAdjacency = buildTileAdjacency(MAP_WIDTH, MAP_HEIGHT)
    const countyRng = new XorShift32((seed ^ COUNTY_BASE_SALT) ^ 0x9e3779b9)
    const tileToCounty = regionGrow(MAP_WIDTH * MAP_HEIGHT, countyCount, countyRng, tileAdjacency)
    return {
      tileToCounty,
      countyNames: Array.from({ length: countyCount }, (_, i) => `County ${i + 1}`),
      countyAdjacency: buildRegionAdjacencyFromTiles(tileToCounty, countyCount, MAP_WIDTH, MAP_HEIGHT),
    }
  })()

  const deJureUpper = (() => {
    const duchyRng = new XorShift32((seed ^ DEJURE_SALT) ^ 0x85ebca6b)
    const countyToDuchy = regionGrow(countyCount, duchyCount, duchyRng, countyBase.countyAdjacency)
    const duchyAdjacency = projectAdjacency(countyBase.countyAdjacency, countyToDuchy, duchyCount)
    const kingdomRng = new XorShift32((seed ^ DEJURE_SALT) ^ 0xc2b2ae35)
    const duchyToKingdom = regionGrow(duchyCount, kingdomCount, kingdomRng, duchyAdjacency)
    return {
      countyToDuchy,
      duchyToKingdom,
      duchyNames: Array.from({ length: duchyCount }, (_, i) => `Duchy ${i + 1}`),
      kingdomNames: Array.from({ length: kingdomCount }, (_, i) => `Kingdom ${i + 1}`),
    }
  })()

  const deFactoUpper = (() => {
    const rng = new XorShift32(seed ^ DEFACTO_SALT)
    const countyToDuchy = perturbAssignments(
      deJureUpper.countyToDuchy,
      countyBase.countyAdjacency,
      duchyCount,
      Math.max(1, Math.round(countyCount * DEFACTO_COUNTY_DIFF_RATIO)),
      rng,
      'countyToDuchy',
    )
    const duchyAdjacency = projectAdjacency(countyBase.countyAdjacency, countyToDuchy, duchyCount)
    const duchyToKingdom = perturbAssignments(
      deJureUpper.duchyToKingdom,
      duchyAdjacency,
      kingdomCount,
      Math.max(1, Math.round(duchyCount * DEFACTO_DUCHY_DIFF_RATIO)),
      rng,
      'duchyToKingdom',
    )
    return {
      countyToDuchy,
      duchyToKingdom,
      duchyNames: deJureUpper.duchyNames.slice(),
      kingdomNames: deJureUpper.kingdomNames.slice(),
    }
  })()

  const titlesAndCharacters = (() => {
    const assignmentRng = new XorShift32(seed ^ CHARACTER_SALT)
    const nameRng = new XorShift32(seed ^ NAME_SALT)
    const characterNames = buildCharacterNames(countyCount, nameRng)
    const heldTitleIdsByCharacter = Array.from({ length: countyCount }, () => [])
    const countyHolderByCounty = new Array(countyCount)
    const countyOrder = shuffledIndices(countyCount, assignmentRng)
    for (let charIndex = 0; charIndex < countyCount; charIndex += 1) {
      const countyId = atOrThrow(countyOrder, charIndex, 'countyOrder')
      countyHolderByCounty[countyId] = charIndex
      heldTitleIdsByCharacter[charIndex].push(buildTitleId('county', countyId))
    }

    const duchyCandidates = Array.from({ length: duchyCount }, () => [])
    for (let countyId = 0; countyId < countyCount; countyId += 1) duchyCandidates[deFactoUpper.countyToDuchy[countyId]].push(countyHolderByCounty[countyId])
    const duchyHolderByDuchy = new Array(duchyCount)
    for (let duchyId = 0; duchyId < duchyCount; duchyId += 1) {
      const candidates = atOrThrow(duchyCandidates, duchyId, 'duchyCandidates')
      const holder = atOrThrow(candidates, assignmentRng.nextInt(candidates.length), 'candidates')
      duchyHolderByDuchy[duchyId] = holder
      heldTitleIdsByCharacter[holder].push(buildTitleId('duchy', duchyId))
    }

    const kingdomCandidates = Array.from({ length: kingdomCount }, () => new Set())
    for (let duchyId = 0; duchyId < duchyCount; duchyId += 1) kingdomCandidates[deFactoUpper.duchyToKingdom[duchyId]].add(duchyHolderByDuchy[duchyId])
    const kingdomHolderByKingdom = new Array(kingdomCount)
    for (let kingdomId = 0; kingdomId < kingdomCount; kingdomId += 1) {
      const candidates = Array.from(kingdomCandidates[kingdomId])
      const holder = atOrThrow(candidates, assignmentRng.nextInt(candidates.length), 'candidates')
      kingdomHolderByKingdom[kingdomId] = holder
      heldTitleIdsByCharacter[holder].push(buildTitleId('kingdom', kingdomId))
    }

    const titles = []
    for (let countyId = 0; countyId < countyCount; countyId += 1) {
      titles.push({
        id: buildTitleId('county', countyId),
        rank: 'county',
        entityId: countyId,
        name: countyBase.countyNames[countyId],
        mapColor: colorForTitle('county', countyId),
        coatOfArmsSeed: buildCoatOfArmsSeed(seed, buildTitleId('county', countyId)),
        holderCharacterId: buildCharacterId(countyHolderByCounty[countyId]),
        deJureParentTitleId: buildTitleId('duchy', deJureUpper.countyToDuchy[countyId]),
        deFactoParentTitleId: buildTitleId('duchy', deFactoUpper.countyToDuchy[countyId]),
      })
    }
    for (let duchyId = 0; duchyId < duchyCount; duchyId += 1) {
      titles.push({
        id: buildTitleId('duchy', duchyId),
        rank: 'duchy',
        entityId: duchyId,
        name: deJureUpper.duchyNames[duchyId],
        mapColor: colorForTitle('duchy', duchyId),
        coatOfArmsSeed: buildCoatOfArmsSeed(seed, buildTitleId('duchy', duchyId)),
        holderCharacterId: buildCharacterId(duchyHolderByDuchy[duchyId]),
        deJureParentTitleId: buildTitleId('kingdom', deJureUpper.duchyToKingdom[duchyId]),
        deFactoParentTitleId: buildTitleId('kingdom', deFactoUpper.duchyToKingdom[duchyId]),
      })
    }
    for (let kingdomId = 0; kingdomId < kingdomCount; kingdomId += 1) {
      titles.push({
        id: buildTitleId('kingdom', kingdomId),
        rank: 'kingdom',
        entityId: kingdomId,
        name: deJureUpper.kingdomNames[kingdomId],
        mapColor: colorForTitle('kingdom', kingdomId),
        coatOfArmsSeed: buildCoatOfArmsSeed(seed, buildTitleId('kingdom', kingdomId)),
        holderCharacterId: buildCharacterId(kingdomHolderByKingdom[kingdomId]),
        deJureParentTitleId: null,
        deFactoParentTitleId: null,
      })
    }

    const rankWeight = { county: 1, duchy: 2, kingdom: 3 }
    const characters = Array.from({ length: countyCount }, (_, charIndex) => {
      const held = heldTitleIdsByCharacter[charIndex]
      let primaryTitleId = held[0]
      for (const id of held) {
        const [rank] = id.split(':')
        const [bestRank] = String(primaryTitleId).split(':')
        const rankScore = rankWeight[rank] ?? 0
        const bestRankScore = rankWeight[bestRank] ?? 0
        if (rankScore > bestRankScore) {
          primaryTitleId = id
          continue
        }
        if (rankScore === bestRankScore) {
          const entityId = Number.parseInt(id.split(':')[1] ?? '0', 10)
          const bestEntityId = Number.parseInt(String(primaryTitleId).split(':')[1] ?? '0', 10)
          if (entityId < bestEntityId) primaryTitleId = id
        }
      }
      return {
        id: buildCharacterId(charIndex),
        name: characterNames[charIndex],
        primaryTitleId,
        heldTitleIds: held.slice(),
      }
    })
    return { titles, characters }
  })()

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
      deJure: {
        tileToCounty: countyBase.tileToCounty.slice(),
        countyNames: countyBase.countyNames.slice(),
        ...deJureUpper,
      },
      deFacto: {
        tileToCounty: countyBase.tileToCounty.slice(),
        countyNames: countyBase.countyNames.slice(),
        ...deFactoUpper,
      },
    },
    titles: titlesAndCharacters.titles,
    characters: titlesAndCharacters.characters,
  }
}

function calculateModeDifferenceRatio(leftArray, rightArray) {
  if (leftArray.length !== rightArray.length) throw new Error('arrays must have the same length to compare')
  let diff = 0
  for (let i = 0; i < leftArray.length; i += 1) if (leftArray[i] !== rightArray[i]) diff += 1
  return diff / leftArray.length
}

function validateWorldMapData(data) {
  if (data.version !== MAP_VERSION) throw new Error(`version must be ${MAP_VERSION}`)
  if (data.grid.width !== MAP_WIDTH || data.grid.height !== MAP_HEIGHT) throw new Error('grid size mismatch')
  const countyDiffRatio = calculateModeDifferenceRatio(data.modes.deJure.countyToDuchy, data.modes.deFacto.countyToDuchy)
  if (countyDiffRatio < 0.08 || countyDiffRatio > 0.12) throw new Error(`county diff ratio out of range: ${countyDiffRatio}`)
  if (JSON.stringify(data.modes.deJure.tileToCounty) !== JSON.stringify(data.modes.deFacto.tileToCounty)) throw new Error('tileToCounty mismatch between modes')
  if (data.titles.length !== data.modes.deJure.countyNames.length + data.modes.deJure.duchyNames.length + data.modes.deJure.kingdomNames.length) throw new Error('title count mismatch')
  if (data.characters.length !== data.modes.deJure.countyNames.length) throw new Error('character count mismatch')
}

async function run() {
  const seed = parseIntArg('seed', DEFAULT_SEED)
  const countyCount = parseIntArg('counties', DEFAULT_COUNTY_COUNT)
  const duchyCount = parseIntArg('duchies', DEFAULT_DUCHY_COUNT)
  const kingdomCount = parseIntArg('kingdoms', DEFAULT_KINGDOM_COUNT)

  const mapData = generateWorldMapData({ seed, countyCount, duchyCount, kingdomCount })
  validateWorldMapData(mapData)

  const currentFile = fileURLToPath(import.meta.url)
  const rootDir = path.resolve(path.dirname(currentFile), '..')
  const outputPath = path.resolve(rootDir, 'src/data/maps/world.v2.json')

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(mapData, null, 2)}\n`, 'utf8')

  const countyDiffRatio = calculateModeDifferenceRatio(
    mapData.modes.deJure.countyToDuchy,
    mapData.modes.deFacto.countyToDuchy,
  )
  console.log(`Generated map seed at ${outputPath}`)
  console.log(`seed=${seed}, counties=${countyCount}, duchies=${duchyCount}, kingdoms=${kingdomCount}, countyDiffRatio=${countyDiffRatio.toFixed(4)}`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
