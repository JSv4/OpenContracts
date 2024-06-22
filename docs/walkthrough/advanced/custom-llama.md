# Why Llama Index

We assume you're already familiar wtih [LlamaIndex](https://github.com/run-llama/llama_index), the "data framework for
your LLM applications". It has a rich ecosystem of integrations, prompt templates, agents, retrieval techniques and
more to let you customize how your LLMs interact with data.

# How do we Integrate with LlamaIndex?

We've written a custom implementation of one of LlamaIndex's core building blocks - the VectorStore - that lets
LlamaIndex use OpenContracts as a vector store. Our `DjangoAnnotationVectorStore` in
`opencontractserver/llms/vector_stores.py` lets you quickly write a LlamaIndex agent or question answering pipeline
using the rich annotations and structural data (like annotation positions, layout class - e.g. header - and more)
in OpenContracts. See more in
[the documentation](https://docs.llamaindex.ai/en/stable/module_guides/indexing/vector_store_guide/) about VectorStores.

## OpenContracts's LlamaIndex-compatible Vector Store: DjangoAnnotationVectorStore

Our `DjangoAnnotationVectorStore` integrates the LlamaIndex ecosystem with Django ORM, enabling advanced querying and
filtering capabilities within a Django application.

Our out-of-the-box implementation of LlamaIndex leverages a number of LlamaIndex techniques to provide the most relevant
parts of the document responsive to a given question. We'll show you later how to write your own processing task with
your the LlamaIndex retrieval techniques best-suited to your use-case. This lets you leverage the power of
OpenContracts - including the ability to display the annotations that were used to answer a question!

## Detailed Walkthrough of Our Data Extract Tasks using DjangoAnnotationVectorStore

### `run_extract` Task

The run_extract task orchestrates the extraction process. We don't recommend you modify the orchestrator, though you 
can. You'll want to have a good understanding of 
[celery](https://docs.celeryq.dev/en/stable/getting-started/introduction.html) if you modify this.

The core thing to understand is the extracts are run asynchronously by celery workers (again, read the celery docs if 
you are not familiar and want to know more). For each data extract column - basically a set of questions and text we're going to search for - for _each_
document in the extract, we create a data extraction task `llama_index_doc_query` that will use LlamaIndex to retrieve
the most relevant text:

```python
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
            tasks.append(llama_index_doc_query.si(cell.pk))
```

- **Nested Loops**: We iterate over each document and each column in the fieldset.
- **Atomic Transaction**: Each `Datacell` creation is wrapped in a transaction to ensure data integrity.
- **Create Datacell**: We create a `Datacell` object for each document-column pair. The `Datacell` will store the
  extraction results.
- **Set Permissions**: We set CRUD (Create, Read, Update, Delete) permissions for the user on the created `Datacell`.
- **Queue Task**: We queue a task (`llama_index_doc_query`) for processing the `Datacell` by appending it to the
  `tasks` list. The task is queued with the primary key (`pk`) of the `Datacell`.

#### Run Tasks in Parallel

Finally, our orchestrator kicks off the processing tasks as a celery group, ensuring they are consumed in parallel by
whatever available celery workers we have (you don't need to worry about the orhestration).

```python
    chord(group(*tasks))(mark_extract_complete.si(extract_id))
```

- **Parallel Execution**: We use Celery's `group` and `chord` to run all tasks in parallel. The `group` executes
  all tasks, and the `chord` ensures that `mark_extract_complete` is called once all tasks are finished.
- **Completion Task**: The `mark_extract_complete` task will be called with the `extract_id` once all
  document-column processing tasks are complete.

### `llama_index_doc_query` Task

Each datacell - or extracted datapoint, remember one per document per column - is extracted by the 
`llama_index_doc_query` task. **Modify this task** if you want to tweak your retrieval behavior. We have plans to make 
it easier to simply register a new LlamaIndex pipeline and select that from the frontend. 

#### Task Definition and Initial Setup

Each `llama_index_doc_query` task requries a Datacell id as an argument, and the relevant column information (and LLM
instructions) are loaded from the column linked to the Datacell.

```python
@shared_task
def llama_index_doc_query(cell_id, similarity_top_k=15, max_token_length: int = 512):
    datacell = Datacell.objects.get(id=cell_id)
    logger.info(f"Process datacell {datacell}")
```

- **Task Definition**: We define a Celery task named `llama_index_doc_query`. This task processes a single `Datacell`.
- **Retrieve Datacell**: We fetch the `Datacell` object from the database using its primary key (`cell_id`). This object
  contains details about the document and column to process.
- **Logging**: We log the datacell being processed for tracking and debugging purposes.

#### Mark Datacell as Started

Once the task kicks off, step one is to log in the DB that the task has started:

```python
    try:
    datacell.started = timezone.now()
    datacell.save()
```

- **Exception Handling**: We use a `try` block to handle any exceptions that might occur during the processing.
- **Set Started Timestamp**: We set the `started` field to the current time to mark the beginning of the datacell
  processing.
- **Save Changes**: We save the `Datacell` object to the database.

#### Configure Embeddings and LLM Settings

Then, we create our embeddings module. We actually have a microservice for this to cut down on memory usage and allow
for easier scaling of the compute-intensive parts of the app. For now, though, the task does not call the microservice
so we're using a lightweight sentence tranformer embeddings model:

```python
    document = datacell.document

    embed_model = HuggingFaceEmbedding(
        model_name="multi-qa-MiniLM-L6-cos-v1", cache_folder="/models"
    )
    Settings.embed_model = embed_model
    
    llm = OpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
    Settings.llm = llm
```

- **Retrieve Document**: We fetch the document associated with the datacell.
- **Configure Embedding Model**: We set up the HuggingFace embedding model. This model converts text into embeddings (
  vector representations) which are essential for semantic search.
- **Set Embedding Model in Settings**: We assign the embedding model to `Settings.embed_model` for global access within
  the task.
- **Configure LLM**: We set up the OpenAI model using the API key from settings. This model will be used for language
  processing tasks.
- **Set LLM in Settings**: We assign the LLM to `Settings.llm` for global access within the task.

#### Initialize Custom Vector Store

Now, here's the cool part with LlamaIndex. Assuming we have Django models with embeddings produced by the same 
embeddings model, we don't need to do any real-time encoding of our source documents, and our Django object store in 
Postgres can be loaded as a LlamaIndex vector store. Even better, we can pass in some arguments that let us scope the
store down to what we want. For example, we can limit retrieving text from to document, to annotations containing 
certain text, and to annotations with certain labels - e.g. `termination`. This lets us leverage all of the work that's 
been done by humans (and machines) in an OpenContracts corpus to label and tag documents. We're getting the best of 
both worlds - both human and machine intelligence!

```python
    vector_store = DjangoAnnotationVectorStore.from_params(
        document_id=document.id, must_have_text=datacell.column.must_contain_text
    )
    index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
```

- **Vector Store Initialization**: Here we create an instance of `DjangoAnnotationVectorStore` using parameters 
  specific to the document and column.
- **LlamaIndex Integration**: We create a `VectorStoreIndex` from the custom vector store. This integrates the vector
  store with LlamaIndex, enabling advanced querying capabilities.

#### Perform Retrieval

Now we use the properties of a configured column to find the proper text. For example, if match_text has been provided, 
we search for nearest K annotations to the match_text (rather than searching based on the query itself):

```python
    search_text = datacell.column.match_text
    query = datacell.column.query
    
    retriever = index.as_retriever(similarity_top_k=similarity_top_k)
    results = retriever.retrieve(search_text if search_text else query)
```

- **Retrieve Search Text and Query**: We fetch the search text and query from the column associated with the datacell.
- **Configure Retriever**: We configure the retriever with the `similarity_top_k` parameter, which determines the number
  of top similar results to retrieve.
- **Retrieve Results**: We perform the retrieval using the search text or query. The retriever fetches the most relevant
  annotations from the vector store.

#### Rerank Results

We use a LlamaIndex reranker (in this case a SentenceTransformer reranker) to rerank the retrieved annotations based 
on the query (this is an example of where you could easily customize your own pipeline - you might want to rerank based
on match text, use an LLM-based reranker, or use a totally different reranker like cohere):

```python
        sbert_rerank = SentenceTransformerRerank(
    model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_n=5
)
retrieved_nodes = sbert_rerank.postprocess_nodes(
    results, QueryBundle(query)
)
```

- **Reranker Configuration**: We set up the `SentenceTransformerRerank` model. This model is used to rerank the
  retrieved results for better relevance.
- **Rerank Nodes**: We rerank the retrieved nodes using the `SentenceTransformerRerank` model and the original query.
  This ensures that the top results are the most relevant.

#### Process Retrieved Annotations

Now, we determine the Annotation instance ids we retrieved so these can be linked to the datacell. On the OpenContracts
frontend, this lets us readily navigate to the Annotations in the source documents:

```python
        retrieved_annotation_ids = [
            n.node.extra_info["annotation_id"] for n in retrieved_nodes
        ]
        datacell.sources.add(*retrieved_annotation_ids)
```

- **Extract Annotation IDs**: We extract the annotation IDs from the retrieved nodes.
- **Add Sources**: We add the retrieved annotation IDs to the `sources` field of the datacell. This links the relevant
  annotations to the datacell.

#### Format Retrieved Text for Output

Next, we aggregate the retrieved annotations into a single string we can pass to an LLM:

```python
    retrieved_text = "\n".join(
        [f"```Relevant Section:\n\n{n.text}\n```" for n in results]
    )
    logger.info(f"Retrieved text: {retrieved_text}")
```

- **Format Text**: We format the retrieved text for output. Each relevant section is enclosed in Markdown code blocks
  for better readability.
- **Log Retrieved Text**: We log the retrieved text for debugging and tracking purposes.

#### Parse and Save Result

Finally, we dynamically specify the output schema / format of the data. We use 
[marvin](https://github.com/prefecthq/marvin) to do the structuring, but you could tweak the pipeline to use 
[LlamaIndex's Structured Data Extract](https://docs.llamaindex.ai/en/stable/use_cases/extraction/) or you could roll 
your own custom parsers. 

```python
        output_type = parse_model_or_primitive(datacell.column.output_type)
        logger.info(f"Output type: {output_type}")
        
        # If provided, we use the column parse instructions property to instruct Marvin how to parse, otherwise, 
        # we give it the query and target output schema. Usually the latter approach is OK, but the former is more 
        # intentional and gives better performance.
        parse_instructions = datacell.column.instructions
        
        result = marvin.cast(
            retrieved_text,
            target=output_type,
            instructions=parse_instructions if parse_instructions else query,
        )
        
        if isinstance(result, BaseModel):
            datacell.data = {"data": result.model_dump()}
        else:
            datacell.data = {"data": result}
        datacell.completed = timezone.now()
        datacell.save()


```

- **Determine Output Type**: We determine the output type based on the column's output type.
- **Log Output Type**: We log the output type for debugging purposes.
- **Parse Instructions**: We fetch parsing instructions from the column.
- **Parse Result**: We use `marvin.cast` to parse the retrieved text into the desired output type using the parsing
  instructions.
- **Save Result**: We save the parsed result in the `data` field of the datacell. We also mark the datacell as completed
  and save the changes to the database.

#### Exception Handling

If processign fails, we catch the error and stacktrace. These are store with the Datacell so we can see which extracts
succeded or failed, and, if they failed, why.

```python
    except Exception as e:
        logger.error(f"run_extract() - Ran into error: {e}")
        datacell.stacktrace = f"Error processing: {e}"
        datacell.failed = timezone.now()
        datacell.save()
```

- **Exception Logging**: We log any exceptions that occur during the processing.
- **Save Stacktrace**: We save the error message in the `stacktrace` field of the datacell.
- **Mark as Failed**: We mark the datacell as failed and save the changes to the database.

### Conclusion

By breaking down the tasks step-by-step, you can see how the custom vector store integrates with LlamaIndex to provide
powerful semantic search capabilities within a Django application. Each part of the process is designed to ensure
efficient and accurate retrieval of relevant annotations, leveraging advanced NLP models and vector similarity search.

### Next Steps - Customize The Extract & Retrieval

As we've highlighted in a number of places, you can modify `llama_index_doc_query` as desired to give you 
the capabilities you want. One of our upcoming features will make it easier to define different retrieval and parsing 
pipelines that you can specify at the Column level. So, you could write custom pipelines that you could then select at
the column level.
