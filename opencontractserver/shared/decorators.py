import json
import logging
from functools import wraps

from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from opencontractserver.analyzer.models import Analysis
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import OpenContractsAnnotationPythonType
from opencontractserver.types.enums import LabelType
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict

MAX_DELAY = 1800  # 30 minutes
INITIAL_DELAY = 30  # 30 seconds
DELAY_INCREMENT = 300  # 5 minutes

logger = logging.getLogger(__name__)


def doc_analyzer_task(max_retries=None):
    def decorator(func):
        @shared_task(bind=True, queue="low_priority", max_retries=max_retries)
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            doc_id = kwargs.get("doc_id")
            corpus_id = kwargs.get("corpus_id")
            analysis_id = kwargs.get("analysis_id")

            logger.info(f"Doc analyzer task doc id: {doc_id}")

            if not doc_id:
                raise ValueError("doc_id is required for doc_analyzer_task")

            if not analysis_id:
                raise ValueError("analysis_id is required for doc_analyzer_task")

            try:
                doc = Document.objects.get(id=doc_id)
            except ObjectDoesNotExist:
                raise ValueError(f"Document with id {doc_id} does not exist")

            if corpus_id:
                try:
                    Corpus.objects.get(id=corpus_id)
                except ObjectDoesNotExist:
                    raise ValueError(f"Corpus with id {corpus_id} does not exist")

            if analysis_id:
                try:
                    analysis = Analysis.objects.get(id=analysis_id)
                except ObjectDoesNotExist:
                    raise ValueError(f"Analysis with id {analysis_id} does not exist")
            else:
                analysis = None

            logger.info(f"Doc {doc_id} backend lock: {doc.backend_lock}")
            if doc.backend_lock:
                retry_count = self.request.retries
                logger.info(f"\tRetry count: {retry_count}")
                delay = min(INITIAL_DELAY + (retry_count * DELAY_INCREMENT), MAX_DELAY)
                logger.info(f"\tNew delay: {delay}")

                # If we've reached MAX_DELAY, reset the retry count
                if delay >= MAX_DELAY:
                    delay = INITIAL_DELAY

                logger.info("Starting retry...")
                raise self.retry(countdown=delay)

            try:
                # Retrieve necessary file contents
                pdf_file_bytes = doc.pdf_file.read()
                txt_extract = (
                    doc.txt_extract_file.read().decode("utf-8")
                    if doc.txt_extract_file
                    else None
                )
                pawls_parse = (
                    json.loads(doc.pawls_parse_file.read().decode("utf-8"))
                    if doc.pawls_parse_file
                    else None
                )

                logger.info(
                    "Retrieved pdf_file_bytes {type(pdf_file_bytes)}, txt_extract {type(txt_extract)}, pawls_parse "
                    "({type(pawls_parse)})"
                )

                # Call the wrapped function with the retrieved data
                result = func(
                    pdf_file_bytes=pdf_file_bytes,
                    txt_extract=txt_extract,
                    pawls_parse=pawls_parse,
                    *args,
                    **kwargs,
                )

                logger.info(f"Function result: {result}")

                # TODO - use PlasmaPDF to accept raw spans and convert them to proper OpenContractsAnnotationPythonType

                if not isinstance(result, tuple) or len(result) != 4:
                    raise ValueError(
                        "Function must return a tuple of (List[str], List[OpenContractsAnnotationPythonType], "
                        "List[Dict[str, Any]], bool)"
                    )

                doc_annotations, text_annotations, metadata, task_pass = result

                if not isinstance(task_pass, bool):
                    raise ValueError(
                        "Fourth element of the return value must be true/false. False for failure of some kind "
                        "(for tests)."
                    )

                # Process annotations if task passed
                if task_pass and analysis:

                    # Check returned types if passed.
                    if not isinstance(doc_annotations, list) or (
                        len(doc_annotations) > 0
                        and not all(isinstance(a, str) for a in doc_annotations)
                    ):
                        raise ValueError(
                            "First element of the tuple must be a list of doc labels"
                        )

                    if not isinstance(text_annotations, list):
                        raise ValueError(
                            "Second element of the tuple must be a list of OpenContractsAnnotationPythonTypes"
                        )

                    if not isinstance(metadata, list) or (
                        len(metadata) > 0
                        and not all(
                            isinstance(m, dict) and "data" in m for m in metadata
                        )
                    ):
                        raise ValueError(
                            "Third element of the tuple must be a list of dictionaries with 'data' key"
                        )

                    for annotation_data in text_annotations:

                        if not is_dict_instance_of_typed_dict(
                            annotation_data, OpenContractsAnnotationPythonType
                        ):
                            raise ValueError(
                                "Each annotation must be of type OpenContractsAnnotationPythonType"
                            )

                        label, _ = AnnotationLabel.objects.get_or_create(
                            text=annotation_data["annotationLabel"],
                            label_type=LabelType.TOKEN_LABEL
                            if annotation_data["page"] != 1
                            else LabelType.DOC_TYPE_LABEL,
                        )
                        Annotation.objects.create(
                            document=doc,
                            analysis=analysis,
                            annotation_label=label,
                            page=annotation_data["page"],
                            raw_text=annotation_data["rawText"],
                        )

                return result  # Return the result from the wrapped function

            except ValueError:
                # Re-raise ValueError instead of catching it as we're throwing these intentionally when return values
                # are off...
                raise

            except Exception as e:
                logger.info(f"Error in doc_analyzer_task for doc_id {doc_id}: {str(e)}")
                return [], [], [{"data": {"error": str(e)}}], False

        return wrapper

    return decorator
