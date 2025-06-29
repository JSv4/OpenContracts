# Phase 4 — Testing Plan

## Automated Benchmarks

- **Performance**: Lighthouse & custom Playwright scripts to collect interaction latency metrics.
- **Error handling**: Simulate thrown errors inside a panel ➜ expect `LayoutErrorBoundary` fallback UI and successful reset.
- **Accessibility**: Use `axe-core` integration in Playwright to ensure no critical violations.

## Regression Suite

Run full Phase-1 + Phase-2 + Phase-3 suites to ensure polish work did not break existing features.

## Manual Rollout Checks

1. **Network throttling** – verify layout remains usable on 3G.
2. Artifacts: confirm source maps & monitoring instrumentation are included only in non-prod bundles where appropriate. 