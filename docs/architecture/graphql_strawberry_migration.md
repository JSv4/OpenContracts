# GraphQL: graphene → strawberry migration

The GraphQL API was migrated from **graphene / graphene-django** to
**strawberry-graphql** with a machine-verified guarantee of **zero
query-shape change**. This doc is a map of where things live and the
invariants that keep the wire contract stable. Graphene, graphene-django,
django-graphql-jwt, and graphql-relay are no longer runtime or test dependencies.

## The wire contract (do not break)

- `config/graphql/schema.graphql` — the **golden SDL**, captured from the
  graphene schema at migration time. It is the source of truth for every
  type, field, argument (name/type/nullability/default), interface, and enum
  member the API exposes. Root operation types, union membership, input-field
  defaults, and directive definitions are also checked.
- `opencontractserver/tests/test_schema_parity.py` — structurally compares
  the served strawberry schema against the golden SDL and **fails on any
  drift**. Field ordering and descriptions are not part of the contract;
  everything else is. Regenerate the golden SDL deliberately when changing
  the API (command in `docs/development/generating-new-graphql-schema.md`).

## Shared runtime — `config/graphql/core/`

Reproduces graphene / graphene-django behaviours on top of strawberry:

- `opencontractserver/utils/ids.py` — opaque global IDs
  (`base64("TypeName:pk")`) and `arrayconnection` cursors, shared by GraphQL,
  WebSockets, tasks, and services without importing the schema. Malformed-ID
  decoding and GraphQL ID coercion preserve the existing contract.
- `core/relay.py` — the `Node` interface, a **type registry** (`register_type`) mapping type names →
  Django model + per-type `get_queryset`/`get_node` hooks,
  countable/PDF-page-aware connection factories, and
  `resolve_django_connection` (a faithful port of graphene-django's
  `DjangoConnectionField` — `arrayconnection` cursors, 1-based
  `offset`→`after`, `RELAY_CONNECTION_MAX_LIMIT = 100`).
  - **Node resolution matches graphene-django's default `get_node`**
    (`type.get_queryset(model._default_manager, info).get(pk=id)`), NOT a
    blanket permission filter: a type without a `get_queryset` resolves
    unfiltered by pk on the DEFAULT path, with per-field resolvers enforcing
    visibility; a type with one filters. Pinned by
    `test_mentions.test_permission_enforcement_corpus`.
  - A type whose singular `xxx(id:)` lookup must stay permission-scoped
    registers an explicit `get_node` hook instead (`CorpusType` ported
    `OpenContractsNode`; `MessageType`/`chatMessage`, `datacell`, `badge`,
    `userexport`, … route through `BaseService.get_or_none` / a service). This
    closed a class of pre-existing unfiltered-`.get(pk)` IDORs;
    `test_singular_node_idor` asserts every model-backed singular target has a
    hook so the fallback can never silently re-expose one.
  - **Singular to-one FK object fields** (e.g. `AnnotationType.corpus`,
    `CorpusReferenceType.targetDocument`) resolve through
    `core/relay.py::resolve_visible_fk`, which applies the *target* type's
    `get_node`/`get_queryset` visibility hook — reproducing graphene-django's
    auto-converted-FK `CustomField`, so an invisible FK target resolves to
    `null` rather than leaking its fields across a permission boundary.
  - Resolver unit tests import the module-level functions directly; type
    registration no longer installs test-only methods on schema classes.
- `core/scalars.py` — `GenericScalar` / `JSONString` / `BigInt` (graphene
  wire behaviour).
