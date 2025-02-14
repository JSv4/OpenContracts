import asyncio
import functools
import json
import logging
import traceback
from functools import wraps
from typing import Any, Callable, Union

from asgiref.sync import sync_to_async
from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from plasmapdf.models.PdfDataLayer import build_translation_layer

from opencontractserver.analyzer.models import Analysis
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document, DocumentAnalysisRow
from opencontractserver.types.dicts import TextSpan
from opencontractserver.types.enums import LabelType
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict

# Timing constants for retry and backoff durations
MAX_DELAY = 1800  # 30 minutes
INITIAL_DELAY = 30  # 30 seconds
DELAY_INCREMENT = 300  # 5 minutes

logger = logging.getLogger(__name__)


def doc_analyzer_task(max_retries=None, input_schema: dict | None = None):
    """
    Decorator for Celery tasks that analyze documents.
    Now supports an optional input_schema parameter to be stored
    for later retrieval and usage.
    """

    def decorator(func):
        @shared_task(bind=True, max_retries=max_retries)
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
                    logger.warn(f"Corpus with id {corpus_id} does not exist")
                    raise ValueError(f"Corpus with id {corpus_id} does not exist")

            if analysis_id:
                try:
                    analysis = Analysis.objects.get(id=analysis_id)
                    logger.info(f"Link to analysis: {analysis}")
                except ObjectDoesNotExist:
                    logger.warn(f"Analysis with id {analysis_id} does not exist")
                    raise ValueError(f"Analysis with id {analysis_id} does not exist")
            else:
                analysis = None

            logger.info(f"Doc {doc_id} backend lock: {doc.backend_lock}")
            if doc.backend_lock:
                logger.info(f"Doc {doc_id} backend lock is True")
                retry_count = self.request.retries
                logger.info(f"\tRetry count: {retry_count}")
                delay = min(INITIAL_DELAY + (retry_count * DELAY_INCREMENT), MAX_DELAY)
                logger.info(f"\tNew delay: {delay}")

                # If we've reached MAX_DELAY, STOP.
                if delay < MAX_DELAY:
                    # delay = INITIAL_DELAY

                    logger.info("Starting retry...")
                    raise self.retry(countdown=delay)

            try:
                # Retrieve necessary file contents
                # NOTE - I disabled this because there is some pretty significant likelihood that text extracted from
                # PDF won't fully match our extracted text layer. This is due to differences in white space handling,
                # OCR, etc., etc. I can see reasons to provide the bytes to the decorated function, but it's going to be
                # something that introduces ALL kinds of drift. Rather than deal with that absent a really compelling
                # reasons, going to avoid it for now.
                # pdf_file_bytes = doc.pdf_file.read() if doc.pdf_file else None
                pdf_text_extract = (
                    doc.txt_extract_file.read().decode("utf-8")
                    if doc.txt_extract_file
                    else None
                )

                pdf_pawls_extract = (
                    json.loads(doc.pawls_parse_file.read())
                    if doc.pawls_parse_file
                    else None
                )

                # Create PdfDataLayer
                pdf_data_layer = (
                    build_translation_layer(pdf_pawls_extract)
                    if pdf_pawls_extract
                    else []
                )

                # Call the wrapped function with the retrieved data
                result = func(
                    pdf_text_extract=pdf_text_extract,
                    pdf_pawls_extract=pdf_pawls_extract,
                    *args,
                    **kwargs,
                )

                # logger.debug(f"Function result: {result}")

                if not isinstance(result, tuple) or len(result) != 4:
                    raise ValueError(
                        "Function must return a tuple of (List[str], List[OpenContractsAnnotationPythonType], "
                        "List[Dict[str, Any]], bool)"
                    )

                doc_annotations, span_label_pairs, metadata, task_pass = result

                if not isinstance(task_pass, bool):
                    raise ValueError(
                        "Fourth element of the return value must be true/false. False for failure of some kind "
                        "(for tests)."
                    )

                # Process annotations if task passed
                if task_pass and analysis:

                    logger.info("Doc analyzer task passed... handle outputs.")

                    # Create doc analysis row
                    data_row, _ = DocumentAnalysisRow.objects.get_or_create(
                        document=doc, analysis=analysis, creator=analysis.creator
                    )
                    logger.info(f"Retrieved data row: {data_row}")
                    data_row.save()

                    # Check returned types if passed.
                    if not isinstance(doc_annotations, list) or (
                        len(doc_annotations) > 0
                        and not all(isinstance(a, str) for a in doc_annotations)
                    ):
                        raise ValueError(
                            "First element of the tuple must be a list of doc labels"
                        )

                    if not isinstance(span_label_pairs, list):
                        raise ValueError(
                            "Second element of the tuple must be a list of (TextSpan, str) tuples"
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

                    resulting_annotations = []

                    with transaction.atomic():
                        for span_label_pair in span_label_pairs:

                            logger.debug(f"Look at span_label_pair: {span_label_pair}")

                            if not (
                                isinstance(span_label_pair, tuple)
                                and len(span_label_pair) == 2
                                and is_dict_instance_of_typed_dict(
                                    span_label_pair[0], TextSpan
                                )
                                and isinstance(span_label_pair[1], str)
                            ):
                                raise ValueError(
                                    "Second element of the tuple must be a list of (TextSpan, str) tuples"
                                )

                            # Convert to appropriate form of annotation depending on the document type...
                            # FOR application/pdf... we want token annotations
                            if doc.file_type in ["application/pdf"]:
                                # Convert (TextSpan, str) pairs to OpenContractsAnnotationPythonType
                                logger.info(f"Create Annotation Linked to {corpus_id}")
                                span, label = span_label_pair
                                annotation_data = pdf_data_layer.create_opencontract_annotation_from_span(
                                    {"span": span, "annotation_label": label}
                                )
                                label, _ = AnnotationLabel.objects.get_or_create(
                                    text=annotation_data["annotationLabel"],
                                    label_type=LabelType.TOKEN_LABEL,
                                    creator=analysis.creator,
                                    analyzer=analysis.analyzer,
                                )

                                # Harder to filter these to ensure no duplicates...
                                annot = Annotation(
                                    document=doc,
                                    analysis=analysis,
                                    annotation_label=label,
                                    page=annotation_data["page"],
                                    raw_text=annotation_data["rawText"],
                                    json=annotation_data["annotation_json"],
                                    annotation_type=LabelType.TOKEN_LABEL,
                                    creator=analysis.creator,
                                    **({"corpus_id": corpus_id} if corpus_id else {}),
                                )
                                annot.save()
                                resulting_annotations.append(annot)

                            # FOR application/txt... we want span-based annotations
                            elif doc.file_type in ["application/txt", "text/plain"]:
                                logger.info(f"Create Annotation Linked to {corpus_id}")
                                span, label = span_label_pair
                                label, _ = AnnotationLabel.objects.get_or_create(
                                    text=label,
                                    label_type=LabelType.SPAN_LABEL,
                                    creator=analysis.creator,
                                    analyzer=analysis.analyzer,
                                )

                                # Harder to filter these to ensure no duplicates...
                                annot = Annotation(
                                    document=doc,
                                    analysis=analysis,
                                    annotation_label=label,
                                    page=1,
                                    raw_text=pdf_text_extract[
                                        span["start"] : span["end"]
                                    ],
                                    annotation_type=LabelType.SPAN_LABEL,
                                    json={"start": span["start"], "end": span["end"]},
                                    creator=analysis.creator,
                                    **({"corpus_id": corpus_id} if corpus_id else {}),
                                )
                                annot.save()
                                resulting_annotations.append(annot)

                            else:
                                raise ValueError(
                                    f"Unexpected file type: {doc.file_type}"
                                )

                        for doc_label in doc_annotations:
                            logger.info(f"Creating doc label annotation: {doc_label}")
                            label, _ = AnnotationLabel.objects.get_or_create(
                                text=doc_label,
                                label_type=LabelType.DOC_TYPE_LABEL,
                                creator=analysis.creator,
                                analyzer=analysis.analyzer,
                            )
                            logger.info(f"Created/found label: {label}")

                            annot = Annotation(
                                document=doc,
                                analysis=analysis,
                                annotation_label=label,
                                page=1,
                                raw_text="",
                                json={},
                                annotation_type=LabelType.DOC_TYPE_LABEL,
                                creator=analysis.creator,
                                **({"corpus_id": corpus_id} if corpus_id else {}),
                            )
                            logger.info(f"Created annotation object: {annot}")
                            annot.save()
                            logger.info(f"Saved annotation: {annot.id}")
                            resulting_annotations.append(annot)

                    # Link resulting annotations
                    transaction.on_commit(
                        lambda: data_row.annotations.add(*resulting_annotations)
                    )

                return result  # Return the result from the wrapped function

            except ValueError:
                # Re-raise ValueError instead of catching it as we're throwing these intentionally when return values
                # are off...
                raise

            except Exception as e:
                logger.info(f"Error in doc_analyzer_task for doc_id {doc_id}: {str(e)}")
                return [], [], [{"data": {"error": str(e)}}], False

        # Add a custom attribute to identify doc_analyzer_tasks
        wrapper.is_doc_analyzer_task = True

        # Attach the input schema to the function object so we can retrieve later
        wrapper._oc_doc_analyzer_input_schema = input_schema

        return wrapper

    return decorator


def async_celery_task(*task_args, **task_kwargs) -> Callable:
    """
    A decorator to convert an async function into a Celery task that runs
    within its own asyncio event loop.

    Args:
        *task_args: Positional arguments for Celery's shared_task.
        **task_kwargs: Keyword arguments for Celery's shared_task.

    Returns:
        A standard sync Celery task function that internally spins up an
        event loop to run the originally wrapped async function.
    """

    def decorator(async_func: Callable[..., Any]) -> Callable[..., Any]:
        # We create a standard sync function as the actual Celery task
        @shared_task(*task_args, **task_kwargs)
        @functools.wraps(async_func)
        def wrapper(*args, **kwargs) -> Any:
            # Create a new event loop (or reuse an existing one if needed)
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                return loop.run_until_complete(async_func(*args, **kwargs))
            finally:
                # Ensure we gracefully shut down async gens/tasks
                loop.run_until_complete(loop.shutdown_asyncgens())
                loop.close()

        return wrapper

    return decorator


def async_doc_analyzer_task(
    max_retries: Union[int, None] = None, input_schema: dict | None = None
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Decorator for Celery tasks that analyze documents in an async context,
    providing the same preflight checks as doc_analyzer_task, in the
    same order, and then calling the user-supplied async function.

    This version forces a complete drain of the newly created event loop,
    ensuring that any tasks or async generators spawned by user code are
    properly finalized (or canceled) before the loop is closed.
    """

    def decorator(async_func: Callable[..., Any]) -> Callable[..., Any]:
        @shared_task(bind=True, max_retries=max_retries)
        @functools.wraps(async_func)
        def wrapper(self, *args, **kwargs) -> Any:
            """
            Synchronously runs the async_wrapper by creating a dedicated event loop,
            running the async code, then forcibly draining or canceling any pending
            tasks before shutting down the loop.
            """
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(async_wrapper(self, *args, **kwargs))
                return result
            finally:
                # Forcefully cancel *all* remaining tasks so none linger
                pending_tasks = asyncio.all_tasks(loop=loop)
                for task in pending_tasks:
                    task.cancel()
                if pending_tasks:
                    loop.run_until_complete(
                        asyncio.gather(*pending_tasks, return_exceptions=True)
                    )

                # Shutdown async generators
                loop.run_until_complete(loop.shutdown_asyncgens())

                # Finally close the loop
                loop.close()

                # # Forcibly close the current thread's DB connection.
                # connection.close()

        async def async_wrapper(self, *args, **kwargs) -> Any:
            """
            The core logic: preflight checks using async-safe ORM methods, then
            calling the user's async function. Any tasks or async generators
            spawned here will be cleaned up in the wrapper after this returns.
            """
            doc_id = kwargs.get("doc_id")
            corpus_id = kwargs.get("corpus_id")
            analysis_id = kwargs.get("analysis_id")
            logger.info(
                f"[ASYNC] Task parameters - doc_id: {doc_id}, corpus_id: {corpus_id}, analysis_id: {analysis_id}"
            )

            logger.info(f"[ASYNC] Starting task with doc_id: {doc_id}")

            # Log all documents in DB before we try to fetch
            all_docs = await Document.objects.all().acount()
            logger.info(f"[ASYNC] Number of documents in DB: {all_docs}")

            if doc_id:
                try:
                    exists = await Document.objects.filter(id=doc_id).aexists()
                    logger.info(f"[ASYNC] Document {doc_id} exists check: {exists}")
                except Exception as e:
                    logger.error(f"[ASYNC] Error checking document existence: {e}")

            if not doc_id:
                raise ValueError("doc_id is required for doc_analyzer_task")

            # 2) Check if analysis_id is missing
            if not analysis_id:
                raise ValueError("analysis_id is required for doc_analyzer_task")

            # 3) Fetch the Document
            try:
                doc = await Document.objects.aget(id=doc_id)
            except ObjectDoesNotExist:
                raise ValueError(f"Document with id {doc_id} does not exist")

            # 4) If a corpus_id is provided, fetch it
            if corpus_id:
                try:
                    await Corpus.objects.aget(id=corpus_id)
                except ObjectDoesNotExist:
                    logger.error(f"Corpus with id {corpus_id} does not exist")
                    raise ValueError(f"Corpus with id {corpus_id} does not exist")

            # 5) If an analysis_id is provided, fetch the Analysis
            try:
                analysis = await Analysis.objects.aget(id=analysis_id)
                logger.info(f"Link to analysis: {analysis}")
            except ObjectDoesNotExist:
                logger.warning(f"Analysis with id {analysis_id} does not exist")
                raise ValueError(f"Analysis with id {analysis_id} does not exist")

            # 6) Check doc.backend_lock and possibly retry
            logger.info(f"[ASYNC] Doc {doc_id} backend lock: {doc.backend_lock}")
            if doc.backend_lock:
                logger.info(f"[ASYNC] Doc {doc_id} backend lock is True")
                retry_count = self.request.retries
                logger.info(f"[ASYNC]\tRetry count: {retry_count}")
                delay = min(INITIAL_DELAY + (retry_count * DELAY_INCREMENT), MAX_DELAY)
                logger.info(f"[ASYNC]\tNew delay: {delay}")

                if delay < MAX_DELAY:
                    logger.info("[ASYNC] Starting retry...")
                    raise self.retry(countdown=delay)

            # 7) If we passed all preflight checks, proceed to gather data and call async func
            try:

                @sync_to_async
                def get_pdf_text(doc: Document) -> str:
                    return doc.txt_extract_file.read().decode("utf-8")

                @sync_to_async
                def get_pawls_extract(doc: Document) -> Any:
                    return json.loads(doc.pawls_parse_file.read())

                @sync_to_async
                def has_txt_extract(doc: Document) -> bool:
                    """
                    Safely check if the txt_extract_file field of the document is truthy.
                    """
                    return bool(doc.txt_extract_file)

                @sync_to_async
                def has_pawls_parse(doc: Document) -> bool:
                    """
                    Safely check if the pawls_parse_file field of the document is truthy.
                    """
                    return bool(doc.pawls_parse_file)

                if await has_txt_extract(doc):
                    pdf_text_extract = await get_pdf_text(doc)
                else:
                    pdf_text_extract = None

                if await has_pawls_parse(doc):
                    pdf_pawls_extract = await get_pawls_extract(doc)
                else:
                    pdf_pawls_extract = None

                pdf_data_layer = (
                    build_translation_layer(pdf_pawls_extract)
                    if pdf_pawls_extract
                    else []
                )

                # Key change: Wrap access to analysis.creator with sync_to_async
                @sync_to_async
                def get_analysis_creator(analysis):
                    return analysis.creator

                # Use the wrapped function to get creator
                creator = await get_analysis_creator(analysis)

                # Use creator in subsequent operations
                data_row, _ = await DocumentAnalysisRow.objects.aget_or_create(
                    document=doc,
                    analysis=analysis,
                    creator=creator,  # Use the safely retrieved creator
                )

                @sync_to_async
                def get_analysis_analyzer(analysis):
                    return analysis.analyzer

                analyzer = await get_analysis_analyzer(analysis)

                # -- Call the user's async function --
                result = await async_func(
                    pdf_text_extract=pdf_text_extract,
                    pdf_pawls_extract=pdf_pawls_extract,
                    *args,
                    **kwargs,
                )

                # Now do the same post-processing as doc_analyzer_task...
                if not isinstance(result, tuple) or len(result) != 4:
                    raise ValueError(
                        "Function must return a tuple of (List[str], List[OpenContractsAnnotationPythonType], "
                        "List[Dict[str, Any]], bool)"
                    )

                doc_annotations, span_label_pairs, metadata, task_pass = result

                if not isinstance(task_pass, bool):
                    raise ValueError(
                        "Fourth element of the return value must be true/false. "
                        "(False indicates failure for tests)."
                    )

                if task_pass:
                    # Validate doc_annotations, label pairs, metadata
                    if not isinstance(doc_annotations, list) or (
                        len(doc_annotations) > 0
                        and not all(isinstance(a, str) for a in doc_annotations)
                    ):
                        raise ValueError(
                            "First element of the tuple must be a list of doc labels"
                        )

                    if not isinstance(span_label_pairs, list):
                        raise ValueError(
                            "Second element of the tuple must be a list of (TextSpan, str) tuples"
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

                    resulting_annotations = []
                    for span_label_pair in span_label_pairs:
                        if not (
                            isinstance(span_label_pair, tuple)
                            and len(span_label_pair) == 2
                            and is_dict_instance_of_typed_dict(
                                span_label_pair[0], TextSpan
                            )
                            and isinstance(span_label_pair[1], str)
                        ):
                            raise ValueError(
                                "Second element of the tuple must be a list of (TextSpan, str) tuples"
                            )

                        # Handle PDF vs TXT annotation creation
                        if doc.file_type in ["application/pdf"]:
                            span, label_text = span_label_pair
                            annotation_data = (
                                pdf_data_layer.create_opencontract_annotation_from_span(
                                    {"span": span, "annotation_label": label_text}
                                )
                            )
                            logger.info(
                                f"[ASYNC] PDF Annotation data: {annotation_data}"
                            )
                            label_obj, _ = await AnnotationLabel.objects.aget_or_create(
                                text=annotation_data["annotationLabel"],
                                label_type=LabelType.TOKEN_LABEL,
                                creator=creator,
                                analyzer=analyzer,
                            )
                            annot = Annotation(
                                document=doc,
                                analysis=analysis,
                                annotation_label=label_obj,
                                page=annotation_data["page"],
                                raw_text=annotation_data["rawText"],
                                json=annotation_data["annotation_json"],
                                annotation_type=LabelType.TOKEN_LABEL,
                                creator=creator,
                                **({"corpus_id": corpus_id} if corpus_id else {}),
                            )
                            await annot.asave()
                            resulting_annotations.append(annot)

                        elif doc.file_type in ["application/txt", "text/plain"]:
                            span, label_text = span_label_pair
                            logger.info(
                                f"[ASYNC] TXT Annotation data: {label_text} / {span}"
                            )
                            label_obj, _ = await AnnotationLabel.objects.aget_or_create(
                                text=label_text,
                                label_type=LabelType.SPAN_LABEL,
                                creator=creator,
                                analyzer=analyzer,
                            )
                            annot = Annotation(
                                document=doc,
                                analysis=analysis,
                                annotation_label=label_obj,
                                page=1,
                                raw_text=span["text"],
                                annotation_type=LabelType.SPAN_LABEL,
                                json={"start": span["start"], "end": span["end"]},
                                creator=creator,
                                **({"corpus_id": corpus_id} if corpus_id else {}),
                            )
                            await annot.asave()
                            resulting_annotations.append(annot)

                        else:
                            raise ValueError(f"Unexpected file type: {doc.file_type}")

                    for doc_label in doc_annotations:
                        label_obj, _ = await AnnotationLabel.objects.aget_or_create(
                            text=doc_label,
                            label_type=LabelType.DOC_TYPE_LABEL,
                            creator=creator,
                            analyzer=analyzer,
                        )
                        annot = Annotation(
                            document=doc,
                            analysis=analysis,
                            annotation_label=label_obj,
                            page=1,
                            raw_text="",
                            json={},
                            annotation_type=LabelType.DOC_TYPE_LABEL,
                            creator=creator,
                            **({"corpus_id": corpus_id} if corpus_id else {}),
                        )
                        await annot.asave()
                        resulting_annotations.append(annot)

                    await data_row.annotations.aadd(*resulting_annotations)

                return result

            except ValueError:
                # Re-raise ValueError so these are not masked by the generic except
                raise

            except Exception as e:
                tb = traceback.format_exc()
                logger.error(
                    f"[ASYNC] Error in async_doc_analyzer_task for doc_id {kwargs.get('doc_id')}: {str(e)}\n{tb}"
                )
                # Use the doc_analyzer_task fallback shape
                return [], [], [{"data": {"error": str(e), "stack_trace": tb}}], False

        # Mark this as a doc_analyzer_task for any reflection
        wrapper.is_doc_analyzer_task = True
        wrapper._oc_doc_analyzer_input_schema = input_schema

        return wrapper

    return decorator
