import {
  CHUNK_SIZE,
  MAP_HEIGHT,
  MAP_MODES,
  MAP_VERSION,
  MAP_WIDTH,
  TILE_SIZE_PX,
  type CharacterId,
  type HierarchyData,
  type MapCharacter,
  type MapTitle,
  type TitleId,
  type TitleRank,
  type WorldMapDataV2,
} from './types'

interface ParsedTitleId {
  rank: TitleRank
  entityId: number
}

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

function isTitleRank(value: unknown): value is TitleRank {
  return value === 'county' || value === 'duchy' || value === 'kingdom'
}

function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && /^character:\d+$/.test(value)
}

function parseTitleId(value: string): ParsedTitleId | null {
  const match = /^(county|duchy|kingdom):(\d+)$/.exec(value)
  if (!match) {
    return null
  }
  return {
    rank: match[1] as TitleRank,
    entityId: Number.parseInt(match[2] ?? '', 10),
  }
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

function assertNumberArrayEqual(left: number[], right: number[], label: string): void {
  assert(left.length === right.length, `${label} length mismatch: ${left.length} !== ${right.length}`)
  for (let i = 0; i < left.length; i += 1) {
    const leftValue = left[i]
    const rightValue = right[i]
    assert(
      leftValue === rightValue,
      `${label} differs at [${i}]: ${String(leftValue)} !== ${String(rightValue)}`,
    )
  }
}

function assertStringArrayEqual(left: string[], right: string[], label: string): void {
  assert(left.length === right.length, `${label} length mismatch: ${left.length} !== ${right.length}`)
  for (let i = 0; i < left.length; i += 1) {
    const leftValue = left[i]
    const rightValue = right[i]
    assert(
      leftValue === rightValue,
      `${label} differs at [${i}]: ${String(leftValue)} !== ${String(rightValue)}`,
    )
  }
}

function assertNumberArrayHasDifference(left: number[], right: number[], label: string): void {
  assert(left.length === right.length, `${label} length mismatch: ${left.length} !== ${right.length}`)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return
    }
  }
  throw new Error(`[map validation] ${label} must not be identical`)
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

function validateTitleId(raw: unknown, field: string): TitleId {
  assert(typeof raw === 'string', `${field} must be a title id string`)
  const parsed = parseTitleId(raw)
  assert(parsed !== null, `${field} must match rank:id format`)
  return raw as TitleId
}

function validateNullableTitleId(raw: unknown, field: string): TitleId | null {
  if (raw === null) {
    return null
  }
  return validateTitleId(raw, field)
}

function expectedCountByRank(rank: TitleRank, modes: Record<'deJure' | 'deFacto', HierarchyData>): number {
  if (rank === 'county') {
    return modes.deJure.countyNames.length
  }
  if (rank === 'duchy') {
    return modes.deJure.duchyNames.length
  }
  return modes.deJure.kingdomNames.length
}

function validateTitles(
  raw: unknown,
  modes: Record<'deJure' | 'deFacto', HierarchyData>,
): MapTitle[] {
  assert(Array.isArray(raw), 'titles must be an array')

  const titles: MapTitle[] = []
  const seenTitleIds = new Set<TitleId>()
  const seenEntityIdsByRank: Record<TitleRank, Set<number>> = {
    county: new Set<number>(),
    duchy: new Set<number>(),
    kingdom: new Set<number>(),
  }

  for (let i = 0; i < raw.length; i += 1) {
    const value = raw[i]
    assert(isObject(value), `titles[${i}] must be an object`)

    const id = validateTitleId(value.id, `titles[${i}].id`)
    assert(!seenTitleIds.has(id), `titles[${i}].id duplicated: ${id}`)
    seenTitleIds.add(id)

    const parsedId = parseTitleId(id)
    assert(parsedId !== null, `titles[${i}].id parsing failed`)

    const rank = value.rank
    assert(isTitleRank(rank), `titles[${i}].rank must be county|duchy|kingdom`)
    assert(rank === parsedId.rank, `titles[${i}] id/rank mismatch: ${id} vs ${rank}`)

    const entityId = value.entityId
    assert(Number.isInteger(entityId), `titles[${i}].entityId must be integer`)
    assert(entityId === parsedId.entityId, `titles[${i}] id/entityId mismatch: ${id} vs ${entityId}`)
    assert(
      entityId >= 0 && entityId < expectedCountByRank(rank, modes),
      `titles[${i}].entityId out of bounds for ${rank}: ${entityId}`,
    )
    seenEntityIdsByRank[rank].add(entityId)

    const name = value.name
    assert(typeof name === 'string' && name.length > 0, `titles[${i}].name must be a non-empty string`)
    const mapColorRaw = value.mapColor
    assert(
      typeof mapColorRaw === 'number' &&
      Number.isInteger(mapColorRaw) &&
      mapColorRaw >= 0 &&
      mapColorRaw <= 0xffffff,
      `titles[${i}].mapColor must be integer 0..16777215`,
    )
    const mapColor = mapColorRaw as number
    const coatOfArmsSeed = value.coatOfArmsSeed
    assert(
      typeof coatOfArmsSeed === 'string' && coatOfArmsSeed.length > 0,
      `titles[${i}].coatOfArmsSeed must be a non-empty string`,
    )
    const holderCharacterId = value.holderCharacterId
    assert(
      isCharacterId(holderCharacterId),
      `titles[${i}].holderCharacterId must match character:id format`,
    )

    const deJureParentTitleId = validateNullableTitleId(
      value.deJureParentTitleId,
      `titles[${i}].deJureParentTitleId`,
    )
    const deFactoParentTitleId = validateNullableTitleId(
      value.deFactoParentTitleId,
      `titles[${i}].deFactoParentTitleId`,
    )

    titles.push({
      id,
      rank,
      entityId,
      name,
      mapColor,
      coatOfArmsSeed,
      holderCharacterId,
      deJureParentTitleId,
      deFactoParentTitleId,
    })
  }

  for (const rank of ['county', 'duchy', 'kingdom'] as const) {
    assert(
      seenEntityIdsByRank[rank].size === expectedCountByRank(rank, modes),
      `titles missing ${rank} entity ids`,
    )
  }

  return titles
}

