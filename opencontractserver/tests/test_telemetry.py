from datetime import datetime
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from config.telemetry import record_event
from opencontractserver.users.models import Installation


class TelemetryTestCase(TestCase):
    def setUp(self):
        # Mock Installation instance
        self.mock_installation = Installation.get()
        self.installation_id = self.mock_installation.id

        # Set up PostHog mock
        self.posthog_patcher = patch("config.telemetry.Posthog")
        self.mock_posthog_class = self.posthog_patcher.start()
        self.mock_posthog = MagicMock()
        self.mock_posthog_class.return_value = self.mock_posthog

    def tearDown(self):
        self.posthog_patcher.stop()

    def test_record_event_success(self):
        """Test successful event recording with all conditions met"""

        with override_settings(
            TELEMETRY_ENABLED=True,
            POSTHOG_API_KEY="test-key",
            POSTHOG_HOST="https://test.host",
        ):
            result = record_event("test_event", {"test_prop": "value"})

        self.assertTrue(result)
        self.mock_posthog.capture.assert_called_once()

        # Verify the capture call arguments
        call_args = self.mock_posthog.capture.call_args[1]
        self.assertEqual(call_args["distinct_id"], str(self.installation_id))
        self.assertEqual(call_args["event"], "opencontracts.test_event")
        self.assertEqual(call_args["properties"]["package"], "opencontracts")
        self.assertEqual(
            call_args["properties"]["installation_id"], str(self.installation_id)
        )
        self.assertEqual(call_args["properties"]["test_prop"], "value")
        self.assertIn("timestamp", call_args["properties"])

        # Verify timestamp format
        timestamp = datetime.fromisoformat(call_args["properties"]["timestamp"])
        self.assertIsNotNone(timestamp.tzinfo)

    def test_record_event_telemetry_disabled(self):
        """Test when telemetry is disabled"""

        with override_settings(TELEMETRY_ENABLED=False):
            result = record_event("test_event")

        self.assertFalse(result)
        self.mock_posthog.capture.assert_not_called()

    def test_record_event_installation_inactive(self):
        """Test when installation exists but is inactive"""

        with override_settings(TELEMETRY_ENABLED=False):
            result = record_event("test_event")

        self.assertFalse(result)
        self.mock_posthog.capture.assert_not_called()

    def test_record_event_posthog_error(self):
        """Test when PostHog client raises an error"""
        self.mock_posthog.capture.side_effect = Exception("PostHog Error")

        with override_settings(TELEMETRY_ENABLED=True):
            result = record_event("test_event")

        self.assertFalse(result)

    def test_record_event_without_properties(self):
        """Test event recording without additional properties"""

        with override_settings(TELEMETRY_ENABLED=True):
            result = record_event("test_event")

        self.assertTrue(result)
        self.mock_posthog.capture.assert_called_once()

        # Verify only default properties are present
        properties = self.mock_posthog.capture.call_args[1]["properties"]
        self.assertEqual(
            set(properties.keys()), {"package", "timestamp", "installation_id"}
        )
