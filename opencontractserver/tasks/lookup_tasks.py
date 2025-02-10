from config import celery_app
from opencontractserver.types.dicts import LabelLookupPythonType
from opencontractserver.types.enums import AnnotationFilterMode
from opencontractserver.utils.etl import build_label_lookups


@celery_app.task()
def build_label_lookups_task(
    corpus_id: int,
    analysis_ids: list[int] | None = None,
    annotation_filter_mode: AnnotationFilterMode = AnnotationFilterMode.CORPUS_LABELSET_ONLY,
) -> LabelLookupPythonType:
    """
    Builds label lookups for the downstream tasks. By default, we only look at
    labels from the Corpus's assigned LabelSet. If analysis_ids are provided
    and the annotation_filter_mode is:
      - "CORPUS_LABELSET_PLUS_ANALYSES": we combine both the corpus label set and
        any labels discovered in the specified analyses
      - "ANALYSES_ONLY": we consider label references solely from the analyses
      - "CORPUS_LABELSET_ONLY" (default): we only consider the corpus's label set
    """
    return build_label_lookups(
        corpus_id=corpus_id,
        analysis_ids=analysis_ids,
        annotation_filter_mode=annotation_filter_mode,
    )
