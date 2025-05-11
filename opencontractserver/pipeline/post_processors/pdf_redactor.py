import io
import json
import logging
import zipfile
from typing import Mapping

from pdfredact import build_text_redacted_pdf, redact_pdf_to_images

from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.post_processor import BasePostProcessor
from opencontractserver.types.dicts import (
    OpenContractsAnnotationPythonType,
    OpenContractsExportDataJsonPythonType,
    OpenContractsSinglePageAnnotationType,
)

logger = logging.getLogger(__name__)


class PDFRedactor(BasePostProcessor):
    """
    Post-processor that redacts PDFs by overlaying black rectangles
    and removing text from annotated regions.
    """

    title: str = "PDF Redactor"
    description: str = "Redacts PDFs by overlaying black rectangles and removing text"
    author: str = "OpenContracts"
    dependencies: list[str] = ["pikepdf>=8.2.2", "reportlab"]
    input_schema: Mapping = {
        "labels_to_redact": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Restriction annotations to these labels. ALL annotations will be redacted if empty.",
            "title": "Labels to redact (provide alist of annotation label names)",
        },
    }
    supported_file_types = [FileTypeEnum.PDF]

    def __init__(self, **kwargs_super):
        """Initializes the PDFRedactor post-processor."""
        super().__init__(**kwargs_super)
        logger.info("PDFRedactor initialized.")

    def _process_export_impl(
        self,
        zip_bytes: bytes,
        export_data: OpenContractsExportDataJsonPythonType,
        **all_kwargs,
    ) -> tuple[bytes, OpenContractsExportDataJsonPythonType]:
        """
        Read a ZIP that contains PDFs and annotation data, produce a new ZIP
        with redacted PDFs.
        Settings (like 'labels_to_redact') are sourced from all_kwargs.
        """
        logger.debug(f"PDFRedactor processing export. Effective kwargs: {all_kwargs}")
        try:
            labels_to_redact = all_kwargs.get("labels_to_redact", [])

            output_zip_bytes = io.BytesIO()
            input_zip_bytes = io.BytesIO(zip_bytes)

            with zipfile.ZipFile(input_zip_bytes, "r") as input_zip, zipfile.ZipFile(
                output_zip_bytes, "w", compression=zipfile.ZIP_DEFLATED
            ) as output_zip:

                for filename in input_zip.namelist():
                    if filename.lower().endswith(".pdf"):
                        logger.info(f"Redacting PDF {filename}...")

                        pdf_data = input_zip.read(filename)
                        doc_data = export_data["annotated_docs"].get(filename, None)
                        if not doc_data:
                            logger.warning(
                                f"No annotation data for {filename}, skipping..."
                            )
                            # If no annotation data, copy PDF unchanged
                            output_zip.writestr(filename, pdf_data)
                            continue

                        pawls_pages = doc_data.get("pawls_file_content", [])
                        annotations: list[
                            OpenContractsAnnotationPythonType
                        ] = doc_data.get("labelled_text", [])

                        if labels_to_redact:
                            annotations = [
                                ann
                                for ann in annotations
                                if ann["annotationLabel"] in labels_to_redact
                            ]
                            logger.info(
                                f"Redacting annotations with labels: {labels_to_redact}"
                            )
                        else:
                            logger.info(
                                f"Redacting all {len(annotations)} annotations."
                            )

                        # This is a bunch of hoops to jump through to unnest the annotation_json
                        # into list of annotations by page. Probably aught to be in pdfredact...
                        annotation_jsons = [
                            ann["annotation_json"] for ann in annotations
                        ]
                        page_count = len(pawls_pages) if pawls_pages else 1
                        annots_by_page: dict[
                            int, list[OpenContractsSinglePageAnnotationType]
                        ] = {i: [] for i in range(page_count)}

                        for ann in annotation_jsons:
                            for p in ann:
                                annots_by_page[int(p)].append(ann[p])
                        annots_by_page_list = list(annots_by_page.values())

                        redacted_image_list = redact_pdf_to_images(
                            pdf_bytes=pdf_data,
                            pawls_pages=pawls_pages,
                            page_annotations=annots_by_page_list,
                            dpi=200,
                        )

                        # Test with BytesIO
                        output_pdf_bytesio = io.BytesIO()
                        build_text_redacted_pdf(
                            output_pdf=output_pdf_bytesio,
                            redacted_images=redacted_image_list,
                            pawls_pages=pawls_pages,
                            page_redactions=annots_by_page_list,
                            dpi=200,
                            hide_text=True,
                        )
                        output_zip.writestr(filename, output_pdf_bytesio.getvalue())
                    else:
                        file_bytes = input_zip.read(filename)
                        output_zip.writestr(filename, file_bytes)

            output_zip_bytes.seek(0)
            return output_zip_bytes.getvalue(), export_data
        except Exception as e:
            logger.error(
                f"Error redacting PDF: {e}\n\n{json.dumps(export_data, indent=4)}"
            )
            return zip_bytes, export_data
