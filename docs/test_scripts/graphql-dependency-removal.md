# GraphQL dependency removal verification

## Contract

Remove `graphene`, `graphene-django`, `django-graphql-jwt`, and `graphql-relay`
while preserving authentication, the served SDL, opaque IDs, cursor windows,
and permission boundaries. Keep Strawberry pinned at 0.323.2; separately check
the 0.327.0 upgrade discussed during review.

Implementation and optional refresh-app migration instructions are in
[the architecture guide](../architecture/graphql_strawberry_migration.md).

## Reproduce

Build the Django test image from the changed requirements, then run:

Use a test environment without `DJANGO_SUPERUSER_USERNAME`,
`DJANGO_SUPERUSER_EMAIL`, and `DJANGO_SUPERUSER_PASSWORD`. The bootstrap
migration otherwise creates an `admin` row that collides with privacy-test
fixtures. These variables can be removed for the test subprocess with `env -u`.

```bash
docker compose -f test.yml run --rm django python -m pip check
docker compose -f test.yml run --rm django pytest \
  opencontractserver/tests/architecture/test_graphql_dependencies.py \
  opencontractserver/tests/test_schema_parity.py \
  opencontractserver/tests/test_api_id_contract.py \
  opencontractserver/tests/test_jwt_auth_contract.py \
  opencontractserver/tests/test_jwt_refresh_contract.py \
  opencontractserver/tests/test_coverage_core_relay.py \
  opencontractserver/tests/test_coverage_core_scalars.py \
  opencontractserver/tests/test_security_hardening.py \
  opencontractserver/tests/test_jwt_utils.py \
  opencontractserver/tests/test_token_expiration.py \
  opencontractserver/tests/test_user_mutations_rate_limiting.py \
  opencontractserver/tests/test_websocket_auth.py \
  opencontractserver/tests/permissioning \
  opencontractserver/tests/test_fk_visibility_traversal.py \
  opencontractserver/tests/test_singular_node_idor.py
docker compose -f test.yml run --rm django python scripts/validate_frontend_graphql.py
```

Confirm the four removed modules are absent with `importlib.util.find_spec`
inside the rebuilt image. Do not regenerate the golden SDL to make tests pass.
For the broader suite, include all test modules importing `config.graphql` or
`config.jwt_auth`, every permission/auth/WebSocket test, and tests whose imports
or resolver calls changed. Backend CI runs the full suite.

The refresh tests temporarily enable `config.jwt_auth.refresh_token`, create
its table only in the test database, and remove it afterward. They exercise rows
created from the preserved migration state, token selection/rotation, expiry,
revocation, and `JWT_REUSE_REFRESH_TOKENS`.

## Strawberry upgrade review

The [0.324–0.326 changelog](https://github.com/strawberry-graphql/strawberry/blob/0.327.0/CHANGELOG.md)
raises the Django minimum to 5.2, changes field metadata handling and operation
directive coercion, exposes schema directives through introspection, and closes
an awaitable-permission bypass. This project uses Django 5.2, synchronous service
permission checks, and no custom schema/operation directives.
[0.327.0](https://github.com/strawberry-graphql/strawberry/releases/tag/0.327.0)
bounds parser/validation caches, neither of which is installed here.

The installed 0.323.2 and downloaded 0.327.0 `AddValidationRules` source files
were identical. Passing an extension instance was already deprecated in
0.323.2; the schema now uses a factory and tests verify independent instances.
Run the contract checks above in an isolated 0.327.0 environment as well: source
review alone cannot establish scalar, SDL, permission, or request compatibility.

## Evidence

- Clean baseline: 181 existing schema/auth/Relay/scalar/security tests passed.
  The same tests passed after replacing the dependencies.
- Differential check against the original implementation: 32,400 pagination
  combinations matched, including empty windows, invalid cursors, offsets,
  forward/backward limits, and error messages; malformed ID decoding matched.
- The golden SDL is unchanged. All 292 frontend operations validate, and
  TypeScript compiles without errors.
- A disposable environment with all four packages uninstalled passes
  `pip check` and the new ID, HTTP auth, refresh-storage, and dependency guards.
- Existing auth, token-expiration, WebSocket, and rate-limit assertions were
  compared structurally to the baseline and are unchanged.
- Final Python type checking passes for all 1,584 source files. The verification
  environment uses Django 5.2.16, PyJWT 2.13.0, and graphql-core 3.2.11.
- Strawberry 0.327.0: 248 contract/auth/permission/security tests passed,
  including 10 subtests. Its SDL matches the unchanged golden file.
- Final broad run on Strawberry 0.323.2: **4,634 passed**, 75 subtests passed,
  and one optional measurement-output test skipped across 219 test modules
  (`pytest -n 4 --dist loadscope`, 10m26s). Formatting and lint checks pass.

The first broad run caught a wrong resolver import in a migrated label test
and background-signal leakage from the new optional-app test. Both were fixed;
the final broad run and candidate checks above include those fixes. No auth
assertions were weakened or skipped.
