# Why Data Extract?

An extraction process is pivotal for transforming raw, unstructured data into actionable insights, especially in
fields like legal, financial, healthcare, and research. Imagine having thousands of documents, such as contracts,
invoices, medical records, or research papers, and needing to quickly locate and analyze specific information like
key terms, dates, patient details, or research findings. Automated extraction saves countless hours of manual labor,
reduces human error, and enables real-time data analysis. By leveraging an efficient extraction pipeline, businesses
and researchers can make informed decisions faster, ensure compliance, enhance operational efficiency, and uncover
valuable patterns and trends that might otherwise remain hidden in the data deluge. Simply put, data extraction
transforms overwhelming amounts of information into strategic assets, driving innovation and competitive advantage.

# How we Store Our Data Extracts

Ultimately, our application design follows Django best-practiecs for a data-driven application with asynchronous data
processing. We use the Django ORM (with capabilities like vector search) to store our data and tasks to orchestrate.
The `extracts/models.py` file defines several key models that are used to manage and track the process of extracting
data from documents.

These models include:

1. **Fieldset**
2. **Column**
3. **Extract**
4. **Datacell**

Each model plays a specific role in the extraction workflow, and together they enable the storage, configuration, and
execution of document-based data extraction tasks.

### Detailed Explanation of Each Model

#### 1. Fieldset

**Purpose**: The `Fieldset` model groups related columns together. Each `Fieldset` represents a specific
configuration of data fields that need to be extracted from documents.

```python
class Fieldset(BaseOCModel):
    name = models.CharField(max_length=256, null=False, blank=False)
    description = models.TextField(null=False, blank=False)
```

- **name**: The name of the fieldset.
- **description**: A description of what this fieldset is intended to extract.

**Usage**: Fieldsets are associated with extracts in the `Extract` model, defining what data needs to be extracted.

#### 2. Column

**Purpose**: The `Column` model defines individual data fields that need to be extracted. Each column specifies what
to extract, the criteria for extraction, and the model to use for extraction.

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
    creator = models.ForeignKey(User, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
```

- **name**: The name of the column.
- **fieldset**: ForeignKey linking to the `Fieldset` model.
- **query**: The query used for extraction.
- **match_text**: Text that must be matched during extraction.
- **must_contain_text**: Text that must be contained in the document for extraction.
- **output_type**: The type of data to be extracted.
- **limit_to_label**: A label to limit the extraction scope.
- **instructions**: Instructions for the extraction process.
- **task_name**: The name of the registered celery extract task to use to process (lets you define and deploy custom ones).
- **creator**: The user who created this column.
- **created**: Timestamp when the column was created.
- **modified**: Timestamp when the column was last modified.

**Usage**: Columns are linked to fieldsets and specify detailed criteria for each piece of data to be extracted.

#### 4. Extract

**Purpose**: The `Extract` model represents an extraction job. It contains metadata about the extraction process,
such as the documents to be processed, the fieldset to use, and the task type.

```python
class Extract(BaseOCModel):
    corpus = models.ForeignKey('Corpus', related_name='extracts', on_delete=models.SET_NULL, null=True, blank=True)
    documents = models.ManyToManyField('Document', related_name='extracts', related_query_name='extract', blank=True)
    name = models.CharField(max_length=512, null=False, blank=False)
    fieldset = models.ForeignKey('Fieldset', related_name='extracts', on_delete=models.PROTECT, null=False)
    created = models.DateTimeField(auto_now_add=True)
    started = models.DateTimeField(null=True, blank=True)
    finished = models.DateTimeField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    doc_query_task = models.CharField(
        max_length=10,
        choices=[(tag.name, tag.value) for tag in DocQueryTask],
        default=DocQueryTask.DEFAULT.name
    )
```

- **corpus**: ForeignKey linking to the `Corpus` model.
- **documents**: ManyToManyField linking to the `Document` model.
- **name**: The name of the extraction job.
- **fieldset**: ForeignKey linking to the `Fieldset` model.
- **created**: Timestamp when the extract was created.
- **started**: Timestamp when the extract started.
- **finished**: Timestamp when the extract finished.
- **error**: Text field for storing error messages.
- **doc_query_task**: CharField for storing the task type using `DocQueryTask` enum.

**Usage**: Extracts group the documents to be processed and the fieldset that defines what data to extract.
The `doc_query_task` field determines which extraction pipeline to use.

#### 5. Datacell

**Purpose**: The `Datacell` model stores the result of extracting a specific column from a specific document. Each
datacell links to an extract, a column, and a document.

```python
class Datacell(BaseOCModel):
    extract = models.ForeignKey('Extract', related_name='extracted_datacells', on_delete=models.CASCADE)
    column = models.ForeignKey('Column', related_name='extracted_datacells', on_delete=models.CASCADE)
    document = models.ForeignKey('Document', related_name='extracted_datacells', on_delete=models.CASCADE)
    sources = models.ManyToManyField('Annotation', blank=True, related_name='referencing_cells', related_query_name='referencing_cell')
    data = NullableJSONField(default=jsonfield_default_value, null=True, blank=True)
    data_definition = models.TextField(null=False, blank=False)
    started = models.DateTimeField(null=True, blank=True)
    completed = models.DateTimeField(null=True, blank=True)
    failed = models.DateTimeField(null=True, blank=True)
    stacktrace = models.TextField(null=True, blank=True)
    creator = models.ForeignKey(User, on_delete=models.CASCADE)
```

- **extract**: ForeignKey linking to the `Extract` model.
- **column**: ForeignKey linking to the `Column` model.
- **document**: ForeignKey linking to the `Document` model.
- **sources**: ManyToManyField linking to the `Annotation` model.
- **data**: JSON field for storing extracted data.
- **data_definition**: Text field describing the data definition.
- **started**: Timestamp when the datacell processing started.
- **completed**: Timestamp when the datacell processing completed.
- **failed**: Timestamp when the datacell processing failed.
- **stacktrace**: Text field for storing error stack traces.
- **creator**: The user who created this datacell.

**Usage**: Datacells store the results of extracting specific fields from documents, linking back to the extract and
column definitions. They also track the status and any errors during extraction.

### How These Models Relate to Data Extraction Tasks

1**Fieldset and Column**: Specify what data needs to be extracted and the criteria for extraction. Fieldsets group
   columns, which detail each piece of data to be extracted. You can register your own LlamaIndex extractors
   which you can then select as the extract engine for a given column, allowing you to create very bespoke extraction
   capabilities.
2**Extract**: Represents an extraction job, grouping documents to be processed with the fieldset defining what data
   to extract. The `doc_query_task` field allows dynamic selection of the extraction pipeline.
3**Datacell**: Stores the results of the extraction process for each document and column, tracking the status and
   any errors encountered.

### Extraction Workflow

1. **Create Extract**: An `Extract` instance is created, specifying the documents to process, the fieldset to use, and
   the desired extraction task.
2. **Run Extract**: The `run_extract` task uses the `doc_query_task` field to determine which extraction pipeline to
   use. It iterates over the documents and columns, creating `Datacell` instances for each.
3. **Process Datacell**: Each `Datacell` is processed by the selected extraction task (e.g., `llama_index_doc_query`
   or `custom_llama_index_doc_query`). The results are stored in the `data` field of the `Datacell`.
4. **Store Results**: The extracted data is saved, and the status of each `Datacell` is updated to reflect
   completion or failure.

By structuring the models this way, the system is flexible and scalable, allowing for complex data extraction
tasks to be defined, executed, and tracked efficiently.
