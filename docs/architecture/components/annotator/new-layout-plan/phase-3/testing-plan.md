# Phase 3 — Testing Plan

## Automated Tests

1. **Viewport tracking accuracy**
   - Simulate scroll events and verify `visiblePageRange` & `currentPage` values in rendered hook tests.
2. **Context aggregation ordering**
   - Provide mocked annotations / notes with known locations ➜ expect highest relevance for items inside viewport.
3. **UI interaction**
   - Playwright test: clicking an item scrolls to correct page & highlights annotation element.
4. **Performance regression**
   - Use Playwright trace to ensure Context Feed renders in <50ms for 1000 items.

## Manual QA

- Scroll through a 500-page PDF and observe feed updates / no jank.
- Verify memory snapshots to rule out leaks (Chrome DevTools performance panel).
- Accessibility: feed items expose `role="button"` + `aria-label` describing target page/annotation. 