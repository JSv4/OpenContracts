"""Authentication diagnostic logging contracts."""

from unittest.mock import patch

from django.test import TestCase


class AuthenticationLoggingTests(TestCase):
    def test_api_token_is_absent_from_debug_logs(self):
        from django.test import RequestFactory, override_settings

        from config.graphql_api_token_auth.backends import ApiKeyBackend

        secret = "SYNTHETIC_API_TOKEN_MUST_NOT_APPEAR"
        request = RequestFactory().get(
            "/graphql/", HTTP_AUTHORIZATION=f"Api-Token {secret}"
        )
        with override_settings(API_TOKEN_PREFIX="Api-Token"), patch.object(
            ApiKeyBackend, "authenticate_credentials"
        ), self.assertLogs(
            "config.graphql_api_token_auth.backends", level="DEBUG"
        ) as logs:
            ApiKeyBackend().authenticate(request)
        self.assertNotIn(secret, "\n".join(logs.output))

    def test_auth0_backend_does_not_log_password_kwargs(self):
        from config.graphql_auth0_auth.backends import (
            Auth0RemoteUserJSONWebTokenBackend,
        )

        secret = "SYNTHETIC_PASSWORD_MUST_NOT_APPEAR"
        with self.assertLogs(
            "config.graphql_auth0_auth.backends", level="DEBUG"
        ) as logs:
            Auth0RemoteUserJSONWebTokenBackend().authenticate(
                None, username="synthetic", password=secret
            )
        self.assertNotIn(secret, "\n".join(logs.output))
