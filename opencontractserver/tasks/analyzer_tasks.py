import logging

from django.contrib.auth import get_user_model
from django.utils import timezone

from config import celery_app
from opencontractserver.analyzer.models import GremlinEngine
from opencontractserver.analyzer.utils import get_gremlin_manifests

# Excellent django logging guidance here: https://docs.python.org/3/howto/logging-cookbook.html
from opencontractserver.utils.analyzer_utils import (
    create_analysis_for_corpus_with_analyzer,
    import_annotations_from_analysis,
    install_analyzers,
)
from opencontractserver.utils.data_types import (
    AnalyzerManifest,
    OpenContractsGeneratedCorpusPythonType,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@celery_app.task()
def import_analysis(
    creator_id: int | str,
    analysis_id: int | str,
    analysis_results: OpenContractsGeneratedCorpusPythonType,
) -> bool:

    return import_annotations_from_analysis(
        analysis_id=analysis_id,
        creator_id=creator_id,
        analysis_results=analysis_results,
    )


@celery_app.task()
def start_analysis(
    analysis_id: str,
    user_id: int | str,
) -> bool:

    create_analysis_for_corpus_with_analyzer(
        analysis_id=analysis_id,
        user_id=user_id,
    )

    return True


@celery_app.task()
def request_gremlin_manifest(gremlin_id: str | int) -> list[AnalyzerManifest]:

    logger.info("request_gremlin_manifest() - Start...")

    gremlin = GremlinEngine.objects.get(id=gremlin_id)

    gremlin.install_started = timezone.now()
    gremlin.save()

    analyzer_manifests = get_gremlin_manifests(gremlin_id)
    # logger.info(
    #     f"request_gremlin_manifest() - analyzer_manifests: {analyzer_manifests}"
    # )
    logger.info("request_gremlin_manifest() - End.")

    return analyzer_manifests


@celery_app.task()
def install_analyzer_task(
    analyzer_manifests: list[AnalyzerManifest],
    gremlin_id: int,
) -> list[int]:

    # logger.info(f"install_analyzer_task() - analyzer_manifests: {analyzer_manifests}")

    gremlin = GremlinEngine.objects.get(id=gremlin_id)

    install_response = install_analyzers(
        gremlin_id=gremlin_id,
        analyzer_manifests=analyzer_manifests,
    )

    gremlin.install_completed = timezone.now()
    gremlin.save()

    return install_response
