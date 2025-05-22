import logging
from abc import ABC

from django.conf import settings

logger = logging.getLogger(__name__)


class PipelineComponentBase(ABC):
    """
    Base class for pipeline components, providing automatic settings injection.

    Pipeline components inheriting from this class will have settings
    defined in Django's `settings.PIPELINE_SETTINGS` dictionary automatically
    made available to their operative methods.

    The `PIPELINE_SETTINGS` dictionary should be structured as follows:
    PIPELINE_SETTINGS = {
        "full.python.path.to.ComponentClass": {
            "setting_key_1": "value1",
            "setting_key_2": True,
            # ...
        },
        # ...
    }
    """

    def __init__(self, **kwargs):
        """
        Initializes the PipelineComponentBase.
        Any kwargs passed are typically for other base classes in an MRO,
        or can be used by subclasses after calling super().__init__().
        """
        super().__init__()  # Ensures MRO is handled correctly, e.g. if ABC has __init__
        self._component_settings: dict = {}
        self._load_component_settings()

    def _load_component_settings(self):
        """
        Loads settings for this component from Django settings.
        It first tries the simple class name, then the full class path.
        """
        simple_class_name = self.__class__.__name__
        full_class_path = f"{self.__class__.__module__}.{self.__class__.__name__}"

        # Ensure settings are loaded, especially in non-Django managed scripts or tests
        if not settings.configured:
            logger.warning(
                "Django settings not configured. PIPELINE_SETTINGS will not be available."
            )
            # Depending on strictness, you might want to raise an error or allow proceeding
            # For now, we'll allow proceeding, _component_settings will remain empty.
            # In a typical Django app flow, settings would be configured.
            # Consider if `settings.configure()` needs to be called in specific entry points
            # if this code runs outside the standard manage.py/WSGI/ASGI flow.
            return  # Return early if settings aren't configured, _component_settings remains {}

        pipeline_settings_dict = getattr(settings, "PIPELINE_SETTINGS", {})

        if not isinstance(pipeline_settings_dict, dict):
            logger.warning(
                f"PIPELINE_SETTINGS is defined but is not a dictionary. "
                f"Settings for {simple_class_name} (or {full_class_path}) will not be loaded."
            )
            return

        # Try simple class name first
        component_settings = pipeline_settings_dict.get(simple_class_name)
        if (
            isinstance(component_settings, dict) and component_settings
        ):  # Check if it's a non-empty dict
            self._component_settings = component_settings
            logger.debug(
                f"Loaded settings for component using simple name '{simple_class_name}': {self._component_settings}"
            )
        else:
            # Fallback to full class path
            component_settings_fallback = pipeline_settings_dict.get(full_class_path)
            if (
                isinstance(component_settings_fallback, dict)
                and component_settings_fallback
            ):
                self._component_settings = component_settings_fallback
                logger.debug(
                    f"Loaded settings for component using full path '{full_class_path}': {self._component_settings}"
                )
            else:
                logger.debug(
                    f"No specific settings found for component using simple name '{simple_class_name}' "
                    f"or full path '{full_class_path}' in PIPELINE_SETTINGS."
                )
        # If neither key yields settings, self._component_settings remains the default {}

    def get_component_settings(self) -> dict:
        """
        Returns a copy of the settings loaded for this component.
        """
        return self._component_settings.copy()
