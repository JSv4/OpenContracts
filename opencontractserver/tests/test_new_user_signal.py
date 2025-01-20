from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class UserSignalsTestCase(TestCase):
    def setUp(self):
        # Set up arbitrary_function mock
        self.arbitrary_function_patcher = patch(
            "opencontractserver.users.signals.record_event"
        )
        self.mock_arbitrary_function = self.arbitrary_function_patcher.start()

    def tearDown(self):
        self.arbitrary_function_patcher.stop()

    def test_user_created_signal_on_create(self):
        """Test that arbitrary_function is called when a new user is created"""
        User.objects.create(
            username="testuser", email="test@example.com", password="testpass123"
        )

        self.mock_arbitrary_function.assert_called_once_with(
            "user_created", {"user_count": 3}
        )

    def test_user_created_signal_on_update(self):
        """Test that arbitrary_function is not called when a user is updated"""
        # First create the user
        user = User.objects.create(
            username="testuser", email="test@example.com", password="testpass123"
        )

        # Reset the mock to clear the creation call
        self.mock_arbitrary_function.reset_mock()

        # Update the user
        user.email = "newemail@example.com"
        user.save()

        # Verify arbitrary_function was not called
        self.mock_arbitrary_function.assert_not_called()

    def test_user_created_signal_with_multiple_users(self):
        """Test that arbitrary_function is called for each new user created"""
        # Clear the mock to ensure we only check calls from this test
        self.mock_arbitrary_function.reset_mock()

        [
            User.objects.create(
                username=f"testuser{i}",
                email=f"test{i}@example.com",
                password="testpass123",
            )
            for i in range(3)
        ]

        # Verify arbitrary_function was called for each user
        self.assertEqual(self.mock_arbitrary_function.call_count, 3)

        # Get all the calls made to the mock
        actual_calls = self.mock_arbitrary_function.call_args_list

        # Verify all calls used the correct event name
        for call in actual_calls:
            self.assertEqual(call[0][0], "user_created")
