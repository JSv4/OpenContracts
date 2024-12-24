#  Copyright (C) 2022  John Scrudato

import json
import logging
import pathlib
import random
from typing import Optional

from opencontractserver.types.dicts import (
    OpenContractsDocAnnotations,
    OpenContractsGeneratedCorpusPythonType,
)

logger = logging.getLogger(__name__)


def generate_random_analyzer_return_values(
    doc_count: Optional[int] = None, doc_ids: Optional[list[int | str]] = None
) -> OpenContractsGeneratedCorpusPythonType:

    static_output: OpenContractsGeneratedCorpusPythonType = json.loads(
        (
            pathlib.Path(__file__).parent
            / "short_sample_gramlin_engine_output_for_public_docs.json"
        )
        .open("r")
        .read()
    )
    sample_annotated_doc_data = list(static_output["annotated_docs"].values())
    annotated_docs = {}

    def random_doc_data() -> OpenContractsDocAnnotations:
        return sample_annotated_doc_data[
            random.randint(0, len(sample_annotated_doc_data) - 1)
        ]

    if isinstance(doc_ids, list):
        for id in doc_ids:
            annotated_docs[id] = random_doc_data()

    elif isinstance(doc_count, int):
        for i in range(0, doc_count):
            annotated_docs[i] = random_doc_data()
    else:
        raise ValueError(
            "You must provide either a doc_count or doc_id argument. If both are provided, the doc_id "
            "list will drive the output."
        )

    return {
        "annotated_docs": annotated_docs,
        "doc_labels": static_output["doc_labels"],
        "text_labels": static_output["text_labels"],
        "label_set": static_output["label_set"],
    }
