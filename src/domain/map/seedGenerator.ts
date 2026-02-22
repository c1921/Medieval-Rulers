import {
  CHUNK_SIZE,
  DEFAULT_SEED,
  MAP_HEIGHT,
  MAP_VERSION,
  MAP_WIDTH,
  TILE_SIZE_PX,
  type CharacterId,
  type MapCharacter,
  type MapTitle,
  type TitleId,
  type TitleRank,
  type WorldMapDataV2,
} from './types'

interface GenerationOptions {
  seed?: number
  countyCount?: number
  duchyCount?: number
  kingdomCount?: number
}

interface CountyBase {
  tileToCounty: number[]
  countyNames: string[]
  countyAdjacency: number[][]
}

interface UpperHierarchy {
  countyToDuchy: number[]
  duchyToKingdom: number[]
  duchyNames: string[]
  kingdomNames: string[]
}

interface TitlesAndCharacters {
  titles: MapTitle[]
  characters: MapCharacter[]
}

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

function shuffledIndices(count: number, rng: XorShift32): number[] {
  const out = new Array<number>(count)
  for (let i = 0; i < count; i += 1) {
    out[i] = i
  }
  for (let i = count - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1)
    const tmp = out[i]
    out[i] = out[j] ?? 0
    out[j] = tmp ?? 0
  }
  return out
}

function buildBucketCounts(assignments: readonly number[], bucketCount: number): number[] {
  const counts = new Array<number>(bucketCount).fill(0)
  for (const bucketId of assignments) {
    const current = counts[bucketId]
    if (current === undefined) {
      throw new Error(`assignment out of bounds: ${bucketId}`)
    }
    counts[bucketId] = current + 1
  }
  return counts
}

function perturbAssignments(
  baseAssignments: readonly number[],
  adjacency: ReadonlyArray<ReadonlyArray<number>>,
  bucketCount: number,
  targetDifferences: number,
  rng: XorShift32,
  label: string,
): number[] {
  if (baseAssignments.length === 0) {
    throw new Error(`${label} cannot perturb an empty assignment array`)
  }

  const desiredDifferences = Math.max(1, targetDifferences)
  const out = baseAssignments.slice()
  const counts = buildBucketCounts(out, bucketCount)
  const changedIndices = new Set<number>()
  const maxAttempts = Math.max(500, baseAssignments.length * 120)

  let attempts = 0
  while (changedIndices.size < desiredDifferences && attempts < maxAttempts) {
    attempts += 1

    const nodeId = rng.nextInt(out.length)
    const sourceBucket = atOrThrow(out, nodeId, 'out')
    if (atOrThrow(counts, sourceBucket, 'counts') <= 1) {
      continue
    }

    const candidateSet = new Set<number>()
    for (const neighborNode of atOrThrow(adjacency, nodeId, 'adjacency')) {
      const candidateBucket = atOrThrow(out, neighborNode, 'out')
      if (candidateBucket !== sourceBucket) {
        candidateSet.add(candidateBucket)
      }
    }
    const candidates = Array.from(candidateSet)
    if (candidates.length === 0) {
      continue
    }

    const targetBucket = atOrThrow(candidates, rng.nextInt(candidates.length), 'candidates')
    out[nodeId] = targetBucket
    counts[sourceBucket] = atOrThrow(counts, sourceBucket, 'counts') - 1
    counts[targetBucket] = atOrThrow(counts, targetBucket, 'counts') + 1

    if (out[nodeId] === baseAssignments[nodeId]) {
      changedIndices.delete(nodeId)
    } else {
      changedIndices.add(nodeId)
    }
  }

  if (changedIndices.size < desiredDifferences) {
    throw new Error(
      `${label} perturbation did not reach target differences: ${changedIndices.size}/${desiredDifferences}`,
    )
  }

  return out
}

function buildTitleId(rank: TitleRank, entityId: number): TitleId {
  return `${rank}:${entityId}` as TitleId
}

