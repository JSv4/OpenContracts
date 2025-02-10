from __future__ import annotations

import logging
from typing import Any

import requests
from django.db.utils import IntegrityError
from django.utils.text import Truncator

from opencontractserver.analyzer.models import GremlinEngine
from opencontractserver.types.dicts import AnalyzerManifest
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict

try:
    # Attempt to import Celery logic in a typical run
    from opencontractserver.utils.celery_tasks import (
        celery_app,
        get_doc_analyzer_task_by_name,
    )
except ImportError:
    # If Celery or tasks aren't available in this context, set placeholders
    get_doc_analyzer_task_by_name = None
    celery_app = None

logger = logging.getLogger(__name__)


def get_gremlin_manifests(gremlin_id: int) -> list[AnalyzerManifest] | None:
    logger.info("get_gremlin_manifests - Start...")
    try:
        gremlin = GremlinEngine.objects.get(id=gremlin_id)
        manifest_response = requests.get(gremlin.url + "/api/analyzers")
        # logger.info(f"get_gremlin_manifests - manifest_response: {manifest_response}")
        # logger.info(
        #     f"get_gremlin_manifests - manifest_response content: {manifest_response.content}"
        # )

        manifest_json = manifest_response.json()
        # logger.info(f"get_gremlin_manifest received: {manifest_json}")

        manifest_list: list[AnalyzerManifest] = manifest_json.get("items", None)

        for analyzer_metadata in manifest_list:
            if not is_dict_instance_of_typed_dict(analyzer_metadata, AnalyzerManifest):
                raise ValueError(
                    "Received Gremlin manifest is not of expected format AnalyzerMetaDataType"
                )

        return manifest_list

    except Exception as e:
        logger.error(
            f"get_gremlin_manifest() - could not retrieve gremlin manifest for gremlin id {gremlin_id} due to "
            f"error: {e}"
        )
        return None


def auto_create_doc_analyzers(
    AnalyzerModel: type[Any],
    UserModel: type[Any],
    fallback_superuser: bool = True,
    max_docstring_length: int = 2000,
):
    """
    Detects functions decorated with @doc_analyzer_task,
    creates or updates corresponding Analyzer entries.

    If a task name already exists, it's skipped.
    Populates the Analyzer.description from the task's docstring if available.

    :param AnalyzerModel: The Analyzer model class (historical or real).
    :param UserModel: The User model class (historical or real).
    :param fallback_superuser: If True, tries a superuser first, else any user.
    :param max_docstring_length: Truncate docstring to this length in the description.
    """

    if not celery_app or not get_doc_analyzer_task_by_name:
        logger.warning(
            "auto_create_doc_analyzers: Celery or doc_analyzer_task accessor not available."
        )
        return

    # Attempt to choose a creator user. Default to superuser, else any user.
    creator_user = None
    if fallback_superuser:
        creator_user = UserModel.objects.filter(is_superuser=True).first()

    if creator_user is None:
        creator_user = UserModel.objects.first()

    # If no user can be found, skip since foreign key is mandatory
    if creator_user is None:
        logger.warning("No user found. Aborting analyzer creation.")
        return

    # Iterate over tasks in Celery registry
    for task_name in celery_app.tasks.keys():
        analyzer_task = get_doc_analyzer_task_by_name(task_name)
        if analyzer_task is None:
            continue

        analyzer_id = task_name
        # Check for existing
        if (
            AnalyzerModel.objects.filter(id=analyzer_id).exists()
            or AnalyzerModel.objects.filter(task_name=task_name).exists()
        ):
            continue

        # Pull docstring
        docstring = (analyzer_task.__doc__ or "").strip()
        trimmed_desc = Truncator(docstring).chars(max_docstring_length)
        default_desc = "Auto-created from @doc_analyzer_task-decorated Celery task."
        description = trimmed_desc if trimmed_desc else default_desc

        schema = getattr(analyzer_task, "_oc_doc_analyzer_input_schema", None)  

        try:
            AnalyzerModel.objects.create(
                id=analyzer_id,
                creator=creator_user,
                is_public=True,
                disabled=False,
                task_name=task_name,
                host_gremlin=None,
                manifest={},
                description=description,
                input_schema=schema,
            )
        except IntegrityError:
            logger.warning(f"IntegrityError creating Analyzer {analyzer_id}. Skipped.")
            continue

    logger.info("auto_create_doc_analyzers completed successfully.")
