import base64
import json
import logging
import zipfile
from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile, File

from config import celery_app
from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import (
    DOC_TYPE_LABEL,
    METADATA_LABEL,
    TOKEN_LABEL,
    Annotation,
)
from opencontractserver.corpuses.models import Corpus, TemporaryFileHandle
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    OpenContractsAnnotatedDocumentImportType,
    OpenContractsExportDataJsonPythonType,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.packaging import (
    unpack_corpus_from_export,
    unpack_label_set_from_export,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
from opencontractserver.utils.importing import load_or_create_labels, import_annotations

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@celery_app.task()
def import_corpus(
    temporary_file_handle_id: str | int, user_id: int, seed_corpus_id: Optional[int]
) -> Optional[str]:

    try:

        logger.info(f"import_corpus() - for user_id: {user_id}")

        temporary_file_handle = TemporaryFileHandle.objects.get(
            id=temporary_file_handle_id
        )

        with temporary_file_handle.file.open("rb") as import_file:

            logger.info("import_corpus() - Data decoded successfully")
            user_obj = User.objects.get(id=user_id)

            with zipfile.ZipFile(import_file, mode="r") as importZip:

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

                        label_set_data = {**data_json["label_set"]}  # noqa
                        label_set_data.pop("id")  # noqa

                        corpus_data = {**data_json["corpus"]}
                        corpus_data.pop("id")

                        # Create labelset by loading JSON and converting to Django with DRF serializer
                        labelset_obj = unpack_label_set_from_export(
                            data=label_set_data, user=user_obj  # noqa
                        )
                        logger.info(f"LabelSet created: {labelset_obj}")

                        # If a seed_corpus_id was passed in (so the mutation could return a corpus id for lookups
                        # immediately), this gets mixed in and passed to the serializer
                        if seed_corpus_id:
                            corpus_obj = unpack_corpus_from_export(
                                data=corpus_data,  # noqa
                                user=user_obj,
                                label_set_id=labelset_obj.id,
                                corpus_id=seed_corpus_id,
                            )
                        else:
                            corpus_obj = unpack_corpus_from_export(
                                data=corpus_data,  # noqa
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

                            label_serializer = AnnotationLabelSerializer(
                                data=label_data
                            )
                            label_serializer.is_valid(raise_exception=True)
                            label_obj = label_serializer.save()
                            set_permissions_for_obj_to_user(
                                user_obj, label_obj, [PermissionTypes.ALL]
                            )

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
                            set_permissions_for_obj_to_user(
                                user_obj, label_obj, [PermissionTypes.ALL]
                            )

                            # Add the resulting label to labelset
                            labelset_obj.annotation_labels.add(label_obj)

                            # Add the label name (text) to name / id lookup
                            doc_label_inst_lookup[label] = label_obj

                            logger.info(f"Loaded text label: {label_obj}")

                        for doc in data_json["annotated_docs"]:

                            logger.info(f"Start load for doc: {doc}")
                            doc_data = data_json["annotated_docs"][doc]
                            pawls_layers = doc_data["pawls_file_content"]
                            # logger.info(f"Pawls layer: {doc_data['pawls_file_content']}")

                            try:
                                with importZip.open(doc) as pdfFile:

                                    pdf_file = File(pdfFile, doc)
                                    logger.info("pdf_file obj created in memory")

                                    pawls_parse_file = ContentFile(
                                        json.dumps(pawls_layers).encode("utf-8"),
                                        name="pawls_tokens.json",
                                    )
                                    logger.info(
                                        "Pawls parse file obj created in memory"
                                    )

                                    logger.info(
                                        f"Create doc instance with creator: {user_obj}"
                                    )
                                    doc_obj = Document.objects.create(
                                        title=data_json["annotated_docs"][doc]["title"],
                                        description=f"Imported document with filename {doc}",
                                        pdf_file=pdf_file,
                                        pawls_parse_file=pawls_parse_file,
                                        backend_lock=True,  # Lock doc so pawls parser doesn't pick it up (already done)
                                        creator=user_obj,
                                        page_count=len(pawls_layers),
                                    )
                                    logger.info(f"Doc created: {doc_obj}")

                                    set_permissions_for_obj_to_user(
                                        user_obj, doc_obj, [PermissionTypes.ALL]
                                    )
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
                            for doc_label in data_json["annotated_docs"][doc][
                                "doc_labels"
                            ]:
                                logger.info(f"Add doc label: {doc_label}")
                                try:
                                    annot_obj = Annotation(
                                        annotation_label=doc_label_inst_lookup[
                                            doc_label
                                        ],
                                        document=doc_isnt_lookup[doc],
                                        corpus=corpus_obj,
                                        creator=user_obj,
                                    )
                                    annot_obj.save()

                                    set_permissions_for_obj_to_user(
                                        user_obj, annot_obj, [PermissionTypes.ALL]
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
                                        json=annotation["annotation_json"],
                                        annotation_label=text_label_inst_lookup[
                                            annotation["annotationLabel"]
                                        ],
                                        document=doc_isnt_lookup[doc],
                                        corpus=corpus_obj,
                                        creator=user_obj,
                                    )
                                    annot_obj.save()

                                    set_permissions_for_obj_to_user(
                                        user_obj, annot_obj, [PermissionTypes.ALL]
                                    )

                                except Exception as e:
                                    logger.error(
                                        f"import_corpus() - Error creating txt annotation: {e} with input: {annotation}"
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


@celery_app.task()
def import_document_to_corpus(
    target_corpus_id: int,
    user_id: int,
    document_import_data: OpenContractsAnnotatedDocumentImportType,
) -> Optional[str]:
    try:
        logger.info(f"import_document_to_corpus() - for user_id: {user_id}")
        logger.info(
            f"import_document_to_corpus() - target_corpus_id: {target_corpus_id}"
        )

        # Load target corpus
        corpus_obj = Corpus.objects.get(id=target_corpus_id)
        logger.info(f"Loaded corpus: {corpus_obj.title}")

        # Load labelset
        labelset_obj = corpus_obj.label_set
        logger.info(f"Loaded labelset: {labelset_obj.title}")

        # Load existing labels
        existing_text_labels = {
            label.text: label
            for label in labelset_obj.annotation_labels.filter(label_type=TOKEN_LABEL)
        }
        existing_doc_labels = {
            label.text: label
            for label in labelset_obj.annotation_labels.filter(label_type=DOC_TYPE_LABEL)
        }
        existing_metadata_labels = {
            label.text: label
            for label in labelset_obj.annotation_labels.filter(label_type=METADATA_LABEL)
        }

        # Create new labels if needed
        existing_text_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("text_labels", {}),
            existing_text_labels
        )
        existing_doc_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("doc_labels", {}),
            existing_doc_labels
        )
        existing_metadata_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("metadata_labels", {}),
            existing_metadata_labels
        )
        
        label_lookup = {
            **existing_text_labels,
            **existing_doc_labels,
            **existing_metadata_labels
        }
        logger.info(f"Label lookup: {label_lookup}")

        # Import the document
        logger.info("Starting document import")
        pdf_base64 = document_import_data["pdf_base64"]
        pdf_data = base64.b64decode(pdf_base64)

        pdf_file = ContentFile(pdf_data, name=f"{document_import_data['pdf_name']}.pdf")
        pawls_parse_file = ContentFile(
            json.dumps(document_import_data["doc_data"]["pawls_file_content"]).encode(
                "utf-8"
            ),
            name="pawls_tokens.json",
        )

        doc_obj = Document.objects.create(
            title=document_import_data["doc_data"]["title"],
            description=document_import_data["doc_data"].get(
                "description", "No Description"
            ),
            pdf_file=pdf_file,
            pawls_parse_file=pawls_parse_file,
            creator_id=user_id,
            page_count=document_import_data["doc_data"]["page_count"],
        )
        logger.info(f"Created document: {doc_obj.title}")
        set_permissions_for_obj_to_user(user_id, doc_obj, [PermissionTypes.ALL])

        # Link to corpus
        corpus_obj.documents.add(doc_obj)
        corpus_obj.save()
        logger.info(f"Linked document to corpus: {corpus_obj.title}")

        # Import text annotations
        doc_annotations_data = document_import_data["doc_data"]["labelled_text"]
        logger.info(
            f"Importing {len(doc_annotations_data)} text annotations"
        )
        import_annotations(
            user_id,
            doc_obj,
            corpus_obj,
            doc_annotations_data,
            label_lookup,
            label_type=TOKEN_LABEL
        )

        # Import document-level annotations
        doc_labels = document_import_data["doc_data"]["doc_labels"]
        logger.info(
            f"Importing {len(doc_labels)} doc labels"
        )
        for doc_label in doc_labels:
            label_obj = existing_doc_labels[doc_label]
            annot_obj = Annotation.objects.create(
                annotation_label=label_obj,
                document=doc_obj,
                corpus=corpus_obj,
                creator_id=user_id,
            )
            set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

        logger.info("Document import completed successfully")
        return doc_obj.id

    except Exception as e:
        logger.error(
            f"Exception encountered in document import: {e}"
        )
        return None
