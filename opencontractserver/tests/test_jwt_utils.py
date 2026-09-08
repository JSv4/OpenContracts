"""
Tests for unified JWT authentication utilities.

This module tests config/jwt_utils.py which provides the single entry point
for JWT token validation across REST, GraphQL, and WebSocket API surfaces.

Tests cover:
1. Non-Auth0 mode (graphql_jwt with HS256)
2. Auth0 mode switching
3. Token validation errors (expired, invalid, user not found)
4. REST API authentication class
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from config.jwt_auth.exceptions import JSONWebTokenError, JSONWebTokenExpired
from config.jwt_utils import (
    _validate_auth0_token,
    _validate_graphql_jwt_token,
    get_user_from_jwt_token,
)
from config.rest_jwt_auth import GraphQLJWTAuthentication

User = get_user_model()


class TestGetUserFromJwtToken(TestCase):
    """Tests for the unified get_user_from_jwt_token function."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="jwt_test_user",
            email="jwt_test@example.com",
            password="testpass123",
        )

    @patch("config.jwt_utils._validate_graphql_jwt_token")
    @override_settings(USE_AUTH0=False)
    def test_non_auth0_mode_uses_graphql_jwt(self, mock_validate):
        """Non-Auth0 mode should use graphql_jwt validation."""
        mock_validate.return_value = self.user

        result = get_user_from_jwt_token("test_token")

        self.assertEqual(result, self.user)
        mock_validate.assert_called_once_with("test_token")

    @patch("config.jwt_utils._validate_auth0_token")
    @override_settings(USE_AUTH0=True)
    def test_auth0_mode_uses_auth0_validation(self, mock_validate):
        """Auth0 mode should use Auth0 token validation."""
        mock_validate.return_value = self.user

        result = get_user_from_jwt_token("auth0_token")

        self.assertEqual(result, self.user)
        mock_validate.assert_called_once_with("auth0_token")


class TestValidateGraphqlJwtToken(TestCase):
    """Tests for _validate_graphql_jwt_token function."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="graphql_jwt_user",
            email="graphql@example.com",
            password="testpass123",
        )
        cls.inactive_user = User.objects.create_user(
            username="inactive_user",
            email="inactive@example.com",
            password="testpass123",
            is_active=False,
        )

    @patch("config.jwt_auth.utils.get_user_by_payload")
    @patch("config.jwt_auth.utils.get_payload")
    def test_valid_token_returns_user(self, mock_get_payload, mock_get_user):
        """Valid token should return the authenticated user."""
        mock_get_payload.return_value = {"username": "graphql_jwt_user"}
        mock_get_user.return_value = self.user

        result = _validate_graphql_jwt_token("valid_token")

        self.assertEqual(result, self.user)
        mock_get_payload.assert_called_once_with("valid_token")

    @patch("config.jwt_auth.utils.get_payload")
    def test_expired_token_raises_exception(self, mock_get_payload):
        """Expired token should raise JSONWebTokenExpired."""
        mock_get_payload.side_effect = JSONWebTokenExpired()

        with self.assertRaises(JSONWebTokenExpired):
            _validate_graphql_jwt_token("expired_token")

    @patch("config.jwt_auth.utils.get_payload")
    def test_invalid_token_raises_exception(self, mock_get_payload):
        """Invalid token should raise JSONWebTokenError."""
        mock_get_payload.side_effect = JSONWebTokenError("Invalid token")

        with self.assertRaises(JSONWebTokenError):
            _validate_graphql_jwt_token("invalid_token")

    @patch("config.jwt_auth.utils.get_user_by_payload")
    @patch("config.jwt_auth.utils.get_payload")
    def test_user_not_found_raises_exception(self, mock_get_payload, mock_get_user):
        """Token for non-existent user should raise JSONWebTokenError."""
        mock_get_payload.return_value = {"username": "nonexistent"}
        mock_get_user.return_value = None

        with self.assertRaises(JSONWebTokenError) as context:
            _validate_graphql_jwt_token("token_for_missing_user")

        self.assertIn("User not found", str(context.exception))

    @patch("config.jwt_auth.utils.get_user_by_payload")
    @patch("config.jwt_auth.utils.get_payload")
    def test_inactive_user_raises_exception(self, mock_get_payload, mock_get_user):
        """Token for inactive user should raise JSONWebTokenError."""
        mock_get_payload.return_value = {"username": "inactive_user"}
        mock_get_user.return_value = self.inactive_user

        with self.assertRaises(JSONWebTokenError) as context:
            _validate_graphql_jwt_token("token_for_inactive_user")

        self.assertIn("disabled", str(context.exception))


class TestValidateAuth0Token(TestCase):
    """Tests for _validate_auth0_token function."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="auth0_user",
            email="auth0@example.com",
            password="testpass123",
        )
        cls.inactive_user = User.objects.create_user(
            username="auth0_inactive",
            email="auth0_inactive@example.com",
            password="testpass123",
            is_active=False,
        )

    @patch("config.graphql_auth0_auth.utils.get_user_by_token")
    def test_valid_auth0_token_returns_user(self, mock_get_user):
        """Valid Auth0 token should return the authenticated user."""
        mock_get_user.return_value = self.user

        result = _validate_auth0_token("valid_auth0_token")

        self.assertEqual(result, self.user)
        mock_get_user.assert_called_once_with("valid_auth0_token")

    @patch("config.graphql_auth0_auth.utils.get_user_by_token")
    def test_expired_auth0_token_raises_exception(self, mock_get_user):
        """Expired Auth0 token should raise JSONWebTokenExpired."""
        mock_get_user.side_effect = JSONWebTokenExpired()

        with self.assertRaises(JSONWebTokenExpired):
            _validate_auth0_token("expired_auth0_token")

    @patch("config.graphql_auth0_auth.utils.get_user_by_token")
    def test_user_not_found_raises_exception(self, mock_get_user):
        """Auth0 token for non-existent user should raise JSONWebTokenError."""
        mock_get_user.return_value = None

        with self.assertRaises(JSONWebTokenError) as context:
            _validate_auth0_token("token_for_missing_user")

        self.assertIn("User not found", str(context.exception))

    @patch("config.graphql_auth0_auth.utils.get_user_by_token")
    def test_inactive_auth0_user_raises_exception(self, mock_get_user):
        """Auth0 token for inactive user should raise JSONWebTokenError."""
        mock_get_user.return_value = self.inactive_user

        with self.assertRaises(JSONWebTokenError) as context:
            _validate_auth0_token("token_for_inactive_user")

        self.assertIn("disabled", str(context.exception))


