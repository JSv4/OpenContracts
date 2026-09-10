- Remote ingestion now pauses admission on unknown token-scoped upload status,
  serializes initial/refresh polls, preserves watermark hysteresis and retries
  transient failures with cancellation-aware backoff. Permanent status errors
  stop `run` without spending document attempts; `status` distinguishes unknown
  from measured zero (`scripts/remote_ingest/admission.py`,
  `scripts/remote_ingest/oc_remote_ingest.py`; #2319).
