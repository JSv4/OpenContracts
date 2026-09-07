- Replace popup authentication with same-tab Auth0 Universal Login through the
  official React SDK and its memory cache. Validate restored sessions against the
  backend, recover from failed identity checks, preserve sessions on permission
  denials, and prevent stale requests from restoring logged-out users. Local
  username/password sessions survive tab refreshes without persisting profiles.
