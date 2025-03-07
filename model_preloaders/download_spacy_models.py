import logging
import subprocess
import sys

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def download_spacy_models():
    """
    Downloads and caches spaCy models to ensure they're available at runtime.
    Uses the default spaCy model location.
    """
    # List of models to download
    models = ["en_core_web_sm", "en_core_web_lg"]

    for model in models:
        logger.info(f"Downloading spaCy model: {model}")
        try:
            # Use subprocess to run the spacy download command
            subprocess.check_call([sys.executable, "-m", "spacy", "download", model])
            logger.info(f"Successfully downloaded {model}")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to download {model}: {e}")
            raise

    logger.info("All spaCy models have been downloaded")


if __name__ == "__main__":
    download_spacy_models()
