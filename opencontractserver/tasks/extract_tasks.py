import logging

import marvin
from celery import chord, group, shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.agent import FunctionCallingAgentWorker, StructuredPlannerAgent
from llama_index.core.tools import QueryEngineTool
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI
from pydantic import BaseModel

from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.etl import parse_model_or_primitive
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)

# Pass OpenAI API key to marvin for parsing / extract
marvin.settings.openai.api_key = settings.OPENAI_API_KEY


# Mock these functions for now
def agent_fetch_my_definitions(annot):
    return []


def extract_for_query(annots, query, output_type):
    return None


@shared_task
def mark_extract_complete(extract_id):
    extract = Extract.objects.get(pk=extract_id)
    extract.finished = timezone.now()
    extract.save()


@shared_task
def run_extract(extract_id, user_id):
    logger.info(f"Run extract for extract {extract_id}")

    extract = Extract.objects.get(pk=extract_id)

    with transaction.atomic():
        extract.started = timezone.now()
        extract.save()

    fieldset = extract.fieldset

    document_ids = extract.documents.all().values_list("id", flat=True)
    print(f"Run extract {extract_id} over document ids {document_ids}")
    tasks = []

    for document_id in document_ids:
        for column in fieldset.columns.all():
            with transaction.atomic():
                cell = Datacell.objects.create(
                    extract=extract,
                    column=column,
                    data_definition=column.output_type,
                    creator_id=user_id,
                    document_id=document_id,
                )
                set_permissions_for_obj_to_user(user_id, cell, [PermissionTypes.CRUD])

                # Kick off processing job for cell in queue as soon as it's created.
                tasks.append(llama_index_doc_query.si(cell.pk))

    chord(group(*tasks))(mark_extract_complete.si(extract_id))


@shared_task
def llama_index_doc_query(cell_id, similarity_top_k=3):
    """
    Use LlamaIndex to run queries specified for a particular cell
    """

    datacell = Datacell.objects.get(id=cell_id)
    print(f"Process datacell {datacell}")

    try:

        datacell.started = timezone.now()
        datacell.save()

        document = datacell.document
        embed_model = HuggingFaceEmbedding(
            model_name="sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
        )
        Settings.embed_model = embed_model

        llm = OpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
        Settings.llm = llm

        vector_store = DjangoAnnotationVectorStore.from_params(
            document_id=document.id, must_have_text=datacell.column.must_contain_text
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

        # search_text
        search_text = datacell.column.match_text
        query = datacell.column.query
        output_type = parse_model_or_primitive(datacell.column.output_type)
        print(f"Output type: {output_type}")
        parse_instructions = datacell.column.instructions

        retriever = index.as_retriever(similarity_top_k=similarity_top_k)

        results = retriever.retrieve(search_text if search_text else query)
        for r in results:
            print(f"Result: {r.node.extra_info}:\n{r}")
        retrieved_annotation_ids = [n.node.extra_info['annotation_id'] for n in results]
        print(f"retrieved_annotation_ids: {retrieved_annotation_ids}")
        datacell.sources.add(*retrieved_annotation_ids)

        retrieved_text = "\n".join(
            [f"```Relevant Section:\n\n{n.text}\n```" for n in results]
        )
        print(f"Retrieved text: {retrieved_text}")

        # TODO - eventually this can just be pulled from a separate Django vector index where we filter to definitions!
        definitions = ""
        if datacell.column.agentic:
            import nest_asyncio

            nest_asyncio.apply()

            engine = index.as_query_engine(similarity_top_k=similarity_top_k)

            query_engine_tools = [
                QueryEngineTool.from_defaults(
                    query_engine=engine,
                    name="document_parts",
                    description="Let's you use hybrid or vector search over this document to search for specific text "
                    "semantically or using text search.",
                )
            ]

            # create the function calling worker for reasoning
            worker = FunctionCallingAgentWorker.from_tools(
                query_engine_tools, verbose=True
            )

            # wrap the worker in the top-level planner
            agent = StructuredPlannerAgent(
                worker, tools=query_engine_tools, verbose=True
            )

            # TODO - eventually capture section hierarchy as nlm-sherpa does so we can query up a retrieved chunk to
            #  its parent section

            response = agent.query(
                f"""Please identify all of the defined terms - capitalized terms that are not well-known proper nouns,
                terms that in quotation marks or terms that are clearly definitions in the context of a given sentence,
                 such as blah blah, as used herein - the bros - and find their definitions. Likewise, if you see a
                 section reference, try to retrieve the original section text. You produce an output that looks like
                 this:
                ```

                ### Related sections and definitions ##########

                [defined term name]: definition
                ...

                [section name]: text
                ...

                ```

                Now, given the text to analyze below, please perform the analysis for this original text:
                ```
                {retrieved_text}
                ```
                """
            )
            definitions = str(response)

        retrieved_text = (
            f"Related Document:\n```\n{retrieved_text}\n```\n\n" + definitions
        )

        print(f"Resulting data for marvin: {retrieved_text}")

        if datacell.column.extract_is_list:
            print("Extract as list!")
            if parse_instructions:
                result = marvin.extract(
                    retrieved_text, target=output_type, instructions=parse_instructions
                )
            else:
                result = marvin.extract(retrieved_text, target=output_type)
        else:
            print("Extract single instance")
            if parse_instructions:
                result = marvin.cast(
                    retrieved_text, target=output_type, instructions=parse_instructions
                )
            else:
                result = marvin.cast(retrieved_text, target=output_type)

        print(f"Result processed from marvin: {result}")
        logger.debug(
            f"run_extract() - processing column datacell {datacell.id} for {datacell.document.id}"
        )

        if issubclass(output_type, BaseModel) or isinstance(output_type, BaseModel):
            datacell.data = {"data": result.model_dump()}
        elif output_type in [str, int, bool, float]:
            datacell.data = {"data": result}
        else:
            raise ValueError(f"Unsupported output type: {output_type}")
        datacell.completed = timezone.now()
        datacell.save()

    except Exception as e:
        logger.error(f"run_extract() - Ran into error: {e}")
        datacell.stacktrace = f"Error processing: {e}"
        datacell.failed = timezone.now()
        datacell.save()