function validateCharacters(raw: unknown): MapCharacter[] {
  assert(Array.isArray(raw), 'characters must be an array')

  const out: MapCharacter[] = []
  const seenIds = new Set<CharacterId>()

  for (let i = 0; i < raw.length; i += 1) {
    const value = raw[i]
    assert(isObject(value), `characters[${i}] must be an object`)
    assert(isCharacterId(value.id), `characters[${i}].id must match character:id format`)
    const id = value.id as CharacterId
    assert(!seenIds.has(id), `characters[${i}].id duplicated: ${id}`)
    seenIds.add(id)

    assert(
      typeof value.name === 'string' && value.name.length > 0,
      `characters[${i}].name must be a non-empty string`,
    )
    const primaryTitleId = validateTitleId(value.primaryTitleId, `characters[${i}].primaryTitleId`)

    const heldTitleIdsRaw = value.heldTitleIds
    assert(Array.isArray(heldTitleIdsRaw), `characters[${i}].heldTitleIds must be an array`)
    assert(heldTitleIdsRaw.length > 0, `characters[${i}].heldTitleIds cannot be empty`)
    const heldTitleIds: TitleId[] = []
    const seenHeldTitleIds = new Set<TitleId>()
    for (let j = 0; j < heldTitleIdsRaw.length; j += 1) {
      const heldTitleId = validateTitleId(
        heldTitleIdsRaw[j],
        `characters[${i}].heldTitleIds[${j}]`,
      )
      assert(
        !seenHeldTitleIds.has(heldTitleId),
        `characters[${i}].heldTitleIds has duplicate title ${heldTitleId}`,
      )
      seenHeldTitleIds.add(heldTitleId)
      heldTitleIds.push(heldTitleId)
    }
    assert(
      seenHeldTitleIds.has(primaryTitleId),
      `characters[${i}].primaryTitleId must be included in heldTitleIds`,
    )

    out.push({
      id,
      name: value.name,
      primaryTitleId,
      heldTitleIds,
    })
  }

  return out
}

function assertTitleParentRelations(
  titles: readonly MapTitle[],
  titleById: ReadonlyMap<TitleId, MapTitle>,
): void {
  for (const title of titles) {
    const deJureParent = title.deJureParentTitleId
    const deFactoParent = title.deFactoParentTitleId

    if (title.rank === 'kingdom') {
      assert(deJureParent === null, `${title.id} kingdom must have null deJure parent`)
      assert(deFactoParent === null, `${title.id} kingdom must have null deFacto parent`)
      continue
    }

    assert(deJureParent !== null, `${title.id} must have deJure parent`)
    assert(deFactoParent !== null, `${title.id} must have deFacto parent`)

    const deJureParentTitle = titleById.get(deJureParent)
    const deFactoParentTitle = titleById.get(deFactoParent)
    assert(deJureParentTitle, `${title.id} deJure parent not found: ${deJureParent}`)
    assert(deFactoParentTitle, `${title.id} deFacto parent not found: ${deFactoParent}`)

    if (title.rank === 'county') {
      assert(
        deJureParentTitle.rank === 'duchy',
        `${title.id} deJure parent must be duchy, got ${deJureParentTitle.rank}`,
      )
      assert(
        deFactoParentTitle.rank === 'duchy',
        `${title.id} deFacto parent must be duchy, got ${deFactoParentTitle.rank}`,
      )
      continue
    }

    assert(
      deJureParentTitle.rank === 'kingdom',
      `${title.id} deJure parent must be kingdom, got ${deJureParentTitle.rank}`,
    )
    assert(
      deFactoParentTitle.rank === 'kingdom',
      `${title.id} deFacto parent must be kingdom, got ${deFactoParentTitle.rank}`,
    )
  }
}

