# Extracting Structured Data from Documents using LlamaIndex, AI Agents, and Marvin

We've added a powerful feature called "extract" that enables the generation of structured data grids from a list of
documents using a combination of vector search, AI agents, and the Marvin library. This functionality is implemented in
a Django application and leverages Celery for asynchronous task processing.

All credit for the inspiration of this features goes to the fine folks at Nlmatics. They were some of the first pioneers
working on datagrids from document using a set of questions and custom transformer models. This implementation of their
concept ultimately leverages newer techniques and better models, but hats off to them for coming up with a design like
this 6 years ago!

## Overview

The extract process involves the following key components:

1. **Document Corpus**: A collection of documents from which structured data will be extracted.
2. **Fieldset**: A set of columns defining the structure of the data to be extracted.
3. **LlamaIndex**: A library used for efficient vector search and retrieval of relevant document sections.
4. **AI Agents**: Intelligent agents that analyze the retrieved document sections and extract structured data.
5. **Marvin**: A library that facilitates the parsing and extraction of structured data from text.

The extract process is initiated by creating an `Extract` object that specifies the document corpus and the fieldset defining the desired data structure. The process is then broken down into individual tasks for each document and column combination, allowing for parallel processing and scalability.

## Detailed Walkthrough

Let's dive into the code and understand how the extract process works step by step.

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

The `llama_index_doc_query` function is responsible for processing each individual `Datacell`. It performs the following steps:

1. Retrieves the `Datacell` object from the database based on the provided `cell_id`.
2. Sets the `started` timestamp of the datacell to the current time.
3. Retrieves the associated `document` and initializes the necessary components for vector search and retrieval using LlamaIndex, including the embedding model, language model, and vector store.
4. Performs a vector search to retrieve the most relevant document sections based on the search text or query specified in the datacell's column.
5. Extracts the retrieved annotation IDs and associates them with the datacell as sources.
6. If the datacell's column is marked as "agentic," it uses an AI agent to further analyze the retrieved document sections and extract additional information such as defined terms and section references.
7. Prepares the retrieved text and additional information for parsing using the Marvin library.
8. Depending on the specified output type of the datacell's column, it uses Marvin to extract the structured data as either a list or a single instance.
9. Parses the extracted data and stores it in the datacell's `data` field based on the output type (e.g., BaseModel, str, int, bool, float).
10. Sets the `completed` timestamp of the datacell to the current time.
11. If an exception occurs during processing, it sets the `failed` timestamp and stores the error stacktrace in the datacell.

### 3. Marking the Extract as Complete

Once all the datacells have been processed, the `mark_extract_complete` function is triggered by the Celery chord. It retrieves the `Extract` object based on the provided `extract_id` and sets the `finished` timestamp to the current time, indicating that the extract process is complete.

## Benefits and Considerations

The extract functionality offers several benefits:

1. **Structured Data Extraction**: It enables the extraction of structured data from unstructured or semi-structured documents, making the information more accessible and actionable.
2. **Scalability**: By breaking down the process into individual tasks for each document and column combination, it allows for parallel processing and scalability, enabling the handling of large document corpora.
3. **Flexibility**: The use of fieldsets allows for the definition of custom data structures tailored to specific requirements.
4. **AI-Powered Analysis**: The integration of AI agents and the Marvin library enables intelligent analysis and extraction of relevant information from the retrieved document sections.
5. **Asynchronous Processing**: The use of Celery for asynchronous task processing ensures that the extract process doesn't block the main application and can be performed in the background.

However, there are a few considerations to keep in mind:

1**Processing Time**: Depending on the size of the document corpus and the complexity of the fieldset, the extract process may take a considerable amount of time to complete.
2**Error Handling**: Proper error handling and monitoring should be implemented to handle any exceptions or failures during the processing of individual datacells.
3**Data Validation**: The extracted structured data may require additional validation and cleansing steps to ensure its quality and consistency.

## Next Steps

This is more of a proof-of-concept of the power of the existing universe of open source tooling. There are a number of more
advanced techniques we can use to get better retrieval, more intelligent agentic behavior and more. Also, we haven't optomized
for performance AT ALL, so any improvements in any of these areas would be welcome. Further, we expect the real power for
an open source tool like OpenContracts to come from custom implementations of this functionality, so we'll also be working
on more easily customizable and modular agents and retrieval pipelines so you can quickly select the right pipeline for the
right task.
