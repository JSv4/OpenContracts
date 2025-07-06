# Write Your Own Custom Data Extractor

This guide shows you how to create custom data extraction pipelines for OpenContracts using our modern agent framework.

## Prerequisites

Before writing custom extractors, familiarize yourself with:

- **[Document Data Extract Overview](../../extract_and_retrieval/document_data_extract.md)** - Understanding the extraction pipeline and orchestration
- **[Django Annotation Vector Store](../../extract_and_retrieval/intro_to_django_annotation_vector_store.md)** - How OpenContracts integrates with vector search
- **[Querying Corpus](../../extract_and_retrieval/querying_corpus.md)** - Understanding the async query patterns

## Column Model

The `Column` model defines extraction specifications:

```python
class Column(BaseOCModel):
    name = models.CharField(max_length=256, null=False, blank=False, default="")
    fieldset = models.ForeignKey('Fieldset', related_name='columns', on_delete=models.CASCADE)
    query = models.TextField(null=True, blank=True)
    match_text = models.TextField(null=True, blank=True)
    must_contain_text = models.TextField(null=True, blank=True)
    output_type = models.TextField(null=False, blank=False)
    limit_to_label = models.CharField(max_length=512, null=True, blank=True)
    instructions = models.TextField(null=True, blank=True)
    task_name = models.CharField(max_length=1024, null=False, blank=False)
    extract_is_list = models.BooleanField(default=False)
    creator = models.ForeignKey(User, on_delete=models.CASCADE)
```

Key attributes:
- **name**: Human-readable name for the column.
- **query**: The extraction query.
- **output_type**: Expected output type (e.g., "str", "int", "list[str]").
- **extract_is_list**: Boolean indicating if the output should be a list.
- **task_name**: The Celery task to use for extraction.
- **creator**: The user who created this column.

## Default Extraction Pipeline

OpenContracts' default extraction pipeline uses our agent framework to run queries specified for a
`Column`. This pipeline provides reliable, structured data extraction with built-in constraints and type safety.

You can write your own custom extract pipeline to provide even more targeted extraction behavior. This could be
cheaper or more reliable performance in many cases. You could even incorporate tools and third-party APIs in custom
agent workflows.

## Example Custom Extractor

Here's a template for a custom extraction task:

```python
from opencontractserver.shared.decorators import celery_task_with_async_to_sync
from opencontractserver.extracts.models import Datacell
from opencontractserver.llms import agents
from opencontractserver.llms.types import AgentFramework
from django.utils import timezone

@celery_task_with_async_to_sync()
async def custom_doc_query(cell_id: int) -> None:
    """
    Custom data extraction pipeline.
    """
    # Get the datacell with related objects
    datacell = await Datacell.objects.select_related(
        'extract', 'column', 'document', 'creator'
    ).aget(pk=cell_id)
    
    # Mark as started
    datacell.started = timezone.now()
    await datacell.asave()
    
    try:
        # Get corpus ID (required for agent framework)
        corpus_id = await sync_get_corpus_id(datacell.document)
        if not corpus_id:
            raise ValueError(f"Document {datacell.document.id} is not in any corpus!")
        
        # Parse output type
        from opencontractserver.utils.etl import parse_model_or_primitive
        output_type = parse_model_or_primitive(datacell.column.output_type)
        
        # Handle list types
        if datacell.column.extract_is_list:
            from typing import List
            if get_origin(output_type) is not list:
                output_type = List[output_type]
        
        # Your custom extraction logic here
        result = await agents.get_structured_response_from_document(
            document=datacell.document.id,
            corpus=corpus_id,
            prompt=datacell.column.query,
            target_type=output_type,
            framework=AgentFramework.PYDANTIC_AI,
            system_prompt="You are a precise data extraction agent.",
            extra_context=datacell.column.instructions,
            temperature=0.3,
            # Add your custom parameters
        )
        
        # Save results
        datacell.data = {"data": result}
        datacell.completed = timezone.now()
        await datacell.asave()
        
    except Exception as e:
        datacell.stacktrace = str(e)
        datacell.failed = timezone.now()
        await datacell.asave()
        raise
```

## Key Components

- **Agent Framework**: Uses our battle-tested structured extraction API
- **Async Patterns**: Leverages `@celery_task_with_async_to_sync()` decorator for reliability
- **Type Safety**: Automatic parsing of output types with list support
- **Error Handling**: Comprehensive tracking of extraction failures
- **Corpus Integration**: Works with OpenContracts' vector store and annotation system

## Advanced Customization

### Using Vector Store Directly

If you need lower-level access to the vector store:

```python
from opencontractserver.llms.vector_stores.vector_store_factory import UnifiedVectorStoreFactory
from opencontractserver.llms.types import AgentFramework

# Create vector store for the document
vector_store = UnifiedVectorStoreFactory.create_vector_store(
    framework=AgentFramework.LLAMA_INDEX,
    user_id=datacell.creator.id,
    document_id=datacell.document.id,
    must_have_text=datacell.column.must_contain_text,
)
```

### Implementing Custom Constraints

You can implement additional constraints beyond `must_contain_text` and `limit_to_label`:

```python
# Custom filtering logic
if datacell.column.must_contain_text:
    system_prompt += f"\nIMPORTANT: Only extract from sections containing: '{datacell.column.must_contain_text}'"

if datacell.column.limit_to_label:
    system_prompt += f"\nIMPORTANT: Only extract from annotations labeled: '{datacell.column.limit_to_label}'"
```

## Testing Your Custom Extractor

Follow the async testing patterns described in the [Document Data Extract guide](../../extract_and_retrieval/document_data_extract.md#async-task-decorators):

```python
from django.test import TransactionTestCase

class CustomExtractorTestCase(TransactionTestCase):
    def test_custom_extraction(self):
        # Create test data...
        custom_doc_query.si(datacell.id).apply()
        # Assert results...
```

## Deployment

1. **Add your task** to `opencontractserver/tasks/data_extract_tasks.py`
2. **Restart containers** to register the new task
3. **Select in UI** - your task will appear in the column configuration dropdown

The task description comes from your function's docstring, so make it descriptive!

## Next Steps

- **Read the [extraction pipeline overview](../../extract_and_retrieval/document_data_extract.md)** for orchestration details
- **Explore [vector store integration](../../extract_and_retrieval/intro_to_django_annotation_vector_store.md)** for advanced retrieval
- **Check [async patterns](../../extract_and_retrieval/querying_corpus.md)** for WebSocket integration examples
