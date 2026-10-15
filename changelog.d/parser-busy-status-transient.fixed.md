- Retry documents when a parsing or conversion service answers 408 or 429
  instead of failing them permanently. Cloud Run returns 429 when every
  instance is busy, so bulk uploads against Docling left most PDFs `failed`
  with no retry. The Docling, Docxodus, warp-ingest and Gotenberg clients now
  share `opencontractserver/pipeline/base/exceptions.py::is_transient_http_status`;
  the busy statuses live in `TRANSIENT_HTTP_CLIENT_ERROR_STATUSES`
  (`constants/document_processing.py`). Other 4xx stay permanent.
