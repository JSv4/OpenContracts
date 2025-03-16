import uuid

from django.apps import AppConfig
from django.db.models.signals import post_save
from django.utils.translation import gettext_lazy as _


class DocumentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "opencontractserver.documents"
    verbose_name = _("Documents")

    def ready(self):
        try:
            import opencontractserver.documents.signals  # noqa F401
            from opencontractserver.documents.models import Document
            from opencontractserver.documents.signals import (
                connect_corpus_document_signals,
                process_doc_on_create_atomic,
            )

            # DOCUMENT SIGNALS #########################################################################################
            # When a new doc is created, queue a PAWLS token extract job
            post_save.connect(
                process_doc_on_create_atomic, sender=Document, dispatch_uid=uuid.uuid4()
            )

            # Connect the m2m_changed signal for when documents are added to corpuses
            connect_corpus_document_signals()

        except ImportError:
            pass
