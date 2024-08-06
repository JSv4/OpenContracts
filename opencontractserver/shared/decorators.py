import logging
from functools import wraps

from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document

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

            logger.info(f"Doc analyzer task doc id: {doc_id}")

            if not doc_id:
                raise ValueError("doc_id is required for doc_analyzer_task")

            try:
                doc = Document.objects.get(id=doc_id)
            except ObjectDoesNotExist:
                raise ValueError(f"Document with id {doc_id} does not exist")

            if corpus_id:
                try:
                    Corpus.objects.get(id=corpus_id)
                except ObjectDoesNotExist:
                    raise ValueError(f"Corpus with id {corpus_id} does not exist")

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
                result = func(*args, **kwargs)
                print(f"Function results: {result}")

                if not isinstance(result, tuple) or len(result) != 3:
                    raise ValueError(
                        "Function must return a tuple of (List[OpenContractsAnnotationPythonType], List[Dict[str, "
                        "Any]])"
                    )

                annotations, metadata, task_pass = result

                if not isinstance(annotations, list) or not all(
                    isinstance(a, dict) for a in annotations
                ):
                    raise ValueError(
                        "First element of the tuple must be a list of annotation dictionaries"
                    )

                if not isinstance(metadata, list) or not all(
                    isinstance(m, dict) and "data" in m for m in metadata
                ):
                    raise ValueError(
                        "Second element of the tuple must be a list of dictionaries with 'data' key"
                    )

                if not isinstance(task_pass, bool):
                    raise ValueError(
                        "Third element of the return value must be true/false. False for failure of some "
                        "kind (for tests)."
                    )

                return result  # Return the result from the wrapped function

            except ValueError:
                # Re-raise ValueError instead of catching it as we're throwing these intentionally when return values
                # are off...
                raise

            except Exception as e:
                logger.info(f"Error in doc_analyzer_task for doc_id {doc_id}: {str(e)}")
                return [], [{"data": {"error": str(e)}}], False

        return wrapper

    return decorator
