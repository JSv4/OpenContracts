import uuid

from django.apps import AppConfig
from django.db.models.signals import post_save
from django.utils.translation import gettext_lazy as _

from opencontractserver.annotations.models import Annotation


class AnnotationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "opencontractserver.annotations"
    verbose_name = _("Annotations")

    def ready(self):
        try:
            import opencontractserver.annotations.signals  # noqa F401
            from opencontractserver.annotations.signals import process_annot_on_create_atomic

            post_save.connect(
                process_annot_on_create_atomic, sender=Annotation, dispatch_uid=uuid.uuid4()
            )
        except ImportError:
            pass
