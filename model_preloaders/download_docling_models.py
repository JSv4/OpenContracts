from pathlib import Path
import logging

from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def download_docling_models(artifacts_path: str) -> None:
    """
    Downloads the Docling models to the specified artifacts path.

    Args:
        artifacts_path (str): The directory where the models will be saved.
    """
    
    # TODO - EasyOCR models are still downloading at runtime (but docling models are now successfuly loaded to disk)
    """
    WARNING 2024-12-16 20:58:41,682 easyocr 1 139679004428096 Neither CUDA nor MPS are available - defaulting to CPU. Note: This module is much faster with a GPU.
WARNING 2024-12-16 20:58:41,686 easyocr 1 139679004428096 Downloading detection model, please wait. This may take several minutes depending upon your network connection.  
Progress: |██████████████████████████████████████████████████| 100.0% CompleteINFO 2024-12-16 20:58:48,602 easyocr 1 139679004428096 Download complete
WARNING 2024-12-16 20:58:48,603 easyocr 1 139679004428096 Downloading recognition model, please wait. This may take several minutes depending upon your network connection.
Progress: |██████████████████████████████████████████████████| 100.0% CompleteINFO 2024-12-16 20:58:50,558 easyocr 1 139679004428096 Download complete.
    """
    
    # Create the directory if it doesn't exist
    Path(artifacts_path).mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading Docling models to '{artifacts_path}'...")

    # Explicitly prefetch and download the models
    StandardPdfPipeline.download_models_hf(local_dir=artifacts_path, force=True)

    logger.info(f"Docling models have been downloaded and saved to '{artifacts_path}'.")

if __name__ == "__main__":
    # Directory to save the models (absolute path)
    artifacts_path = "/models/docling"
    download_docling_models(artifacts_path)
