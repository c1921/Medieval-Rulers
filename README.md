# Medieval Rulers - Map System V1

Vite + Vue3 + TypeScript project for a medieval strategy game map foundation.

## Implemented in this stage

- Square grid world map (`100 x 300`) with base tile size `10px`
- Two independent map modes:
  - `deJure` (legal control)
  - `deFacto` (actual control)
- Three hierarchical levels for both modes:
  - `kingdom`
  - `duchy`
  - `county`
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
- `npm run map:seed` - regenerate `src/data/maps/world.v1.json`

### Regenerate with custom seed/counts

```bash
node scripts/generate-map-seed.mjs --seed=9527 --counties=1500 --duchies=240 --kingdoms=30
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
- `src/data/maps/world.v1.json`
