from __future__ import annotations

import logging

import requests

from opencontractserver.analyzer.models import GremlinEngine
from opencontractserver.types.dicts import AnalyzerManifest
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict

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
