# Phase 4 — State Finalisation

No new state primitives are introduced in Phase 4. Instead we:

- **Version‐bump** `layoutConfigAtom.version` to `1.1.0` to signal stable schema.
- Migrate any legacy keys still present (`document-layout`, previous beta builds).
- Add runtime guard that validates loaded layout against JSON schema; on mismatch it resets and logs Sentry breadcrumb.

```typescript
const MIGRATION_TARGET_VERSION = '1.1.0';

export const migratedLayoutAtom = atom<LayoutState>((get) => {
  const raw = localStorage.getItem('document-layout-config');
  if (!raw) return initialState;

  const parsed = safeParse(raw);
  return parsed.version === MIGRATION_TARGET_VERSION ? parsed : migrate(parsed);
});
``` 