class TestGraphQLJWTAuthentication(TestCase):
    """Tests for the REST API JWT authentication class."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="rest_jwt_user",
            email="rest@example.com",
            password="testpass123",
        )

    def setUp(self):
        self.factory = APIRequestFactory()
        self.auth = GraphQLJWTAuthentication()

    def test_no_auth_header_returns_none(self):
        """Request without Authorization header should return None."""
        request = self.factory.get("/api/test/")

        result = self.auth.authenticate(request)

        self.assertIsNone(result)

    def test_non_jwt_auth_header_returns_none(self):
        """Request with non-JWT Authorization header should return None."""
        request = self.factory.get(
            "/api/test/", HTTP_AUTHORIZATION="Basic dXNlcjpwYXNz"
        )

        result = self.auth.authenticate(request)

        self.assertIsNone(result)

    def test_jwt_keyword_accepted(self):
        """Request with 'JWT' keyword should be processed."""
        with patch.object(self.auth, "_authenticate_token") as mock_auth:
            mock_auth.return_value = (self.user, "test_token")
            request = self.factory.get(
                "/api/test/", HTTP_AUTHORIZATION="JWT test_token"
            )

            result = self.auth.authenticate(request)

            self.assertEqual(result, (self.user, "test_token"))
            mock_auth.assert_called_once_with("test_token")

    def test_bearer_keyword_accepted(self):
        """Request with 'Bearer' keyword should be processed."""
        with patch.object(self.auth, "_authenticate_token") as mock_auth:
            mock_auth.return_value = (self.user, "bearer_token")
            request = self.factory.get(
                "/api/test/", HTTP_AUTHORIZATION="Bearer bearer_token"
            )

            result = self.auth.authenticate(request)

            self.assertEqual(result, (self.user, "bearer_token"))
            mock_auth.assert_called_once_with("bearer_token")

    def test_missing_token_raises_error(self):
        """Authorization header with keyword but no token should raise error."""
        from rest_framework.exceptions import AuthenticationFailed

        request = self.factory.get("/api/test/", HTTP_AUTHORIZATION="JWT ")

        with self.assertRaises(AuthenticationFailed) as context:
            self.auth.authenticate(request)

        self.assertIn("No token provided", str(context.exception))

    def test_token_with_spaces_raises_error(self):
        """Token containing spaces should raise error."""
        from rest_framework.exceptions import AuthenticationFailed

        request = self.factory.get(
            "/api/test/", HTTP_AUTHORIZATION="JWT token with spaces"
        )

        with self.assertRaises(AuthenticationFailed) as context:
            self.auth.authenticate(request)

        self.assertIn("should not contain spaces", str(context.exception))

    @patch("config.rest_jwt_auth.get_user_from_jwt_token")
    def test_valid_token_returns_user_tuple(self, mock_get_user):
        """Valid token should return (user, token) tuple."""
        mock_get_user.return_value = self.user
        request = self.factory.get("/api/test/", HTTP_AUTHORIZATION="JWT valid_token")

        result = self.auth.authenticate(request)

        self.assertEqual(result, (self.user, "valid_token"))
        mock_get_user.assert_called_once_with("valid_token")

    @patch("config.rest_jwt_auth.get_user_from_jwt_token")
    def test_expired_token_raises_auth_failed(self, mock_get_user):
        """Expired token should raise AuthenticationFailed."""
        from rest_framework.exceptions import AuthenticationFailed

        mock_get_user.side_effect = JSONWebTokenExpired()
        request = self.factory.get("/api/test/", HTTP_AUTHORIZATION="JWT expired_token")

        with self.assertRaises(AuthenticationFailed) as context:
            self.auth.authenticate(request)

        self.assertIn("expired", str(context.exception))

    @patch("config.rest_jwt_auth.get_user_from_jwt_token")
    def test_invalid_token_raises_auth_failed(self, mock_get_user):
        """Invalid token should raise AuthenticationFailed."""
        from rest_framework.exceptions import AuthenticationFailed

        mock_get_user.side_effect = JSONWebTokenError("Invalid signature")
        request = self.factory.get("/api/test/", HTTP_AUTHORIZATION="JWT invalid_token")

        with self.assertRaises(AuthenticationFailed) as context:
            self.auth.authenticate(request)

        self.assertIn("Invalid token", str(context.exception))

    def test_authenticate_header_returns_keyword(self):
        """authenticate_header should return the keyword for WWW-Authenticate."""
        request = self.factory.get("/api/test/")

        result = self.auth.authenticate_header(request)

        self.assertEqual(result, "Bearer")
