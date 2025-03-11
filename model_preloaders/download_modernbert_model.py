import os
import logging

from sentence_transformers import SentenceTransformer

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Directory to save the model (absolute path)
cache_dir = "/models"

# Model name
model_name = "answerdotai/ModernBERT-base"

# Full path where the model will be saved
model_save_path = os.path.join(
    cache_dir, "sentence-transformers", "ModernBERT-base"
)

def download_model():
    """
    Download and save the ModernBERT model for sentence embeddings.
    """
    try:
        logger.info(f"Downloading ModernBERT model: {model_name}")
        
        # Download and save the sentence transformer model
        model = SentenceTransformer(
            model_name,
            cache_folder=cache_dir,
        )
        
        # Save the model to the desired path
        model.save(model_save_path)
        
        logger.info(f"ModernBERT model has been downloaded and saved to '{model_save_path}'.")
        
        # Test the model with a simple example
        test_sentence = "This is a test sentence for the ModernBERT model."
        embedding = model.encode(test_sentence)
        
        logger.info(f"Model test successful. Embedding shape: {embedding.shape}")
        
        return True
    except Exception as e:
        logger.error(f"Error downloading ModernBERT model: {e}")
        return False

if __name__ == "__main__":
    # Create the cache directory if it doesn't exist
    os.makedirs(os.path.join(cache_dir, "sentence-transformers"), exist_ok=True)
    
    # Download the model
    success = download_model()
    
    if success:
        print(f"✅ ModernBERT model successfully downloaded to '{model_save_path}'")
    else:
        print("❌ Failed to download ModernBERT model") 