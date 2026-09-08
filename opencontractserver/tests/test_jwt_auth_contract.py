"""Exercise the public auth API with real signed tokens and Django requests."""

from datetime import timedelta
from time import time
from unittest.mock import patch

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, TestCase, override_settings

from config.jwt_auth.backends import JSONWebTokenBackend
from config.jwt_auth.exceptions import JSONWebTokenError, JSONWebTokenExpired
from config.jwt_auth.settings import jwt_settings
from config.jwt_auth.shortcuts import get_token
from config.jwt_auth.utils import get_credentials, get_payload, get_user_by_payload
from opencontractserver.utils.ids import to_global_id


class JWTAuthContractTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="jwt_contract", password="contract-password"
        )

    def graphql(self, query, variables=None, **headers):
        response = self.client.post(
            "/graphql/",
            {"query": query, "variables": variables or {}},
            content_type="application/json",
            **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_login_verify_and_authenticated_http_request(self):
        # No refresh-token model is installed by default; selecting only an
        # access token must still work without evaluating a lazy refresh token.
        with patch(
            "config.jwt_auth.refresh_token.shortcuts.create_refresh_token"
        ) as create_refresh:
            response = self.graphql(
                'mutation { tokenAuth(username: "jwt_contract", '
                'password: "contract-password") { token payload refreshExpiresIn '
                "user { id username } } }"
            )
            create_refresh.assert_not_called()
        self.assertNotIn("errors", response)
        auth = response["data"]["tokenAuth"]
        self.assertEqual(auth["user"]["id"], to_global_id("UserType", self.user.pk))
        claims = jwt.decode(auth["token"], settings.SECRET_KEY, algorithms=["HS256"])
        self.assertEqual(claims, auth["payload"])
        self.assertEqual(set(claims), {"username", "exp", "origIat"})
        self.assertEqual(claims["username"], self.user.username)
        self.assertEqual(claims["exp"] - claims["origIat"], 7 * 24 * 60 * 60)
        verified = self.graphql(
            "mutation($token: String!) { verifyToken(token: $token) { payload } }",
            {"token": auth["token"]},
        )
        self.assertEqual(verified["data"]["verifyToken"]["payload"], claims)
        me = self.graphql(
            "{ me { id username } }", HTTP_AUTHORIZATION=f"Bearer {auth['token']}"
        )
        self.assertNotIn("errors", me)
        self.assertEqual(me["data"]["me"]["username"], self.user.username)

    def test_tokens_with_legacy_claims_still_authenticate(self):
        # Issue independently of our helpers, using the existing claim layout.
        token = jwt.encode(
            {"username": self.user.username, "exp": int(time()) + 300, "origIat": 1},
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        request = RequestFactory().get(
            "/graphql/", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        request.user = AnonymousUser()
        self.assertEqual(JSONWebTokenBackend().authenticate(request), self.user)

    def test_expired_and_invalid_signature_keep_http_errors(self):
        expired = get_token(self.user, exp=int(time()) - 60)
        bad_signature = jwt.encode(
            {"username": self.user.username, "exp": int(time()) + 60},
            "a-different-test-signing-key-with-adequate-length",
            algorithm="HS256",
        )
        for token, message in [
            (expired, "Signature has expired"),
            (bad_signature, "Error decoding signature"),
        ]:
            with self.subTest(message=message):
                result = self.graphql(
                    "{ me { id } }", HTTP_AUTHORIZATION=f"Bearer {token}"
                )
                self.assertEqual(
                    result, {"data": None, "errors": [{"message": message}]}
                )

    def test_failed_login_and_missing_refresh_errors(self):
        result = self.graphql(
            'mutation { tokenAuth(username: "jwt_contract", password: "wrong") '
            "{ token } }"
        )
        self.assertEqual(
            result["errors"][0]["message"], "Please enter valid credentials"
        )
        result = self.graphql("mutation { refreshToken { token } }")
        self.assertEqual(result["errors"][0]["message"], "Refresh token is required")

    def test_disabled_user_and_missing_username_keep_errors(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        with self.assertRaisesMessage(JSONWebTokenError, "User is disabled"):
            get_user_by_payload({"username": self.user.username})
        with self.assertRaisesMessage(JSONWebTokenError, "Invalid payload"):
            get_user_by_payload({})

    def test_credentials_precedence_and_cookie_fallback(self):
        request = RequestFactory().get("/", HTTP_AUTHORIZATION="bEaReR header-token")
        request.COOKIES["JWT"] = "cookie-token"
        self.assertEqual(get_credentials(request), "header-token")
        request.META["HTTP_AUTHORIZATION"] = "not a bearer header"
        self.assertEqual(get_credentials(request), "cookie-token")
        with override_settings(GRAPHQL_JWT={"JWT_ALLOW_ARGUMENT": True}):
            self.assertEqual(
                get_credentials(request, input={"token": "argument-token"}),
                "argument-token",
            )

    def test_settings_overrides_and_legacy_handler_paths(self):
        with override_settings(
            SECRET_KEY="temporary-signing-key-with-sufficient-length",
            GRAPHQL_JWT={
                "JWT_PAYLOAD_HANDLER": "graphql_jwt.utils.jwt_payload",
                "JWT_EXPIRATION_DELTA": timedelta(seconds=-60),
                "JWT_VERIFY_EXPIRATION": True,
            },
        ):
            self.assertEqual(jwt_settings.JWT_SECRET_KEY, settings.SECRET_KEY)
            token = get_token(self.user)
            with self.assertRaises(JSONWebTokenExpired):
                get_payload(token)
        self.assertEqual(jwt_settings.JWT_SECRET_KEY, settings.SECRET_KEY)