function assertTitleHierarchyMatchesModes(
  titles: readonly MapTitle[],
  titleById: ReadonlyMap<TitleId, MapTitle>,
  modes: Record<'deJure' | 'deFacto', HierarchyData>,
): void {
  for (let countyId = 0; countyId < modes.deJure.countyNames.length; countyId += 1) {
    const id = `county:${countyId}` as TitleId
    const title = titleById.get(id)
    assert(title, `missing county title ${id}`)
    assert(
      title.deJureParentTitleId === (`duchy:${modes.deJure.countyToDuchy[countyId]}` as TitleId),
      `county ${id} deJure parent mismatch with hierarchy`,
    )
    assert(
      title.deFactoParentTitleId === (`duchy:${modes.deFacto.countyToDuchy[countyId]}` as TitleId),
      `county ${id} deFacto parent mismatch with hierarchy`,
    )
  }

  for (let duchyId = 0; duchyId < modes.deJure.duchyNames.length; duchyId += 1) {
    const id = `duchy:${duchyId}` as TitleId
    const title = titleById.get(id)
    assert(title, `missing duchy title ${id}`)
    assert(
      title.deJureParentTitleId === (`kingdom:${modes.deJure.duchyToKingdom[duchyId]}` as TitleId),
      `duchy ${id} deJure parent mismatch with hierarchy`,
    )
    assert(
      title.deFactoParentTitleId === (`kingdom:${modes.deFacto.duchyToKingdom[duchyId]}` as TitleId),
      `duchy ${id} deFacto parent mismatch with hierarchy`,
    )
  }

  for (let kingdomId = 0; kingdomId < modes.deJure.kingdomNames.length; kingdomId += 1) {
    const id = `kingdom:${kingdomId}` as TitleId
    const title = titleById.get(id)
    assert(title, `missing kingdom title ${id}`)
    assert(title.deJureParentTitleId === null, `kingdom ${id} deJure parent must be null`)
    assert(title.deFactoParentTitleId === null, `kingdom ${id} deFacto parent must be null`)
  }

  assert(titles.length === titleById.size, 'title id collision detected in title map')
}

function assertTitleCharacterConsistency(
  titles: readonly MapTitle[],
  characters: readonly MapCharacter[],
): void {
  const titleById = new Map<TitleId, MapTitle>()
  for (const title of titles) {
    titleById.set(title.id, title)
  }

  const characterById = new Map<CharacterId, MapCharacter>()
  for (const character of characters) {
    characterById.set(character.id, character)
  }

  for (const title of titles) {
    assert(
      characterById.has(title.holderCharacterId),
      `title ${title.id} holder does not exist: ${title.holderCharacterId}`,
    )
  }

  const heldByCharacterMap = new Map<TitleId, CharacterId>()
  for (const character of characters) {
    for (const heldTitleId of character.heldTitleIds) {
      const title = titleById.get(heldTitleId)
      assert(title, `character ${character.id} holds missing title ${heldTitleId}`)
      assert(
        !heldByCharacterMap.has(heldTitleId),
        `title ${heldTitleId} appears in multiple character heldTitleIds`,
      )
      heldByCharacterMap.set(heldTitleId, character.id)
      assert(
        title.holderCharacterId === character.id,
        `title ${heldTitleId} holder mismatch: title=${title.holderCharacterId}, character=${character.id}`,
      )
    }
    assert(
      character.heldTitleIds.includes(character.primaryTitleId),
      `character ${character.id} primary title not in held title list`,
    )
  }

  for (const title of titles) {
    const holderFromCharacter = heldByCharacterMap.get(title.id)
    assert(holderFromCharacter, `title ${title.id} is not held by any character`)
    assert(
      holderFromCharacter === title.holderCharacterId,
      `title ${title.id} holder mismatch between title and character lists`,
    )
  }
}

export function validateWorldMapData(raw: unknown): WorldMapDataV2 {
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
  assertNumberArrayEqual(
    modes.deJure.tileToCounty,
    modes.deFacto.tileToCounty,
    'deJure/deFacto tileToCounty',
  )
  assertStringArrayEqual(
    modes.deJure.countyNames,
    modes.deFacto.countyNames,
    'deJure/deFacto countyNames',
  )
  assertNumberArrayHasDifference(
    modes.deJure.countyToDuchy,
    modes.deFacto.countyToDuchy,
    'deJure/deFacto countyToDuchy',
  )

  const titles = validateTitles(raw.titles, modes)
  const titleById = new Map<TitleId, MapTitle>()
  for (const title of titles) {
    titleById.set(title.id, title)
  }

  const characters = validateCharacters(raw.characters)
  assert(characters.length === modes.deJure.countyNames.length, 'character count must equal county count')

  assertTitleParentRelations(titles, titleById)
  assertTitleHierarchyMatchesModes(titles, titleById, modes)
  assertTitleCharacterConsistency(titles, characters)

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
    titles,
    characters,
  }
}
