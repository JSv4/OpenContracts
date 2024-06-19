from .cleanup_tasks import delete_analysis_and_annotations_task
from .doc_tasks import burn_doc_annotations
from .export_tasks import package_annotated_docs
from .extract_tasks import llama_index_doc_query, run_extract
from .fork_tasks import fork_corpus
from .import_tasks import import_corpus, import_document_to_corpus
from .lookup_tasks import build_label_lookups_task
from .permissioning_tasks import make_analysis_public_task, make_corpus_public_task
from .query_tasks import run_query

# Great, quick guidance on how to restructure tasks into multiple modules:
# https://blog.sneawo.com/blog/2018/12/05/how-to-split-celery-tasks-file/
#
# A good idea is to split it on the smaller files, but Celery auto_discover
# by default search tasks in package.tasks

__all__ = [
    "run_query",
    "run_extract",
    "llama_index_doc_query",
    "package_annotated_docs",
    "burn_doc_annotations",
    "fork_corpus",
    "build_label_lookups_task",
    "import_corpus",
    "import_document_to_corpus",
    "make_corpus_public_task",
    "make_analysis_public_task",
    "delete_analysis_and_annotations_task",
]
