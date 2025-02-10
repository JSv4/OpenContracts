# Comprehensive Guide to Analyzers

## Overview
OpenContracts supports two types of analyzers:
1. Task-based analyzers (running as Celery tasks within the main application)
2. Gremlin-based analyzers (running as external services via [Gremlin Engine](docs/configuration/configure-gremlin.md))

## 1. Database Structure
The `Analyzer` model has these key fields:
- `id`: CharField (primary key, max length 1024)
- `manifest`: JSON field for analyzer configuration
- `description`: Text field
- `disabled`: Boolean flag
- `is_public`: Boolean for visibility
- `icon`: File field
- `host_gremlin`: ForeignKey to GremlinEngine (optional)
- `task_name`: CharField for task-based analyzers (optional)

> Note: An analyzer must have either `host_gremlin` OR `task_name` (not both, not neither)

## 2. Types of Analyzers

### Task-based Analyzers
- Run within the main application as Celery tasks
- Defined by `task_name` field
- Best for integrated analysis within the main environment
- Full documentation on implementation available in [register-doc-analyzer.md](docs/walkthrough/advanced/register-doc-analyzer.md)

### Gremlin-based Analyzers
- Connected to external [Gremlin Engine](docs/configuration/configure-gremlin.md)
- Run as separate services
- Communicate via HTTP/REST
- Ideal for:
  - Complex analysis requiring specific environments
  - Non-Python components
  - Heavy computational resources

## 3. Analysis Process

### Task-based Analysis Flow:
1. System creates Analysis record
2. Celery task is dispatched
3. Analysis runs in-process
4. Results stored directly

### Gremlin-based Analysis Flow:
1. System creates Analysis record
2. Documents packaged with URLs
3. Sent to Gremlin service
4. Results received via callback

## 4. Permissions & Security
Granular permissions available:
- permission_analyzer
- publish_analyzer
- create_analyzer
- read_analyzer
- update_analyzer
- remove_analyzer

Each analysis tracks:
- Creator
- Public/private status
- Callback tokens for secure results
- Document access permissions

## 5. Implementation Requirements

### Task-based Analyzer Requirements:
- Valid Python import path
- Task must exist in codebase
- Must use `@doc_analyzer_task` decorator
- Must return valid analysis results
- See [register-doc-analyzer.md](docs/walkthrough/advanced/register-doc-analyzer.md) for detailed implementation guide

### Gremlin Analyzer Requirements:
- Valid manifest following AnalyzerManifest type
- Accessible Gremlin engine URL
- Proper callback configuration
- Valid icon and metadata
- See [configure-gremlin.md](docs/configuration/configure-gremlin.md) for setup guide

## 6. Task-Based Analyzer Registration

### Database Creation
```python
analyzer = Analyzer.objects.create(
    id="task.analyzer.unique.id",  # Required unique identifier
    description="Task Analyzer Description",
    task_name="opencontractserver.tasks.module.task_name",  # Python import path
    creator=user,
    manifest={},  # Optional configuration
    is_public=True,  # Optional visibility setting
)
```

### Implementation Requirements
- Must be decorated with `@doc_analyzer_task()`
- Must accept parameters:
  ```python
  doc_id: str        # Document ID to analyze
  analysis_id: str   # Analysis record ID
  corpus_id: str     # Optional corpus ID
  ```
- Must return a tuple of four elements:
  ```python
  (
      doc_annotations: List[str],  # Document-level labels
      span_label_pairs: List[Tuple[TextSpan, str]],  # Text annotations with labels
      metadata: List[Dict[str, Any]],  # Must include 'data' key
      task_pass: bool  # Success indicator
  )
  ```

### Example Implementation
```python
@doc_analyzer_task()
def my_analyzer_task(doc_id, analysis_id, corpus_id=None, **kwargs):
    # Task implementation
    return [], [], [{"data": results}], True
```

### Validation Rules
- Task name must be unique
- Cannot have both `task_name` and `host_gremlin`
- Task must exist at specified path
- Must use `@doc_analyzer_task` decorator
- Return values must match schema

### Execution Flow
1. Analysis created referencing task-based analyzer
2. System loads task by name
3. Task executed through Celery
4. Results processed and stored
5. Analysis completion marked

### Available Features
- Access to document content (PDF, text extracts, PAWLS tokens)
- Annotation and label creation
- Corpus-wide analysis integration
- Automatic result storage
- Error handling and retries