import os
import re
import traceback
from typing import NoReturn

from django.conf import settings
from django.utils import timezone
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.query_engine import CitationQueryEngine
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

from config import celery_app
from opencontractserver.corpuses.models import CorpusQuery
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore


@celery_app.task()
def run_query(
    query_id: str | int,
) -> NoReturn:

    query = CorpusQuery.objects.get(id=query_id)
    query.started = timezone.now()
    query.save()

    try:
        model_path = "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model path not found: {model_path}")
        print(f"Loading model from: {model_path}")
        embed_model = HuggingFaceEmbedding(
            model_name=model_path,
        )
        Settings.embed_model = embed_model

        llm = OpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
        Settings.llm = llm

        vector_store = DjangoAnnotationVectorStore.from_params(
            corpus_id=query.corpus.id
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

        query_engine = CitationQueryEngine.from_args(
            index,
            similarity_top_k=3,
            # here we can control how granular citation sources are, the default is 512
            citation_chunk_size=512,
        )
        print(f"Query engine: {query_engine}")

        response = query_engine.query(str(query.query))
        print(f"{len(response.source_nodes)} Sources: {response.source_nodes[0].node}")

        # Parse the citations to actual links
        markdown_text = str(response)
        annotation_ids = []
        for index, obj in enumerate(response.source_nodes, start=1):
            pk = obj.node.extra_info["annotation_id"]
            pattern = re.compile(rf"\[{index}\]")
            markdown_text = pattern.sub(f"[[{index}]({pk})]", markdown_text)
            annotation_ids.append(pk)

        query.sources.add(*annotation_ids)
        query.response = markdown_text
        query.completed = timezone.now()
        query.save()

    except Exception as e:
        print(f"Query failed: {e}")
        query.failed = timezone.now()
        query.stacktrace = traceback.format_exc()
        query.save()
