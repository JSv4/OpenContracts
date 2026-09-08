- Removed Graphene, graphene-django, django-graphql-jwt, and graphql-relay
  dependencies. JWT authentication now uses the shared Django/PyJWT runtime in
  `config/jwt_auth/`; global IDs and cursor pagination preserve the existing API
  format. Deployments using the optional refresh-token app should replace
  `graphql_jwt.refresh_token` with `config.jwt_auth.refresh_token` in
  `INSTALLED_APPS`; existing tables and migration history are preserved.
- Removed test-only resolver methods and the Graphene schema accessor, expanded
  SDL parity checks, and made validation extensions independent per request.
