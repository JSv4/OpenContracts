"""Optional refresh storage retains its table, migration history, and API."""

from contextlib import ExitStack
from datetime import timedelta
from typing import TYPE_CHECKING
from unittest.mock import patch

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.loader import MigrationLoader
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from config.jwt_auth.refresh_token.shortcuts import (
    create_refresh_token,
    get_refresh_token,
)

if TYPE_CHECKING:
    from config.jwt_auth.refresh_token.models import RefreshToken


@override_settings(
    INSTALLED_APPS=[*settings.INSTALLED_APPS, "config.jwt_auth.refresh_token"]
)
class RefreshTokenContractTests(TransactionTestCase):
    model: type["RefreshToken"]

    @classmethod
    def setUpClass(cls):
        # Installing the optional app rebuilds Django's registry. Existing
        # apps are already initialized: rerunning their ready() hooks would
        # reconnect processing signals disabled by the session test fixtures
        # and leak background jobs into subsequent auth/WebSocket tests.
        with ExitStack() as initialized_apps:
            for app in apps.get_app_configs():
                initialized_apps.enter_context(patch.object(type(app), "ready"))
            super().setUpClass()
        from config.jwt_auth.refresh_token.models import RefreshToken

        cls.model = RefreshToken
        # This app is optional and absent when pytest initially creates its DB.
        with connection.schema_editor() as editor:
            editor.create_model(cls.model)

    @classmethod
    def tearDownClass(cls):
        try:
            with connection.schema_editor() as editor:
                editor.delete_model(cls.model)
        finally:
            super().tearDownClass()

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="refresh_contract", password="contract-password"
        )

    def graphql(self, query, variables=None):
        response = self.client.post(
            "/graphql/",
            {"query": query, "variables": variables or {}},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def refresh(self, token):
        return self.graphql(
            "mutation($token: String!) { refreshToken(refreshToken: $token) "
            "{ token refreshToken payload refreshExpiresIn } }",
            {"token": token},
        )

    def test_storage_and_migration_identity_are_preserved(self):
        self.assertEqual(self.model._meta.label, "refresh_token.RefreshToken")
        self.assertEqual(self.model._meta.db_table, "refresh_token_refreshtoken")
        state = MigrationLoader(connection).project_state(
            [("refresh_token", "0002_auto_20190130_0900")]
        )
        old_model = state.apps.get_model("refresh_token", "RefreshToken")
        self.assertEqual(
            {f.column: f.get_internal_type() for f in old_model._meta.fields},
            {f.column: f.get_internal_type() for f in self.model._meta.fields},
        )
        # A row persisted with the existing layout remains usable.
        old_model.objects.create(user_id=self.user.pk, token="previously-issued-token")
        token = get_refresh_token("previously-issued-token")
        self.assertEqual(token.user_id, self.user.pk)
        self.assertNotIn("errors", self.refresh(token.token))

    def test_login_selecting_refresh_token_persists_then_rotates_it(self):
        result = self.graphql(
            'mutation { tokenAuth(username: "refresh_contract", '
            'password: "contract-password") { token refreshToken } }'
        )
        self.assertNotIn("errors", result)
        token = result["data"]["tokenAuth"]["refreshToken"]
        self.assertEqual(len(token), 40)
        self.assertEqual(self.model.objects.count(), 1)
        refreshed = self.refresh(token)
        self.assertNotIn("errors", refreshed)
        issued = refreshed["data"]["refreshToken"]
        self.assertNotEqual(issued["refreshToken"], token)
        self.assertEqual(issued["payload"]["username"], self.user.username)
        self.assertEqual(self.model.objects.count(), 2)
        # Rotation has historically retained the old token until it expires
        # or is revoked explicitly; do not silently change that behavior.
        self.assertIsNone(get_refresh_token(token).revoked)

    def test_unknown_revoked_and_expired_token_errors(self):
        unknown = self.refresh("unknown")
        self.assertEqual(unknown["errors"][0]["message"], "Invalid refresh token")
        revoked = create_refresh_token(self.user)
        revoked.revoke()
        self.assertEqual(
            self.refresh(revoked.token)["errors"][0]["message"], "Invalid refresh token"
        )
        expired = create_refresh_token(self.user)
        self.model.objects.filter(pk=expired.pk).update(
            created=timezone.now() - timedelta(days=15)
        )
        self.assertEqual(
            self.refresh(expired.token)["errors"][0]["message"],
            "Refresh token is expired",
        )

    def test_reuse_setting_rotates_existing_record(self):
        token = create_refresh_token(self.user)
        old_value = token.token
        with override_settings(
            GRAPHQL_JWT={**settings.GRAPHQL_JWT, "JWT_REUSE_REFRESH_TOKENS": True}
        ):
            result = self.refresh(old_value)
        self.assertNotIn("errors", result)
        token.refresh_from_db()
        self.assertEqual(token.token, result["data"]["refreshToken"]["refreshToken"])
        self.assertNotEqual(token.token, old_value)
        self.assertEqual(self.model.objects.count(), 1)
