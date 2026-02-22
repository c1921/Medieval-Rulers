# Medieval Rulers - Map System V2

Vite + Vue3 + TypeScript project for a medieval strategy game map foundation.

## Implemented in this stage

- Square grid world map (`80 x 80`) with base tile size `10px`
- Two independent map modes:
  - `deJure` (legal control)
  - `deFacto` (actual control)
- Shared county base across both modes:
  - county shapes are identical in `deJure` and `deFacto`
  - default duchy-level difference ratio is around `10%`
- Three hierarchical levels for both modes:
  - `kingdom`
  - `duchy`
  - `county`
- Title and character model:
  - quote from CK3 wiki: `A title is essentially a certificate of land ownership, decreeing which characters own a certain place or lead a certain landless group of people. Each title has a rank, a unique coat of arms, and a color on map. A character's titles along with those held by its vassals form a character's Realm.`
  - each title has one holder character
  - each title keeps both `deJure` and `deFacto` parent references
  - character count defaults to county title count
- Data/render separation:
  - Domain model + selectors + validation
  - Pixi renderer + chunk painter
- Camera and interaction:
  - left-button drag to pan
  - mouse wheel zoom (`0.5x` to `4x`)
  - hover tile highlight
  - click selection by current level
- `pathfinding.js` adapter scaffold (`createGridSnapshot`) without gameplay pathfinding

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - type-check and production build
- `npm run test` - run vitest suite
- `npm run test:watch` - watch mode tests
- `npm run map:seed` - regenerate `src/data/maps/world.v2.json`

### Regenerate with custom seed/counts

```bash
node scripts/generate-map-seed.mjs --seed=9527 --counties=320 --duchies=52 --kingdoms=7
```

## Key files

- `src/domain/map/types.ts`
- `src/domain/map/validation.ts`
- `src/domain/map/selectors.ts`
- `src/domain/map/seedGenerator.ts`
- `src/domain/map/pathfindingAdapter.ts`
- `src/stores/mapStore.ts`
- `src/features/map/MapCanvas.vue`
- `src/features/map/render/MapRenderer.ts`
- `src/features/map/render/chunkPainter.ts`
- `src/data/maps/world.v2.json`
