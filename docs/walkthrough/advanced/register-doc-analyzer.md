# Detailed Overview of @doc_analyzer_task Decorator

The `@doc_analyzer_task` decorator is an integral part of the OpenContracts CorpusAction system, which automates
document processing when new documents are added to a corpus. As a refresher, within the CorpusAction system, users
have three options for registering actions to run automatically on new documents:

1. Custom data extractors
2. Analyzer microservices
3. Celery tasks decorated with `@doc_analyzer_task`

The `@doc_analyzer_task` decorator is specifically designed for the third option, providing a straightforward way to
write and deploy simple, span-based analytics directly within the OpenContracts ecosystem.

## When to Use @doc_analyzer_task

The `@doc_analyzer_task` decorator is ideal for scenarios where:

1. You're performing tests or analyses solely based on document text or PAWLs tokens.
2. Your analyzer doesn't require conflicting dependencies or non-Python code bases.
3. You want a quick and easy way to integrate custom analysis into the OpenContracts workflow.

For more complex scenarios, such as those requiring specific environments, non-Python components, or heavy computational
resources, creating an analyzer microservice would be recommended.

## Advantages of @doc_analyzer_task

Using the `@doc_analyzer_task` decorator offers several benefits:

1. **Simplicity**: It abstracts away much of the complexity of interacting with the OpenContracts system.
2. **Integration**: Tasks are automatically integrated into the CorpusAction workflow.
3. **Consistency**: It ensures that your analysis task produces outputs in a format that OpenContracts can readily use.
4. **Error Handling**: It provides built-in error handling and retry mechanisms.

By using this decorator, you can focus on writing the core analysis logic while the OpenContracts system handles the
intricacies of document processing, annotation creation, and result storage.

In the following sections, we'll dive deep into how to structure functions decorated with `@doc_analyzer_task`, what
data they receive, and how their outputs are processed by the OpenContracts system.

## Function Signature

Functions decorated with `@doc_analyzer_task` should have the following signature:

```python
@doc_analyzer_task()
def your_analyzer_function(*args, pdf_text_extract=None, pdf_pawls_extract=None, **kwargs):
    # Function body
    pass
```

### Parameters:

1. `*args`: Allows the function to accept any positional arguments.
2. `pdf_text_extract`: Optional parameter that will contain the extracted text from the PDF.
3. `pdf_pawls_extract`: Optional parameter that will contain the PAWLS (Page-Aware Word-Level Splitting) data from the
   PDF.
4. `**kwargs`: Allows the function to accept any keyword arguments.

The resulting task then expects some kwargs, which, while not passed to the decorated function, are used to load the
data passed to the decorated function:

- `doc_id`: The ID of the document being analyzed.
- `corpus_id`: The ID of the corpus containing the document (if applicable).
- `analysis_id`: The ID of the analysis being performed.

### Injected Data

The decorator provides the following data to your decorated function as `kwargs`:

1. **PDF Text Extract**: The full text content of the PDF document, accessible via the `pdf_text_extract` parameter.
2. **PAWLS Extract**: A structured representation of the document's layout and content, accessible via
   the `pdf_pawls_extract` parameter. This typically includes information about pages, tokens, and their positions.

### Required Outputs

The `@doc_analyzer_task` decorator in OpenContracts expects the decorated function's return value to match a specific
output structure. It's a four element tuple, with each of the four elements (below) having a specific schema.

```python
return doc_labels, span_labels, metadata, task_pass
```

Failure to adhere to this in your function will throw an error. This structure is designed to map
directly to the data models used in the OpenContracts system.

Let's break down each component of the required output and explain how it's used.

#### 1. Document Labels (doc_labels)

Document labels should be a list of strings representing the labels you want to apply to the entire document.

```python
doc_labels = ["IMPORTANT_DOCUMENT", "FINANCIAL_REPORT"]
```

**Purpose**: These labels are applied to the entire document.

**Relationship to OpenContracts Models**:

- Each string in this list corresponds to an `AnnotationLabel` object with `label_type = DOC_TYPE_LABEL`.
- For each label, an `Annotation` object is created with:
    - `document`: Set to the current document
    - `annotation_label`: The corresponding `AnnotationLabel` object
    - `analysis`: The current Analysis object
    - `corpus`: The corpus of the document (if applicable)

**Example in OpenContracts**:

```python
for label_text in doc_labels:
    label = AnnotationLabel.objects.get(text=label_text, label_type="DOC_TYPE_LABEL")
    Annotation.objects.create(
        document=document,
        annotation_label=label,
        analysis=analysis,
        corpus=document.corpus
    )
```

#### 2. Span Labels (span_labels)

These describe token / span level features you want to apply an annotation to.

```python
span_labels = [
    (TextSpan(id="1", start=0, end=10, text="First ten"), "HEADER"),
    (TextSpan(id="2", start=50, end=60, text="Next span"), "IMPORTANT_CLAUSE")
]
```

