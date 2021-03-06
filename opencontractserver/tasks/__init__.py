from .doc_tasks import (
    base_64_encode_bytes,
    base_64_encode_document,
    burn_doc_annotations,
    parse_base64_pdf,
    write_pawls_file,
)
from .export_tasks import package_annotated_docs
from .fork_tasks import fork_corpus
from .import_tasks import import_corpus
from .lookup_tasks import build_label_lookups_task

# Great, quick guidance on how to restructure tasks into multiple modules:
# https://blog.sneawo.com/blog/2018/12/05/how-to-split-celery-tasks-file/
#
# A good idea is to split it on the smaller files, but Celery auto_discover
# by default search tasks in package.tasks

__all__ = [
    "package_annotated_docs",
    "burn_doc_annotations",
    "base_64_encode_document",
    "base_64_encode_bytes",
    "parse_base64_pdf",
    "write_pawls_file",
    "fork_corpus",
    "build_label_lookups_task",
    "import_corpus",
]