- `core/filtering.py` — django-filter FilterSet ↔ GraphQL argument-name
  mapping (graphene's `to_camel_case`, `GlobalIDFilter`, filterset factory).
- `core/permissions.py` — `myPermissions` / `isPublished` / `objectSharedWith`
  resolvers (port of the graphene `AnnotatePermissionsForReadMixin`), with the
  same per-request `info.context.permission_annotations` memoisation the old
  `PermissionAnnotatingMiddleware` provided — now lazy, no middleware.
- `core/auth.py` — `login_required` / `superuser_required` / `user_passes_test`
  resolver decorators with graphql_jwt-compatible error messages.
- `core/mutations.py` — `drf_mutation` / `drf_deletion` (ports of the graphene
  `DRFMutation` / `DRFDeletion` serializer-backed bases).

## Per-feature modules — `config/graphql/`

`*_types.py`, `*_queries.py`, `*_mutations.py` are strawberry schema-binding
modules. Each query/mutation module exports `QUERY_FIELDS` / `MUTATION_FIELDS`
dicts that `config/graphql/schema.py` aggregates into the root types. Custom
resolver logic lives in module-level `_resolve_<Type>_<field>` /
`_mutate_<Payload>` functions (ported verbatim from graphene; roots are Django
model instances in both frameworks). These modules carry a
`# flake8: noqa: E501, F821` header — generation artifacts (long `description=`
strings; `Annotated["X", strawberry.lazy(...)]` forward-reference strings) —
while hand-written `core/` and helper modules stay fully linted.

## Auth (no per-resolver middleware)

Per-request authentication happens once in
`config/graphql/views.py::GraphQLView.get_context` via Django's
`AUTHENTICATION_BACKENDS` chain (JWT / Auth0 / API-key / session). The
graphene-era `JSONWebTokenMiddleware` + API-key middleware are gone. The
`tokenAuth` / `verifyToken` / `refreshToken` mutations are strawberry-native
ports (`config/graphql/jwt_auth.py`, `user_mutations.py`) preserving
long-running refresh-token laziness. `config/jwt_auth/` owns signing, claim
validation, credential extraction, exceptions, backend, and refresh helpers,
using Django and PyJWT. REST, MCP, and WebSockets use the same code.

The existing `GRAPHQL_JWT` settings, Bearer headers, cookie fallback, payload
claims (`username`, `exp`, `origIat`), handler overrides, and error messages
remain supported. Explicit old default handler paths are translated to the
new implementations. Auth0 and API-key backend behavior is unchanged.

Refresh storage remains **optional**, just as before. Deployments that used
`graphql_jwt.refresh_token` in `INSTALLED_APPS` must replace that entry with
`config.jwt_auth.refresh_token`. Its app label (`refresh_token`), table,
fields, and migration names are preserved, so existing rows and migration
history carry over without a data migration. Custom `JWT_REFRESH_TOKEN_MODEL`
and handler settings still work. Default deployments do not install this app;
requesting only an access token never evaluates the lazy refresh-token value.
Python integrations importing JWT helpers or signals should now import from
`config.jwt_auth` instead of the removed dependency.

## Security hardening

`DepthLimitValidationRule` + `DisableIntrospection` (production) attach via
strawberry's `AddValidationRules` extension, which **appends** to graphql-core's
full spec rule set — the graphene-era "custom rules replace spec rules" trap is
structurally impossible now. The extension is passed as a factory, so each
request gets an independent execution context. The GCS file-URL pre-warm middleware became
`config/graphql/file_url_prewarm.py::FileUrlPrewarmExtension` (installed only
when `FILE_URL_SHARED_CACHE_TTL > 0`).

## Testing

`config/graphql/testing.py` provides a drop-in `graphene.test.Client`
replacement (`Client`, same result-dict shape) plus a `GraphQLTestCase` port
for endpoint-level tests. `schema.execute(...)` → `schema.execute_sync(...)`
(strawberry uses `variable_values=`, not graphene's `variables=`).
Schema inspection tools use Strawberry's underlying `schema._schema`; the
Graphene `schema.graphql_schema` alias has been removed.

`test_api_id_contract.py` pins ID/cursor bytes and connection windows.
`test_jwt_auth_contract.py` and `test_jwt_refresh_contract.py` exercise real
HTTP authentication, old claim layouts, error payloads, lazy refresh creation,
rotation, and persistent model compatibility. Existing auth test assertions
remain unchanged; their imports and patch targets point to the owned runtime.
`tests/architecture/test_graphql_dependencies.py` rejects removed imports and
dependency declarations and checks extension instances are request-scoped.
