import os
from sentence_transformers import SentenceTransformer

# Specify the desired sentence transformer model
model_name = "multi-qa-MiniLM-L6-cos-v1"

# Directory to save the model (absolute path)
cache_dir = "/models"

# Create the directory if it doesn't exist
os.makedirs(cache_dir, exist_ok=True)

# Download and save the sentence transformer model
model = SentenceTransformer(model_name, cache_folder=cache_dir)

print(f"Sentence transformer model '{model_name}' has been downloaded and saved to '{cache_dir}'.")
