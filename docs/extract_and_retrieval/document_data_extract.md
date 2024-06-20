# Extracting Structured Data from Documents using LlamaIndex, AI Agents, and Marvin

We've added a powerful feature called "extract" that enables the generation of structured data grids from a list of
documents using a combination of vector search, AI agents, and the Marvin library. 

This `run_extract` task orchestrates the extraction process, spinning up a number of `llama_index_doc_query` tasks. 
Each of these query tasks uses LlamaIndex Django & pgvector for vector search and retrieval, and Marvin 
for data parsing and extraction. It processes each document and column in parallel using celery's task system.

All credit for the inspiration of this feature goes to the fine folks at [Nlmatics](https://www.nlmatics.com/). They 
were some of the first pioneers working on datagrids from document using a set of questions and custom transformer 
models. This implementation of their concept ultimately leverages newer techniques and better models, but hats off 
to them for coming up with a design like this in 2017/2018!

The current implementation relies heavily on [LlamaIndex](https://docs.llamaindex.ai/en/stable/), specifically 
their vector store tooling, their reranker and their agent framework.

Structured data extraction is powered by the amazing [Marvin library](https://github.com/prefecthq/marvin).

## Overview

The extract process involves the following key components:

1. **Document Corpus**: A collection of documents from which structured data will be extracted.
2. **Fieldset**: A set of columns defining the structure of the data to be extracted.
3. **LlamaIndex**: A library used for efficient vector search and retrieval of relevant document sections.
4. **AI Agents**: Intelligent agents that analyze the retrieved document sections and extract structured data.
5. **[Marvin](https://github.com/prefecthq/marvin)**: A library that facilitates the parsing and extraction of structured data from text.

The extract process is initiated by creating an `Extract` object that specifies the document corpus and the fieldset defining the desired data structure. The process is then broken down into individual tasks for each document and column combination, allowing for parallel processing and scalability.

## Detailed Walkthrough

Here's how the extract process works step by step.

### 1. Initiating the Extract Process

The `run_extract` function is the entry point for initiating the extract process. It takes the `extract_id` and `user_id` as parameters and performs the following steps:

1. Retrieves the `Extract` object from the database based on the provided `extract_id`.
2. Sets the `started` timestamp of the extract to the current time.
3. Retrieves the `fieldset` associated with the extract, which defines the columns of the structured data grid.
4. Retrieves the list of document IDs associated with the extract.
5. Creates `Datacell` objects for each document and column combination, representing the individual cells in the structured data grid.
6. Sets the appropriate permissions for each `Datacell` object based on the user's permissions.
7. Kicks off the processing job for each `Datacell` by appending a task to the Celery task queue.

### 2. Processing Individual Datacells

The `llama_index_doc_query` function is responsible for processing each individual `Datacell`. 

#### Execution Flow Visualized:

```mermaid
graph TD    
    I[llama_index_doc_query] --> J[Retrieve Datacell]
    J --> K[Create HuggingFaceEmbedding]
    K --> L[Create OpenAI LLM]
    L --> M[Create DjangoAnnotationVectorStore]
    M --> N[Create VectorStoreIndex]
    N --> O{Special character '|||' in search_text?}
    O -- Yes --> P[Split examples and average embeddings]
    P --> Q[Query annotations using averaged embeddings]
    Q --> R[Rerank nodes using SentenceTransformerRerank]
    O -- No --> S[Retrieve results using index retriever]
    S --> T[Rerank nodes using SentenceTransformerRerank]
    R --> U{Column is agentic?}
    T --> U
    U -- Yes --> V[Create QueryEngineTool]
    V --> W[Create FunctionCallingAgentWorker]
    W --> X[Create StructuredPlannerAgent]
    X --> Y[Query agent for definitions]
    U -- No --> Z{Extract is list?}
    Y --> Z
    Z -- Yes --> AA[Extract with Marvin]
    Z -- No --> AB[Cast with Marvin]
    AA --> AC[Save result to Datacell]
    AB --> AC
    AC --> AD[Mark Datacell complete]
```
#### Step-by-step Walkthrough

1. The `run_extract` task is called with an `extract_id` and `user_id`. It retrieves the corresponding `Extract` object and marks it as started.

2. It then iterates over the document IDs associated with the extract. For each document and each column in the extract's fieldset, it:
   - Creates a new `Datacell` object with the extract, column, output type, creator, and document.
   - Sets CRUD permissions for the datacell to the user.
   - Appends a `llama_index_doc_query` task to a list of tasks, passing the datacell ID.

3. After all datacells are created and their tasks added to the list, a Celery `chord` is used to group the tasks. Once all tasks are complete, it calls the `mark_extract_complete` task to mark the extract as finished.

4. The `llama_index_doc_query` task processes each individual datacell. It:
   - Retrieves the datacell and marks it as started.
   - Creates a `HuggingFaceEmbedding` model and sets it as the `Settings.embed_model`.
   - Creates an `OpenAI` LLM and sets it as the `Settings.llm`.
   - Creates a `DjangoAnnotationVectorStore` from the document ID and column settings.
   - Creates a `VectorStoreIndex` from the vector store.

5. If the `search_text` contains the special character '|||':
   - It splits the examples and calculates the embeddings for each example.
   - It calculates the average embedding from the individual embeddings.
   - It queries the `Annotation` objects using the averaged embeddings and orders them by cosine distance.
   - It reranks the nodes using `SentenceTransformerRerank` and retrieves the top-n nodes.
   - It adds the annotation IDs of the reranked nodes to the datacell's sources.
   - It retrieves the text from the reranked nodes.

6. If the `search_text` does not contain the special character '|||':
   - It retrieves the relevant annotations using the index retriever based on the `search_text` or `query`.
   - It reranks the nodes using `SentenceTransformerRerank` and retrieves the top-n nodes.
   - It adds the annotation IDs of the reranked nodes to the datacell's sources.
   - It retrieves the text from the retrieved nodes.

7. If the column is marked as `agentic`:
   - It creates a `QueryEngineTool`, `FunctionCallingAgentWorker`, and `StructuredPlannerAgent`.
   - It queries the agent to find defined terms and section references in the retrieved text.
   - The definitions and section text are added to the retrieved text.

8. Depending on whether the column's `extract_is_list` is true, it either:
   - Extracts a list of the `output_type` from the retrieved text using Marvin, with optional `instructions` or `query`.
   - Casts the retrieved text to the `output_type` using Marvin, with optional `instructions` or `query`.

9. The result is saved to the datacell's `data` field based on the `output_type`. The datacell is marked as completed.

10. If an exception occurs during processing, the error is logged, saved to the datacell's `stacktrace`, and the 
    datacell is marked as failed.

## Next Steps

This is more of a proof-of-concept of the power of the existing universe of open source tooling. There are a number of more
advanced techniques we can use to get better retrieval, more intelligent agentic behavior and more. Also, we haven't optomized
for performance AT ALL, so any improvements in any of these areas would be welcome. Further, we expect the real power for
an open source tool like OpenContracts to come from custom implementations of this functionality, so we'll also be working
on more easily customizable and modular agents and retrieval pipelines so you can quickly select the right pipeline for the
right task.
