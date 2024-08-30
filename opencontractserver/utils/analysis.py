import logging
from django.db import transaction
from django.utils import timezone
from opencontractserver.analyzer.models import Analysis
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)

def create_and_setup_analysis(analyzer, corpus_id, user_id, doc_ids=None, corpus_action=None):
    with transaction.atomic():
        analysis = Analysis.objects.create(
            analyzer=analyzer,
            analyzed_corpus_id=corpus_id,
            creator_id=user_id,
            analysis_started=timezone.now(),
            corpus_action=corpus_action
        )
        set_permissions_for_obj_to_user(user_id, analysis, [PermissionTypes.CRUD])

        if doc_ids:
            analysis.analyzed_documents.add(*doc_ids)

    logger.info(f"Created analysis: {analysis.id} for analyzer: {analyzer.id}")

    return analysis
