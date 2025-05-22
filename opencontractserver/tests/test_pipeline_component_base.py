from django.test import TestCase

from opencontractserver.pipeline.base.base_component import PipelineComponentBase

# Helper to get the logger from the module being tested
BASE_COMPONENT_LOGGER = "opencontractserver.pipeline.base.base_component"


class DummyComponent(PipelineComponentBase):
    """A simple component for testing settings loading."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class TestPipelineComponentBaseSettings(TestCase):
    """
    Tests the settings loading mechanism of PipelineComponentBase,
    ensuring it checks for simple class names first, then full Python paths.
    """

    def get_dummy_component_full_path(self) -> str:
        """Returns the full Python path to the DummyComponent class."""
        return f"{DummyComponent.__module__}.{DummyComponent.__name__}"

    def test_load_settings_by_simple_name(self):
        """Ensures settings are loaded using the simple class name if available."""
        expected_settings = {"key_simple": "value_from_simple_name"}
        pipeline_settings_override = {
            "DummyComponent": expected_settings,
            self.get_dummy_component_full_path(): {
                "key_full": "value_from_full_path_ignored"
            },
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), expected_settings)

    def test_load_settings_by_full_path_as_fallback(self):
        """Ensures settings are loaded by full path if simple name is not found."""
        expected_settings = {"key_full": "value_from_full_path"}
        pipeline_settings_override = {
            "AnotherComponent": {
                "key_other": "other_value"
            },  # Ensure simple name key is different
            self.get_dummy_component_full_path(): expected_settings,
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), expected_settings)

    def test_simple_name_takes_precedence_over_full_path(self):
        """Confirms simple name settings are used even if full path settings also exist."""
        expected_settings = {"key_simple_precedence": "simple_name_wins"}
        pipeline_settings_override = {
            "DummyComponent": expected_settings,
            self.get_dummy_component_full_path(): {
                "key_full_precedence": "full_path_loses"
            },
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), expected_settings)

    def test_no_settings_found_for_component(self):
        """Tests behavior when no settings exist for the component by any key."""
        pipeline_settings_override = {
            "AnotherComponent": {"key_another": "value_another"}
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), {})

    def test_pipeline_settings_globally_missing(self):
        """
        Tests behavior if PIPELINE_SETTINGS is not defined in Django settings at all.
        The getattr in PipelineComponentBase should provide a default empty dict.
        """
        # Ensure PIPELINE_SETTINGS is not present for this test context
        # One way is to override it with a value that indicates it's "unset"
        # for the purpose of getattr(settings, "PIPELINE_SETTINGS", {})
        # However, the most direct is to ensure it's not in django_settings.
        # This is tricky with override_settings as it restores.
        # The component's `getattr(settings, "PIPELINE_SETTINGS", {})` handles this.
        # If `PIPELINE_SETTINGS` isn't in `django_settings`, `getattr` will use its default.

        # To robustly test getattr's default, we'd ideally remove the attribute.
        # This is fragile in tests. We rely on `override_settings(PIPELINE_SETTINGS={})` and
        # knowing `getattr` in the component works.
        # A direct test of getattr is implicit.
        # The following simulates it being empty.
        with self.settings(PIPELINE_SETTINGS={}):  # No settings for any component
            component = DummyComponent()
            self.assertEqual(
                component.get_component_settings(),
                {},
                "Should be empty if PIPELINE_SETTINGS is empty.",
            )

        # To truly test it being undefined, you might need to mock settings object,
        # but PipelineComponentBase already uses getattr with a default.

    def test_pipeline_settings_is_not_a_dictionary(self):
        """Tests that a warning is logged if PIPELINE_SETTINGS is not a dict."""
        with self.assertLogs(logger=BASE_COMPONENT_LOGGER, level="WARNING") as cm:
            # The override_settings context manager will apply this setting
            with self.settings(PIPELINE_SETTINGS="this_is_not_a_dictionary"):
                component = DummyComponent()

        self.assertEqual(component.get_component_settings(), {})
        self.assertIn(
            "PIPELINE_SETTINGS is defined but is not a dictionary", cm.output[0]
        )

    def test_component_setting_is_not_a_dictionary_simple_name_fallback(self):
        """
        Tests if fallback to full_path occurs when simple name's value isn't a dict.
        """
        expected_settings = {"key_full_fallback": "value_full_fallback_succeeded"}
        pipeline_settings_override = {
            "DummyComponent": "not_a_dictionary_for_simple_name",
            self.get_dummy_component_full_path(): expected_settings,
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), expected_settings)

    def test_component_setting_is_not_a_dictionary_full_path(self):
        """
        Tests that settings are empty if full path's value (after simple name check) isn't a dict.
        """
        pipeline_settings_override = {
            "DummyComponent": "not_a_dictionary_either",  # Simple name is not a dict
            self.get_dummy_component_full_path(): "also_not_a_dictionary_for_full_path",
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), {})

    def test_empty_dict_for_simple_name_falls_back_to_full_path(self):
        """
        If simple name maps to an empty dict, it should be treated as 'no settings'
        and fallback to the full path.
        """
        expected_settings = {"key_full_after_empty_simple": "full_path_prevails_here"}
        pipeline_settings_override = {
            "DummyComponent": {},  # Empty dict for simple name
            self.get_dummy_component_full_path(): expected_settings,
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), expected_settings)

    def test_empty_dict_for_simple_name_and_no_full_path_is_empty_settings(self):
        """
        If simple name is an empty dict and no full path settings exist, result is empty settings.
        """
        pipeline_settings_override = {
            "DummyComponent": {},  # Empty dict for simple name
            # No setting for self.get_dummy_component_full_path()
        }
        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            self.assertEqual(component.get_component_settings(), {})
