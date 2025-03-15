import argparse
import json
import zipfile
from typing import Dict, Any, Optional
from datasets import load_dataset


def export_minn_dataset_to_zip(
    output_zip_path: str,
    max_docs: int = 100
) -> None:
    """
    Exports the free-law/minn dataset from Hugging Face into a ZIP file
    containing:
      - A data.json file structured according to OpenContractsExportDataJsonPythonType
      - Individual .txt files, one per case's text content

    Args:
        output_zip_path (str): The path to the output ZIP file.
        max_docs (int): The maximum number of documents to export.
    """
    ds = load_dataset("free-law/minn")["train"]

    # Prepare top-level data.json fields
    annotated_docs: Dict[str, Dict[str, Any]] = {}
    doc_labels: Dict[str, Any] = {}
    text_labels: Dict[str, Any] = {}

    # Minimal corpus metadata
    corpus = {
        "id": 1,
        "title": "Minn Corpus",
        "description": "A corpus of Minnesota court cases exported from HF.",
        "icon_data": None,
        "icon_name": None,
        "creator": "N/A",
        "label_set": "NoLabels",
    }

    # Minimal label set metadata
    label_set = {
        "id": "NoLabels",
        "title": "No label set",
        "description": "",
        "icon_data": None,
        "icon_name": "none",
        "creator": "N/A",
    }

    # Build annotated_docs entries
    for i, row in enumerate(ds):
        if i >= max_docs:
            break

        # Build a simple markdown snippet for the 'description' field,
        # bundling up select metadata
        metadata_md = (
            f"### Metadata\n\n"
            f"**ID**: {row.get('id', '')}\n\n"
            f"**Name Abbreviation**: {row.get('name_abbreviation', '')}\n\n"
            f"**Decision Date**: {row.get('decision_date', '')}\n\n"
            f"**Parties**: {row.get('parties', '')}\n\n"
            f"**Docket Number**: {row.get('docket_number', '')}\n"
        )

        # We use TXT for the "filename" as a stand-in for PDF.
        doc_filename = f"{row['id']}.txt" if 'id' in row else f"doc_{i}.txt"
        text_content = row.get("text", "")

        annotated_docs[doc_filename] = {
            "title": row.get("name", f"Case {row.get('id', i)}"),
            "content": text_content,
            "description": metadata_md,
            "pawls_file_content": [],  # No PDF tokenization, so empty
            "page_count": 1,
            # Fields inherited from OpenContractsDocAnnotations
            "doc_labels": [],
            "labelled_text": [],
            # If relationships were used, they'd go here (NotRequired).
        }

    # Assemble final data.json structure
    data_json = {
        "annotated_docs": annotated_docs,
        "doc_labels": doc_labels,
        "text_labels": text_labels,
        "corpus": corpus,
        "label_set": label_set,
    }

    # Write out to a ZIP with data.json and individual .txt files
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json.dumps(data_json, indent=2))
        for doc_filename, doc_data in annotated_docs.items():
            text_body = doc_data["content"]
            zf.writestr(doc_filename, text_body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Export the free-law/minn dataset into a ZIP "
                    "containing data.json and text files."
    )
    parser.add_argument(
        "--output-zip",
        type=str,
        default="minn_export.zip",
        help="Path to the output ZIP file."
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=100,
        help="Maximum number of documents to include in the export."
    )
    args = parser.parse_args()
    export_minn_dataset_to_zip(args.output_zip, args.max_docs) 