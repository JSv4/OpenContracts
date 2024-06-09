import traceback
from typing import NoReturn

from django.conf import settings
from django.utils import timezone
from llama_index.core import Settings, VectorStoreIndex

from config import celery_app

from llama_index.core.query_engine import CitationQueryEngine
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from opencontractserver.corpuses.models import CorpusQuery
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore


@celery_app.task()
def run_query(
    query_id: str | int,
) -> NoReturn:

    # TODO - better structured outputs that can be rendered on the frontend.
    query = CorpusQuery.objects.get(id=query_id)
    query.started = timezone.now()
    query.save()

    try:
        embed_model = HuggingFaceEmbedding(model_name="sentence-transformers/multi-qa-MiniLM-L6-cos-v1")
        Settings.embed_model = embed_model

        llm = OpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY
        )
        Settings.llm = llm

        vector_store = DjangoAnnotationVectorStore.from_params(corpus_id=query.corpus.id)
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

        query_engine = CitationQueryEngine.from_args(
            index,
            similarity_top_k=3,
            # here we can control how granular citation sources are, the default is 512
            citation_chunk_size=512,
        )
        response = query_engine.query(str(query.query))
        print(f"{len(response.source_nodes)} Sources: {response.source_nodes[0].node}")
        query.response = str(response)
        query.completed = timezone.now()
        query.save()

    except Exception as e:
        query.failed = timezone.now()
        query.stacktrace = traceback.format_exc()
        query.save()
