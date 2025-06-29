# Phase 3 — Context Feed Implementation (Weeks 6-9)

## Goals

- Deliver a **viewport-aware Context Feed** that surfaces the most relevant annotations, relationships and search hits for the *currently visible* pages.
- Implement performant **viewport tracking** and **relevance scoring** algorithms as described in the implementation guide.
- Keep the feed fully decoupled so it can be shown/hidden or floated without impacting PDF performance.

## Scope

1. Build the `useViewportTracking` hook (scroll listener + ResizeObserver).
2. Implement `useContextAggregation` for multi-source aggregation & scoring.
3. Create the initial UI wrapper (panel adapter) that lists items with virtualisation.
4. Provide selection callbacks so clicking an item scrolls/zooms the PDF to the corresponding annotation.

## Success Criteria

- Feed updates in **< 200 ms** when user scrolls rapidly.
- Memory footprint remains flat (< 5 MB increase for 1 000 annotations).
- Selecting an item scrolls the page in ≤ 500 ms and highlights the annotation.
- No regression in overall page scroll smoothness (FPS stays > 55 on mid-tier laptops). 