import base64
import json
import logging
import zipfile
from typing import Optional

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile, File

from config import celery_app
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
from opencontractserver.utils.importing import import_annotations, load_or_create_labels
from opencontractserver.utils.packaging import (
    unpack_corpus_from_export,
    unpack_label_set_from_export,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

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
        user_obj = User.objects.get(id=user_id)

        with temporary_file_handle.file.open("rb") as import_file, zipfile.ZipFile(
            import_file, mode="r"
        ) as import_zip:
            logger.info("import_corpus() - Data decoded successfully")
            files = import_zip.namelist()
            logger.info(f"import_corpus() - Raw files: {files}")

            if "data.json" in files:
                files.remove("data.json")
                with import_zip.open("data.json") as corpus_data:
                    data_json: OpenContractsExportDataJsonPythonType = json.loads(
                        corpus_data.read().decode("UTF-8")
                    )

                    text_labels = data_json["text_labels"]
                    doc_labels = data_json["doc_labels"]
                    label_set_data = {**data_json["label_set"]}
                    label_set_data.pop("id", None)
                    corpus_data_json = {**data_json["corpus"]}
                    corpus_data_json.pop("id", None)

                    # Create LabelSet
                    labelset_obj = unpack_label_set_from_export(
                        label_set_data, user_obj
                    )
                    logger.info(f"LabelSet created: {labelset_obj}")

                    # Create Corpus
                    corpus_kwargs = {
                        "data": corpus_data_json,
                        "user": user_obj,
                        "label_set_id": labelset_obj.id,
                        "corpus_id": seed_corpus_id if seed_corpus_id else None,
                    }
                    corpus_obj = unpack_corpus_from_export(**corpus_kwargs)
                    logger.info(f"Created corpus_obj: {corpus_obj}")

                    # Prepare label data
                    existing_text_labels = {}
                    existing_doc_labels = {}
                    text_label_data_dict = {
                        label_name: label_info
                        for label_name, label_info in text_labels.items()
                    }
                    doc_label_data_dict = {
                        label_name: label_info
                        for label_name, label_info in doc_labels.items()
                    }

                    # Load or create labels
                    existing_text_labels = load_or_create_labels(
                        user_id=user_id,
                        labelset_obj=labelset_obj,
                        label_data_dict=text_label_data_dict,
                        existing_labels=existing_text_labels,
                    )
                    existing_doc_labels = load_or_create_labels(
                        user_id=user_id,
                        labelset_obj=labelset_obj,
                        label_data_dict=doc_label_data_dict,
                        existing_labels=existing_doc_labels,
                    )
                    label_lookup = {**existing_text_labels, **existing_doc_labels}

                    # Iterate over documents
                    for doc_filename in data_json["annotated_docs"]:
                        logger.info(f"Start load for doc: {doc_filename}")
                        doc_data = data_json["annotated_docs"][doc_filename]
                        txt_content = doc_data["content"]
                        pawls_layers = doc_data["pawls_file_content"]

                        try:
                            with import_zip.open(doc_filename) as pdf_file_handle:
                                pdf_file = File(pdf_file_handle, doc_filename)
                                logger.info("pdf_file obj created in memory")

                                pawls_parse_file = ContentFile(
                                    json.dumps(pawls_layers).encode("utf-8"),
                                    name="pawls_tokens.json",
                                )
                                logger.info("Pawls parse file obj created in memory")

                                txt_extract_file = ContentFile(
                                    txt_content.encode("utf-8"),
                                    name="extracted_text.txt",
                                )
                                logger.info("Text extract file obj created in memory")

                                # Create Document instance
                                doc_obj = Document.objects.create(
                                    title=doc_data["title"],
                                    description=f"Imported document with filename {doc_filename}",
                                    pdf_file=pdf_file,
                                    pawls_parse_file=pawls_parse_file,
                                    txt_extract_file=txt_extract_file,
                                    backend_lock=True,  # Prevent immediate processing
                                    creator=user_obj,
                                    page_count=len(pawls_layers),
                                )
                                logger.info(f"Doc created: {doc_obj}")

                                set_permissions_for_obj_to_user(
                                    user_obj, doc_obj, [PermissionTypes.ALL]
                                )

                                # Link Document to Corpus
                                corpus_obj.documents.add(doc_obj)
                                corpus_obj.save()

                                # Import Document-level annotations
                                doc_labels_list = doc_data.get("doc_labels", [])
                                for doc_label_name in doc_labels_list:
                                    label_obj = existing_doc_labels.get(doc_label_name)
                                    if label_obj:
                                        annot_obj = Annotation.objects.create(
                                            annotation_label=label_obj,
                                            document=doc_obj,
                                            corpus=corpus_obj,
                                            creator=user_obj,
                                        )
                                        set_permissions_for_obj_to_user(
                                            user_obj, annot_obj, [PermissionTypes.ALL]
                                        )

                                # Import Text annotations
                                text_annotations_data = doc_data.get(
                                    "labelled_text", []
                                )
                                import_annotations(
                                    user_id=user_id,
                                    doc_obj=doc_obj,
                                    corpus_obj=corpus_obj,
                                    annotations_data=text_annotations_data,
                                    label_lookup=label_lookup,
                                    label_type=TOKEN_LABEL,
                                )

                                # Unlock the document
                                doc_obj.backend_lock = False
                                doc_obj.save()
                                logger.info("Doc load complete.")

                        except Exception as e:
                            logger.error(
                                f"import_corpus() - Error loading document {doc_filename}: {e}"
                            )

                    return corpus_obj.id

            # If data.json is not found
            logger.error("import_corpus() - data.json not found in import zip.")
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
            for label in labelset_obj.annotation_labels.filter(
                label_type=DOC_TYPE_LABEL
            )
        }
        existing_metadata_labels = {
            label.text: label
            for label in labelset_obj.annotation_labels.filter(
                label_type=METADATA_LABEL
            )
        }

        # Create new labels if needed
        existing_text_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("text_labels", {}),
            existing_text_labels,
        )
        existing_doc_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("doc_labels", {}),
            existing_doc_labels,
        )
        existing_metadata_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("metadata_labels", {}),
            existing_metadata_labels,
        )

        label_lookup = {
            **existing_text_labels,
            **existing_doc_labels,
            **existing_metadata_labels,
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
        logger.info(f"Importing {len(doc_annotations_data)} text annotations")
        import_annotations(
            user_id,
            doc_obj,
            corpus_obj,
            doc_annotations_data,
            label_lookup,
            label_type=TOKEN_LABEL,
        )

        # Import document-level annotations
        doc_labels = document_import_data["doc_data"]["doc_labels"]
        logger.info(f"Importing {len(doc_labels)} doc labels")
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
        logger.error(f"Exception encountered in document import: {e}")
        return None
