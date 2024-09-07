import logging

from django.db import transaction
from django.utils import timezone

from opencontractserver.analyzer.models import Analysis
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


def create_and_setup_analysis(
    analyzer, user_id, corpus_id=None, doc_ids=None, corpus_action=None
):
    with transaction.atomic():
        analysis, created = Analysis.objects.get_or_create(
            analyzer=analyzer,
            analyzed_corpus_id=corpus_id,
            creator_id=user_id,
            corpus_action=corpus_action,
        )
        analysis.analysis_started = timezone.now()

        # If this already existed, make sure to reset completion time
        if not created:
            analysis.analysis_completed = None

        analysis.save()

        set_permissions_for_obj_to_user(user_id, analysis, [PermissionTypes.CRUD])

        if doc_ids is not None:
            print(f"Add doc_ids {doc_ids} to analysis.analyzed_documents")
            analysis.analyzed_documents.add(*doc_ids)

    logger.info(f"Created analysis: {analysis.id} for analyzer: {analyzer.id}")

    return analysis
