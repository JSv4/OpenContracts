from __future__ import annotations

import base64
import io
import json
import logging
import zipfile

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.utils import timezone

from opencontractserver.corpuses.models import Corpus
from opencontractserver.pipeline.utils import run_post_processors
from opencontractserver.types.dicts import (
    AnnotationLabelPythonType,
    FunsdAnnotationType,
    OpenContractDocExport,
    OpenContractsExportDataJsonPythonType,
)
from opencontractserver.users.models import UserExport
from opencontractserver.utils.packaging import (
    package_corpus_for_export,
    package_label_set_for_export,
)
from opencontractserver.utils.text import only_alphanumeric_chars

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@shared_task
def on_demand_post_processors(export_id: str | int, corpus_pk: str | int):
    try:
        export = UserExport.objects.get(pk=export_id)
        corpus = Corpus.objects.get(pk=corpus_pk)

        if export.post_processors:

            # Get the current zip bytes

            with default_storage.open(export.file.name, "rb") as export_file:
                current_zip_bytes = export_file.read()

            with zipfile.ZipFile(io.BytesIO(current_zip_bytes), "r") as input_zip:
                input_data = json.loads(input_zip.read("data.json").decode("utf-8"))

            # Run post-processors
            modified_zip_bytes, modified_export_data = run_post_processors(
                export.post_processors,
                current_zip_bytes,
                input_data,
                export.input_kwargs,
            )

            # Create new zip file with modified data
            output_buffer = io.BytesIO(modified_zip_bytes)
            export.file.save(f"{corpus.title} EXPORT.zip", output_buffer)
            export.finished = timezone.now()
            export.backend_lock = False
            export.save()

    except Exception as e:
        logger.error(f"Error running post-processors for export {export_id}: {str(e)}")
        raise


# @celery_app.task(bind=True)
@shared_task
def package_annotated_docs(
    burned_docs: tuple[
        tuple[
            str | None,
            str | None,
            OpenContractDocExport | None,
            dict[str | int, AnnotationLabelPythonType],
            dict[str | int, AnnotationLabelPythonType],
        ]
    ],
    export_id: str | int,
    corpus_pk: str | int,
):

    logger.info(f"Package corpus for export {export_id}...")

    annotated_docs = {}
    doc_labels: dict[str | int, AnnotationLabelPythonType] | None = None
    text_labels: dict[str | int, AnnotationLabelPythonType] | None = None

    corpus = Corpus.objects.get(id=corpus_pk)

    output_bytes = io.BytesIO()
    zip_file = zipfile.ZipFile(output_bytes, mode="w", compression=zipfile.ZIP_DEFLATED)

    for doc in burned_docs:

        # logger.info(f"Handling burned doc: {doc[0]}")

        if not doc_labels:
            doc_labels: dict[str | int, AnnotationLabelPythonType] = doc[4]

        if not text_labels:
            text_labels: dict[str | int, AnnotationLabelPythonType] = doc[3]

        base64_img_bytes = doc[1].encode("utf-8")
        decoded_file_data = base64.decodebytes(base64_img_bytes)
        # logger.info("Data decoded successfully")

        zip_file.writestr(doc[0], decoded_file_data)
        # logger.info("Pdf written successfully")

        annotated_docs[doc[0]] = doc[2]
        # logger.info("doc json added to json")

    export_file_data: OpenContractsExportDataJsonPythonType = {
        "annotated_docs": annotated_docs,
        "corpus": package_corpus_for_export(corpus),
        "label_set": package_label_set_for_export(corpus.label_set),
        "doc_labels": doc_labels,
        "text_labels": text_labels,
    }

    # Run any configured post-processors
    if corpus.post_processors:
        try:
            # Get the current zip bytes
            zip_file.close()
            output_bytes.seek(io.SEEK_SET)
            current_zip_bytes = output_bytes.getvalue()

            # Run post-processors
            modified_zip_bytes, modified_export_data = run_post_processors(
                corpus.post_processors, current_zip_bytes, export_file_data
            )

            # Create new zip file with modified data
            output_bytes = io.BytesIO(modified_zip_bytes)
            zip_file = zipfile.ZipFile(
                output_bytes, mode="a", compression=zipfile.ZIP_DEFLATED
            )
            export_file_data = modified_export_data
        except Exception as e:
            logger.error(
                f"Error running post-processors for corpus {corpus_pk}: {str(e)}"
            )
            raise

    # Write the final data.json
    json_str = json.dumps(export_file_data) + "\n"
    json_bytes = json_str.encode("utf-8")
    zip_file.writestr("data.json", json_bytes)
    zip_file.close()

    output_bytes.seek(io.SEEK_SET)

    export = UserExport.objects.get(pk=export_id)
    export.file.save(f"{corpus.title} EXPORT.zip", output_bytes)
    export.save()

    logger.info(f"Export {export_id} is completed. Signal should now notify creator.")


@shared_task
def package_funsd_exports(
    funsd_data: tuple[
        tuple[
            int,
            dict[int | str, list[dict[int | str, FunsdAnnotationType]]],
            list[tuple[int, str, str]],
        ]
    ],
    export_id: str | int,
    corpus_pk: str | int,
):

    logger.info(f"package_funsd_exports() - data:\n{json.dumps(funsd_data, indent=4)}")

    s3 = None

    corpus = Corpus.objects.get(id=corpus_pk)

    output_bytes = io.BytesIO()
    zip_file = zipfile.ZipFile(output_bytes, mode="w", compression=zipfile.ZIP_DEFLATED)

    if settings.USE_AWS:

        import boto3

        logger.info("process_pdf_page() - Load obj from s3")
        s3 = boto3.client("s3")

    for doc_data in funsd_data:

        doc_id, funsd_annotations, page_image_paths = doc_data

        for index, page_data in enumerate(page_image_paths):

            doc_id, page_path, file_type = page_data

            # Load page image
            if settings.USE_AWS:
                page_obj = s3.get_object(
                    Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=page_path
                )
                page_data = page_obj["Body"].read()
            else:
                with open(page_path, "rb") as page_file:
                    page_data = page_file.read()

            # Write page image
            zip_file.writestr(f"images/doc_{doc_id}-pg_{index}.{file_type}", page_data)

            # Load page funds annots
            if str(index) in funsd_annotations:
                annots = funsd_annotations[str(index)]
            else:
                annots = []

            page_annots = {"form": annots}

            # Write page funds annot
            zip_file.writestr(
                f"annotations/doc_{doc_id}-pg_{index}.json",
                json.dumps(page_annots, indent=4),
            )

    zip_file.close()
    output_bytes.seek(io.SEEK_SET)

    export = UserExport.objects.get(pk=export_id)
    export.file.save(
        f"{only_alphanumeric_chars(corpus.title)} FUNSD EXPORT.zip", output_bytes
    )
    export.finished = timezone.now()
    export.backend_lock = False
    export.save()
