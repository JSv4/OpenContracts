# Authentication pattern

The current [frontend authentication flow](../../../docs/frontend/auth_flow.md)
describes SDK initialization, backend identity validation, request renewal, and
logout. Use it as the authoritative implementation guide.

- Use `useAuthenticated()` for signed-in UI controls and `backendUserObj` for
  identity, ownership, and backend privileges. UI gating does not replace server
  authorization.
- Use `useAuthLogin()` to start Auth0 Universal Login in the same browser tab.
  Audience and scopes come from the SDK provider configuration.
- Let the SDK manage Auth0 tokens. Do not add popup fallbacks, custom credential
  forms, token decoding for authorization, or persistent SDK caches.
- Use `clearAuthSession()` for invalidation. It clears both identities and prevents
  pending requests from restoring the old session. `authToken("")` alone is not
  sufficient.
- `authInitCompleteVar` means credential acquisition, cache clearing, and identity
  validation have settled. `useAuthReady()` also becomes true for anonymous users.
- A 200 response with `me: null` invalidates a candidate session; an outage does not.
  Permission-denied responses, including 403, do not imply invalid credentials.
