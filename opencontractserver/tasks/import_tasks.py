import base64
import io
import json
import logging
import zipfile
from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile, File

from config import celery_app
from config.graphql.permission_annotator.utils import (
    grant_all_permissions_for_obj_to_user,
)
from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import Annotation
from opencontractserver.documents.models import Document
from opencontractserver.utils.data_types import OpenContractsExportDataJsonPythonType
from opencontractserver.utils.packaging_tools import (
    unpack_corpus_from_export,
    unpack_label_set_from_export,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@celery_app.task()
def import_corpus(
    base64_encoded_data: str, user_id: int, seed_corpus_id: Optional[int]
) -> Optional[str]:

    try:

        logger.info(f"import_corpus() - for user_id: {user_id}")

        # Nice guide on how to use base64 encoding to send file via text and then reconstitute bytes object on return
        # https://stackabuse.com/encoding-and-decoding-base64-strings-in-python/
        base64_img_bytes = base64_encoded_data.encode("utf-8")
        decoded_file_data = base64.decodebytes(base64_img_bytes)
        logger.info("import_corpus() - Data decoded successfully")

        user_obj = User.objects.get(id=user_id)

        with zipfile.ZipFile(io.BytesIO(decoded_file_data), mode="r") as importZip:

            logger.info("import_corpus() - Job... loaded import data.")

            text_label_inst_lookup: dict[str, Any] = {}
            doc_label_inst_lookup: dict[str, Any] = {}
            doc_isnt_lookup: dict[str, Any] = {}

            files = importZip.namelist()
            logger.info(f"import_corpus() - Raw files: {files}")

            if "data.json" in files:

                files.remove("data.json")
                with importZip.open("data.json") as corpus_data:

                    data_json: OpenContractsExportDataJsonPythonType = json.loads(
                        corpus_data.read().decode("UTF-8")
                    )
                    text_labels = data_json["text_labels"]
                    doc_labels = data_json["doc_labels"]

                    label_set_data = {**data_json["label_set"]}
                    label_set_data.pop("id")

                    corpus_data = {**data_json["corpus"]}
                    corpus_data.pop("id")

                    # Create labelset by loading JSON and converting to Django with DRF serializer
                    labelset_obj = unpack_label_set_from_export(
                        data=label_set_data, user=user_obj
                    )
                    logger.info(f"LabelSet created: {labelset_obj}")

                    # If a seed_corpus_id was passed in (so the mutation could return a corpus id for lookups
                    # immediately), this gets mixed in and passed to the serializer
                    if seed_corpus_id:
                        corpus_obj = unpack_corpus_from_export(
                            data=corpus_data,
                            user=user_obj,
                            label_set_id=labelset_obj.id,
                            corpus_id=seed_corpus_id,
                        )
                    else:
                        corpus_obj = unpack_corpus_from_export(
                            data=corpus_data,
                            user=user_obj,
                            label_set_id=labelset_obj.id,
                            corpus_id=None,
                        )
                    logger.info(f"Created corpus_obj: {corpus_obj}")

                    logger.info("Create text-level annotations")
                    for label in text_labels:

                        logger.info(
                            f"Create text-level annotations for: {label} / User: {user_id}"
                        )

                        # Convert the label JSON to an AnnotationLabel obj using a
                        # DRF serializer and django API
                        label_data = {**text_labels[label]}
                        label_data.pop("id")
                        label_data["creator"] = user_id

                        label_serializer = AnnotationLabelSerializer(data=label_data)
                        label_serializer.is_valid(raise_exception=True)
                        label_obj = label_serializer.save()
                        grant_all_permissions_for_obj_to_user(user_obj, label_obj)

                        # Add the resulting label to labelset
                        labelset_obj.annotation_labels.add(label_obj)

                        # Add the label name (text) to name / id lookup
                        text_label_inst_lookup[label] = label_obj

                        logger.info(f"Loaded text label: {label_obj}")

                    for label in doc_labels:

                        # Convert the label JSON to an AnnotationLabel obj using a
                        # DRF serializer and django API
                        doc_label_data = {**doc_labels[label]}
                        doc_label_data.pop("id")
                        doc_label_data["creator"] = user_id

                        label_serializer = AnnotationLabelSerializer(
                            data=doc_label_data
                        )
                        label_serializer.is_valid(raise_exception=True)
                        label_obj = label_serializer.save()
                        grant_all_permissions_for_obj_to_user(user_obj, label_obj)

                        # Add the resulting label to labelset
                        labelset_obj.annotation_labels.add(label_obj)

                        # Add the label name (text) to name / id lookup
                        doc_label_inst_lookup[label] = label_obj

                        logger.info(f"Loaded text label: {label_obj}")

                    for doc in data_json["annotated_docs"]:

                        logger.info(f"Start load for doc: {doc}")
                        doc_data = data_json["annotated_docs"][doc]
                        # logger.info(f"Pawls layer: {doc_data['pawls_file_content']}")

                        try:
                            with importZip.open(doc) as pdfFile:

                                pdf_file = File(pdfFile, doc)
                                logger.info("pdf_file obj created in memory")

                                pawls_parse_file = ContentFile(
                                    json.dumps(doc_data["pawls_file_content"]).encode(
                                        "utf-8"
                                    ),
                                    name="pawls_tokens.json",
                                )
                                logger.info("Pawls parse file obj created in memory")

                                logger.info(
                                    f"Create doc instance with creator: {user_obj}"
                                )
                                doc_obj = Document(
                                    title=data_json["annotated_docs"][doc]["title"],
                                    description=f"Imported document with filename {doc}",
                                    pdf_file=pdf_file,
                                    pawls_parse_file=pawls_parse_file,
                                    backend_lock=True,  # Lock doc so pawls parser doesn't pick it up (already parsed)
                                    creator=user_obj,
                                )
                                doc_obj.save()
                                logger.info(f"Doc created: {doc_obj}")

                                grant_all_permissions_for_obj_to_user(user_obj, doc_obj)
                                logger.info("Doc permissioned")

                                doc_isnt_lookup[doc] = doc_obj

                                # Link to corpus
                                corpus_obj.documents.add(doc_obj)
                                corpus_obj.save()

                        except Exception as e:
                            logger.error(
                                f"import_corpus() - Error trying to load contract file: {e}"
                            )

                        # Create the doc labels...
                        logger.info(f"Label lookup: {doc_label_inst_lookup}")
                        for doc_label in data_json["annotated_docs"][doc]["doc_labels"]:
                            logger.info(f"Add doc label: {doc_label}")
                            try:
                                annot_obj = Annotation(
                                    annotation_label=doc_label_inst_lookup[doc_label],
                                    document=doc_isnt_lookup[doc],
                                    corpus=corpus_obj,
                                    creator=user_obj,
                                )
                                annot_obj.save()
                                grant_all_permissions_for_obj_to_user(
                                    user_obj, annot_obj
                                )

                            except Exception as e:
                                logger.error(
                                    f"import_corpus() - Error creating annotation: {e}"
                                )

                        # Create the text labels
                        logger.info(f"Doc inst lookup: {doc_isnt_lookup}")
                        for annotation in data_json["annotated_docs"][doc][
                            "labelled_text"
                        ]:
                            logger.info(
                                f"Add text label: {text_label_inst_lookup[annotation['annotationLabel']]}"
                            )
                            try:
                                logger.info(f"doc obj: {doc_isnt_lookup[doc]}")
                                annot_obj = Annotation.objects.create(
                                    raw_text=annotation["rawText"],
                                    page=annotation["page"],
                                    json=annotation["json"],
                                    annotation_label=text_label_inst_lookup[
                                        annotation["annotationLabel"]
                                    ],
                                    document=doc_isnt_lookup[doc],
                                    corpus=corpus_obj,
                                    creator=user_obj,
                                )
                                annot_obj.save()
                                grant_all_permissions_for_obj_to_user(
                                    user_obj, annot_obj
                                )
                            except Exception as e:
                                logger.error(
                                    f"import_corpus() - Error creating text annotation: {e}"
                                )

                        # Unlock the document
                        doc_obj.backend_lock = False
                        doc_obj.save()

                        logger.info("\tDoc load complete.")

                    return corpus_obj.id

        # If we didn't successfully complete import
        return None

    except Exception as e:
        logger.error(f"import_corpus() - Exception encountered in corpus import: {e}")
        return None
