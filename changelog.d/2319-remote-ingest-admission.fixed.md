- Remote ingestion now pauses admission on unknown token-scoped upload status,
  serializes initial/refresh polls, preserves watermark hysteresis and retries
  transient failures with cancellation-aware backoff. Permanent status errors
  stop `run` without spending document attempts; aborted polls wake all waiters.
  `status` distinguishes unknown from measured zero and returns nonzero for
  permanent configuration errors (`scripts/remote_ingest/admission.py`,
  `scripts/remote_ingest/oc_remote_ingest.py`; #2319).
