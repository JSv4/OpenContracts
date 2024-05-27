from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CorpusesConfig(AppConfig):

    default_auto_field = "django.db.models.BigAutoField"
    name = "opencontractserver.corpuses"
    verbose_name = _("Corpuses")

    def ready(self):
        try:
            import opencontractserver.corpuses.signals  # noqa F401
        except ImportError:
            pass
