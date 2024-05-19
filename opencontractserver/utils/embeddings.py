from typing import Optional

import requests
import numpy
import logging

from django.conf import settings
import numpy as np

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def calculate_embedding_for_text(
    text: str
) -> Optional[list[float | int]]:

    # Try to get natural lang text and create embeddings
    natural_lang_embeddings = None
    try:
        print("Prepare to get natural lang embeddings")
        response = requests.post(
            f'{settings.EMBEDDINGS_MICROSERVICE_URL}/embeddings',
            json={'text': text},
            headers={'X-API-Key': settings.VECTOR_EMBEDDER_API_KEY}
        )
        print(f"Response is: {response}")

        if response.status_code == 200:
            natural_lang_embeddings = np.array(response.json()['embeddings'])
            print(f"natural_lang_embeddings {natural_lang_embeddings.shape}")
            nan_mask = numpy.isnan(natural_lang_embeddings)
            any_nan = numpy.any(nan_mask)
            print(f"\tnatural_lang_embeddings has nan value: {any_nan}")
            if any_nan:
                natural_lang_embeddings = None
            else:
                natural_lang_embeddings = natural_lang_embeddings[0]
                print(f"\tnatural_lang_embeddings: {natural_lang_embeddings[0].shape}")
        print(f"natural_lang_embeddings: {natural_lang_embeddings}")
    except Exception as e:
        logger.error(f"calculate_embedding_for_text() - failed to generate embeddings due to error: {e}")

    return natural_lang_embeddings
