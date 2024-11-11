import os

from sentence_transformers import SentenceTransformer

# Directory to save the model (absolute path)
cache_dir = "/models"

# Full path where the model will be saved
model_save_path = os.path.join(
    cache_dir, "sentence-transformers", "multi-qa-MiniLM-L6-cos-v1"
)

# Download and save the sentence transformer model
model = SentenceTransformer(
    "multi-qa-MiniLM-L6-cos-v1",
    cache_folder=cache_dir,
)

# Save the model to the desired path
model.save(model_save_path)

print(
    f"Sentence transformer model has been downloaded and saved to '{model_save_path}'."
)