function buildCharacterId(characterIndex: number): CharacterId {
  return `character:${characterIndex + 1}` as CharacterId
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex(h: number, s: number, l: number): number {
  const hue = h / 360
  const sat = s / 100
  const light = l / 100

  let r: number
  let g: number
  let b: number

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

function colorForTitle(rank: TitleRank, entityId: number): number {
  const rankOffset = rank === 'county' ? 17 : rank === 'duchy' ? 131 : 257
  const hue = (entityId * 137.508 + rankOffset) % 360
  return hslToHex(hue, 45, 42)
}

function buildCoatOfArmsSeed(seed: number, titleId: TitleId): string {
  const value = hashString(`${seed}:${titleId}`)
  return `coa-${value.toString(16).padStart(8, '0')}`
}

function buildCharacterNames(count: number, rng: XorShift32): string[] {
  const firstNames = [
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
  ] as const

  const familyNames = [
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
  ] as const

  const combinations: string[] = []
  for (const firstName of firstNames) {
    for (const familyName of familyNames) {
      combinations.push(`${firstName} ${familyName}`)
    }
  }

  const order = shuffledIndices(combinations.length, rng)
  const out = new Array<string>(count)
  for (let i = 0; i < count; i += 1) {
    if (i < combinations.length) {
      out[i] = atOrThrow(combinations, atOrThrow(order, i, 'order'), 'combinations')
    } else {
      out[i] = `Ruler ${i + 1}`
    }
  }
  return out
}

function selectPrimaryTitleId(
  heldTitleIds: readonly TitleId[],
  titleById: ReadonlyMap<TitleId, MapTitle>,
): TitleId {
  const rankWeight: Record<TitleRank, number> = {
    county: 1,
    duchy: 2,
    kingdom: 3,
  }

  let bestTitle: MapTitle | null = null
  for (const id of heldTitleIds) {
    const title = titleById.get(id)
    if (!title) {
      throw new Error(`missing title ${id} while choosing primary title`)
    }
    if (!bestTitle) {
      bestTitle = title
      continue
    }

    const candidateWeight = rankWeight[title.rank]
    const bestWeight = rankWeight[bestTitle.rank]
    if (candidateWeight > bestWeight) {
      bestTitle = title
      continue
    }
    if (candidateWeight === bestWeight && title.entityId < bestTitle.entityId) {
      bestTitle = title
    }
  }

  if (!bestTitle) {
    throw new Error('cannot choose primary title from empty held title list')
  }
  return bestTitle.id
}

function generateCountyBase(width: number, height: number, countyCount: number, seed: number): CountyBase {
  const tileAdjacency = buildTileAdjacency(width, height)
  const countyRng = new XorShift32(seed ^ 0x9e3779b9)
  const tileToCounty = regionGrow(width * height, countyCount, countyRng, tileAdjacency)
  const countyAdjacency = buildRegionAdjacencyFromTiles(tileToCounty, countyCount, width, height)

  return {
    tileToCounty,
    countyNames: buildNames('County', countyCount),
    countyAdjacency,
  }
}

function generateUpperHierarchy(
  countyAdjacency: ReadonlyArray<ReadonlyArray<number>>,
  countyCount: number,
  duchyCount: number,
  kingdomCount: number,
  seed: number,
): UpperHierarchy {
  const duchyRng = new XorShift32(seed ^ 0x85ebca6b)
  const countyToDuchy = regionGrow(countyCount, duchyCount, duchyRng, countyAdjacency)

  const duchyAdjacency = projectAdjacency(countyAdjacency, countyToDuchy, duchyCount)
  const kingdomRng = new XorShift32(seed ^ 0xc2b2ae35)
  const duchyToKingdom = regionGrow(duchyCount, kingdomCount, kingdomRng, duchyAdjacency)

  return {
    countyToDuchy,
    duchyToKingdom,
    duchyNames: buildNames('Duchy', duchyCount),
    kingdomNames: buildNames('Kingdom', kingdomCount),
  }
}

function generateDeFactoUpperHierarchy(
  countyAdjacency: ReadonlyArray<ReadonlyArray<number>>,
  countyCount: number,
  duchyCount: number,
  kingdomCount: number,
  seed: number,
  deJureUpper: UpperHierarchy,
): UpperHierarchy {
  const rng = new XorShift32(seed ^ DEFACTO_SALT)

  const countyDifferenceCount = Math.max(1, Math.round(countyCount * DEFACTO_COUNTY_DIFF_RATIO))
  const countyToDuchy = perturbAssignments(
    deJureUpper.countyToDuchy,
    countyAdjacency,
    duchyCount,
    countyDifferenceCount,
    rng,
    'countyToDuchy',
  )

  const deFactoDuchyAdjacency = projectAdjacency(countyAdjacency, countyToDuchy, duchyCount)
  const duchyDifferenceCount = Math.max(1, Math.round(duchyCount * DEFACTO_DUCHY_DIFF_RATIO))
  const duchyToKingdom = perturbAssignments(
    deJureUpper.duchyToKingdom,
    deFactoDuchyAdjacency,
    kingdomCount,
    duchyDifferenceCount,
    rng,
    'duchyToKingdom',
  )

  return {
    countyToDuchy,
    duchyToKingdom,
    duchyNames: deJureUpper.duchyNames.slice(),
    kingdomNames: deJureUpper.kingdomNames.slice(),
  }
}

function generateTitlesAndCharacters(
  seed: number,
  countyNames: readonly string[],
  duchyNames: readonly string[],
  kingdomNames: readonly string[],
  deJureUpper: UpperHierarchy,
  deFactoUpper: UpperHierarchy,
): TitlesAndCharacters {
  const countyCount = countyNames.length
  const duchyCount = duchyNames.length
  const kingdomCount = kingdomNames.length

  const assignmentRng = new XorShift32(seed ^ CHARACTER_SALT)
  const nameRng = new XorShift32(seed ^ NAME_SALT)
  const characterNames = buildCharacterNames(countyCount, nameRng)

  const heldTitleIdsByCharacter = Array.from({ length: countyCount }, () => [] as TitleId[])
  const countyHolderByCounty = new Array<number>(countyCount)
  const countyOrder = shuffledIndices(countyCount, assignmentRng)

  for (let characterIndex = 0; characterIndex < countyCount; characterIndex += 1) {
    const countyId = atOrThrow(countyOrder, characterIndex, 'countyOrder')
    countyHolderByCounty[countyId] = characterIndex
    atOrThrow(heldTitleIdsByCharacter, characterIndex, 'heldTitleIdsByCharacter').push(
      buildTitleId('county', countyId),
    )
  }

  const duchyCandidates = Array.from({ length: duchyCount }, () => [] as number[])
  for (let countyId = 0; countyId < countyCount; countyId += 1) {
    const duchyId = atOrThrow(deFactoUpper.countyToDuchy, countyId, 'deFactoUpper.countyToDuchy')
    const holderIndex = atOrThrow(countyHolderByCounty, countyId, 'countyHolderByCounty')
    atOrThrow(duchyCandidates, duchyId, 'duchyCandidates').push(holderIndex)
  }

  const duchyHolderByDuchy = new Array<number>(duchyCount)
  for (let duchyId = 0; duchyId < duchyCount; duchyId += 1) {
    const candidates = atOrThrow(duchyCandidates, duchyId, 'duchyCandidates')
    if (candidates.length === 0) {
      throw new Error(`duchy ${duchyId} has no county holder candidates`)
    }
    const holderIndex = atOrThrow(candidates, assignmentRng.nextInt(candidates.length), 'candidates')
    duchyHolderByDuchy[duchyId] = holderIndex
    atOrThrow(heldTitleIdsByCharacter, holderIndex, 'heldTitleIdsByCharacter').push(
      buildTitleId('duchy', duchyId),
    )
  }

  const kingdomCandidateSets = Array.from({ length: kingdomCount }, () => new Set<number>())
  for (let duchyId = 0; duchyId < duchyCount; duchyId += 1) {
    const kingdomId = atOrThrow(deFactoUpper.duchyToKingdom, duchyId, 'deFactoUpper.duchyToKingdom')
    const holderIndex = atOrThrow(duchyHolderByDuchy, duchyId, 'duchyHolderByDuchy')
    atOrThrow(kingdomCandidateSets, kingdomId, 'kingdomCandidateSets').add(holderIndex)
  }

  const kingdomHolderByKingdom = new Array<number>(kingdomCount)
  for (let kingdomId = 0; kingdomId < kingdomCount; kingdomId += 1) {
    const candidates = Array.from(atOrThrow(kingdomCandidateSets, kingdomId, 'kingdomCandidateSets'))
    if (candidates.length === 0) {
      throw new Error(`kingdom ${kingdomId} has no duchy holder candidates`)
    }
    const holderIndex = atOrThrow(candidates, assignmentRng.nextInt(candidates.length), 'candidates')
    kingdomHolderByKingdom[kingdomId] = holderIndex
    atOrThrow(heldTitleIdsByCharacter, holderIndex, 'heldTitleIdsByCharacter').push(
      buildTitleId('kingdom', kingdomId),
    )
  }

  const titles: MapTitle[] = []

  for (let countyId = 0; countyId < countyCount; countyId += 1) {
    const id = buildTitleId('county', countyId)
    const holderIndex = atOrThrow(countyHolderByCounty, countyId, 'countyHolderByCounty')
    titles.push({
      id,
      rank: 'county',
      entityId: countyId,
      name: atOrThrow(countyNames, countyId, 'countyNames'),
      mapColor: colorForTitle('county', countyId),
      coatOfArmsSeed: buildCoatOfArmsSeed(seed, id),
      holderCharacterId: buildCharacterId(holderIndex),
      deJureParentTitleId: buildTitleId(
        'duchy',
        atOrThrow(deJureUpper.countyToDuchy, countyId, 'deJureUpper.countyToDuchy'),
      ),
      deFactoParentTitleId: buildTitleId(
        'duchy',
        atOrThrow(deFactoUpper.countyToDuchy, countyId, 'deFactoUpper.countyToDuchy'),
      ),
    })
  }

  for (let duchyId = 0; duchyId < duchyCount; duchyId += 1) {
    const id = buildTitleId('duchy', duchyId)
    const holderIndex = atOrThrow(duchyHolderByDuchy, duchyId, 'duchyHolderByDuchy')
    titles.push({
      id,
      rank: 'duchy',
      entityId: duchyId,
      name: atOrThrow(duchyNames, duchyId, 'duchyNames'),
      mapColor: colorForTitle('duchy', duchyId),
      coatOfArmsSeed: buildCoatOfArmsSeed(seed, id),
      holderCharacterId: buildCharacterId(holderIndex),
      deJureParentTitleId: buildTitleId(
        'kingdom',
        atOrThrow(deJureUpper.duchyToKingdom, duchyId, 'deJureUpper.duchyToKingdom'),
      ),
      deFactoParentTitleId: buildTitleId(
        'kingdom',
        atOrThrow(deFactoUpper.duchyToKingdom, duchyId, 'deFactoUpper.duchyToKingdom'),
      ),
    })
  }

  for (let kingdomId = 0; kingdomId < kingdomCount; kingdomId += 1) {
    const id = buildTitleId('kingdom', kingdomId)
    const holderIndex = atOrThrow(kingdomHolderByKingdom, kingdomId, 'kingdomHolderByKingdom')
    titles.push({
      id,
      rank: 'kingdom',
      entityId: kingdomId,
      name: atOrThrow(kingdomNames, kingdomId, 'kingdomNames'),
      mapColor: colorForTitle('kingdom', kingdomId),
      coatOfArmsSeed: buildCoatOfArmsSeed(seed, id),
      holderCharacterId: buildCharacterId(holderIndex),
      deJureParentTitleId: null,
      deFactoParentTitleId: null,
    })
  }

  const titleById = new Map<TitleId, MapTitle>()
  for (const title of titles) {
    titleById.set(title.id, title)
  }

  const characters: MapCharacter[] = []
  for (let characterIndex = 0; characterIndex < countyCount; characterIndex += 1) {
    const heldTitleIds = atOrThrow(heldTitleIdsByCharacter, characterIndex, 'heldTitleIdsByCharacter')
    if (heldTitleIds.length === 0) {
      throw new Error(`character ${characterIndex + 1} has no titles`)
    }
    const primaryTitleId = selectPrimaryTitleId(heldTitleIds, titleById)
    characters.push({
      id: buildCharacterId(characterIndex),
      name: atOrThrow(characterNames, characterIndex, 'characterNames'),
      primaryTitleId,
      heldTitleIds: heldTitleIds.slice(),
    })
  }

  return {
    titles,
    characters,
  }
}

export function calculateModeDifferenceRatio(
  leftArray: readonly number[],
  rightArray: readonly number[],
): number {
  if (leftArray.length !== rightArray.length) {
    throw new Error('arrays must have the same length to compare')
  }
  let diff = 0
  for (let i = 0; i < leftArray.length; i += 1) {
    if (leftArray[i] !== rightArray[i]) {
      diff += 1
    }
  }
  return diff / leftArray.length
}

export function generateWorldMapData(options: GenerationOptions = {}): WorldMapDataV2 {
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

  const countyBase = generateCountyBase(MAP_WIDTH, MAP_HEIGHT, countyCount, seed ^ COUNTY_BASE_SALT)
  const deJureUpper = generateUpperHierarchy(
    countyBase.countyAdjacency,
    countyCount,
    duchyCount,
    kingdomCount,
    seed ^ DEJURE_SALT,
  )
  const deFactoUpper = generateDeFactoUpperHierarchy(
    countyBase.countyAdjacency,
    countyCount,
    duchyCount,
    kingdomCount,
    seed,
    deJureUpper,
  )
  const titlesAndCharacters = generateTitlesAndCharacters(
    seed,
    countyBase.countyNames,
    deJureUpper.duchyNames,
    deJureUpper.kingdomNames,
    deJureUpper,
    deFactoUpper,
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
