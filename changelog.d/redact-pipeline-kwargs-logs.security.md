- Stop pipeline components from writing secrets to logs. Six log calls
  interpolated a raw kwargs dict, which is merged from pipeline settings and
  carries decrypted component secrets, so an API key could appear in plain text
  (e.g. `MicroserviceEmbedder._embed_text_impl` logged `vector_embedder_api_key`
  on every embedding call). They now go through
  `opencontractserver/utils/logging.py::redact_sensitive_kwargs`, like the
  existing redacted call sites: `pipeline/base/thumbnailer.py`,
  `pipeline/embedders/sent_transformer_microservice.py`,
  `pipeline/parsers/docling_parser_rest.py`, `pipeline/parsers/oc_text_parser.py`,
  `pipeline/thumbnailers/pdf_thumbnailer.py` and
  `pipeline/thumbnailers/text_thumbnailer.py`.
  `opencontractserver/tests/test_pipeline_log_redaction.py` scans
  `opencontractserver/pipeline/` and fails on any log call that formats a raw
  `*kwargs` name. Operators who ran an affected version should rotate keys
  stored in pipeline component settings.
