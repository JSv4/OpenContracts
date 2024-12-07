from pathlib import Path
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

# Directory to save the models (absolute path)
artifacts_path = "/models/docling"

# Create the directory if it doesn't exist
Path(artifacts_path).mkdir(parents=True, exist_ok=True)

# Download the models from HuggingFace
pipeline_options = PdfPipelineOptions(artifacts_path=artifacts_path)
doc_converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

print(f"Docling models have been downloaded and saved to '{artifacts_path}'")