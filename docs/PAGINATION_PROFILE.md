# Pagination profile (item 7)

## Goal

Speed up `src/editor/pages.ts` on long documents by re-measuring only from the first changed block onward, while keeping `requestAnimationFrame` coalescing and correct status-bar page counts.

## Changes

- Track `dirtyFrom` via `firstContentDiff` between the previous and next document.
- Cache per-block measurements (`measureLines` / `outerHeight`) for nodes entirely before `dirtyFrom`.
- Invalidate the cache on resize and page-setup changes (full remeasure).
- Debounce layout with `requestAnimationFrame` (cancel + reschedule on each update).
- Record `lastLayoutMs`, `lastMeasureCount`, `lastCacheHits`, and peak-* counters on pagination storage.

## Synthetic workload (unit test)

Synthetic ~100-page document (`src/editor/pages.test.ts`):

- Content height ≈ 875px (Letter, default margins)
- Block height 18px → 48 blocks/page → **4800 blocks**
- Measure cost approximated with a CPU burn standing in for DOM range/rects

| Scenario                       | Measures |         Time |
| ------------------------------ | -------: | -----------: |
| Cold layout (all blocks)       |     4800 |  **92.9 ms** |
| Edit near end (incremental)    |        1 |  **0.95 ms** |
| Full remeasure (dirtyFrom = 0) |     4800 | **105.4 ms** |

**Speedup (cold → edit at end): ~98×** for the measure-dominated path.

## Live editor (DEV profile)

Generated ~100 pages (2200 paragraphs) in the running TipTap editor via `runPaginationProfile` (Ctrl+Shift+Alt+P or `window.__AIWORD_PROFILE_PAGINATION__`; harness: `node scripts/profile-pagination.mjs` with `npm run dev`).

Peak stats are used so a follow-up decoration layout does not hide the measure-heavy pass.

| Scenario         | Pages | lastLayoutMs | lastMeasureCount | lastCacheHits |
| ---------------- | ----: | -----------: | ---------------: | ------------: |
| cold layout      |   100 |     **56.4** |             2200 |             0 |
| typing at end    |   100 |      **1.3** |                1 |          2199 |
| typing on page 1 |   100 |     **61.8** |             2200 |             0 |

Live end-edit is ~43× faster than cold (56.4 → 1.3 ms). Editing page 1 correctly invalidates from `dirtyFrom ≈ 1` and remeasures all blocks.

Synthetic stand-in for comparison: cold **92.9 ms**, edit-at-end **0.95 ms**.

## Correctness

`pageCountForBlockHeights` confirms 4800 × 18px blocks still yield **100** pages, so status-bar page numbers stay aligned with the layout model.