**Purpose**: These labels are applied to specific spans of text within the document.

**Relationship to OpenContracts Models**:

- Each tuple in this list creates an `Annotation` object.
- The `TextSpan` contains the position and content of the annotated text.
- The label string corresponds to an `AnnotationLabel` object with `label_type = TOKEN_LABEL`.

**Example in OpenContracts**:

```python
for span, label_text in span_labels:
    label = AnnotationLabel.objects.get(text=label_text, label_type="TOKEN_LABEL")
    Annotation.objects.create(
        document=document,
        annotation_label=label,
        analysis=analysis,
        corpus=document.corpus,
        page=calculate_page_from_span(span),
        raw_text=span.text,
        json={
            "1": {
                "bounds": calculate_bounds(span),
                "tokensJsons": calculate_tokens(span),
                "rawText": span.text
            }
        }
    )
```

#### 3. Metadata

This element contains DataCell values we want to associate with resulting Analysis.

```python
metadata = [{"data": {"processed_date": "2023-06-15", "confidence_score": 0.95}}]
```

**Purpose**: This provides additional context or information about the analysis.

**Relationship to OpenContracts Models**:

- This element contains DataCell values we want to associate with resulting Analysis.

**Example in OpenContracts**:

```python
analysis.metadata = metadata
analysis.save()
```

#### 4. Task Pass (task_pass)

This can be used to signal the failure of some kind of test or logic for automated testing.

```python
task_pass = True
```

**Purpose**: Indicates whether the analysis task completed successfully.

**Relationship to OpenContracts Models**:

- This boolean value is used to update the status of the `Analysis` object.
- It can trigger further actions or notifications in the OpenContracts system.

**Example in OpenContracts**:

```python
if task_pass:
    analysis.status = "COMPLETED"
else:
    analysis.status = "FAILED"
analysis.save()
```

## How the Decorator Processes the Output

1. **Validation**: The decorator first checks that the return value is a tuple of length 4 and that each element has the
   correct type.

2. **Document Label Processing**: For each document label, it creates an `Annotation` object linked to the document,
   analysis, and corpus.

3. **Span Label Processing**: For each span label, it creates an `Annotation` object with detailed information about the
   text span, including its position and content.

4. **Metadata Handling**: The metadata is stored, typically with the `Analysis` object, for future reference.

5. **Task Status Update**: Based on the `task_pass` value, the status of the analysis is updated.

6. **Error Handling**: If any part of this process fails, the decorator handles the error, potentially marking the task
   as failed and logging the error.

## Benefits of This Structure

1. **Consistency**: By enforcing a specific output structure, the system ensures that all document analysis tasks
   provide consistent data.

2. **Separation of Concerns**: The analysis logic (in the decorated function) is separated from the database
   operations (handled by the decorator).

3. **Flexibility**: The structure allows for both document-level and span-level annotations, accommodating various types
   of analysis.

4. **Traceability**: By linking annotations to specific analyses and including metadata, the system maintains a clear
   record of how and when annotations were created.

5. **Error Management**: The `task_pass` boolean allows for clear indication of task success or failure, which can
   trigger appropriate follow-up actions in the system.

By structuring the output this way, the `@doc_analyzer_task` decorator seamlessly integrates custom analysis logic into
the broader OpenContracts data model, ensuring that the results of document analysis are properly stored, linked, and
traceable within the system.


## Example Implementation

Here's an example of how a function decorated with `@doc_analyzer_task` might look:

```python
from opencontractserver.shared.decorators import doc_analyzer_task
from opencontractserver.types.dicts import TextSpan


@doc_analyzer_task()
def example_analyzer(*args, pdf_text_extract=None, pdf_pawls_extract=None, **kwargs):
    doc_id = kwargs.get('doc_id')

    # Your analysis logic here
    # For example, let's say we're identifying a document type and important clauses

    doc_type = identify_document_type(pdf_text_extract)
    important_clauses = find_important_clauses(pdf_text_extract)

    doc_labels = [doc_type]
    span_labels = [
        (TextSpan(id=str(i), start=clause.start, end=clause.end, text=clause.text), "IMPORTANT_CLAUSE")
        for i, clause in enumerate(important_clauses)
    ]
    metadata = [{"data": {"analysis_version": "1.0", "clauses_found": len(important_clauses)}}]
    task_pass = True

    return doc_labels, span_labels, metadata, task_pass
```

In this example, the function uses the injected `pdf_text_extract` to perform its analysis. It identifies the document
type and finds important clauses, then structures this information into the required output format.

By using the `@doc_analyzer_task` decorator, this function is automatically integrated into the OpenContracts system,
handling document locking, error management, and annotation creation without requiring explicit code for these
operations in the function body.
