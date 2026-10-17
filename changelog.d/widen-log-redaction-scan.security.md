- Widen the log-redaction invariant from #2446 and close the latent credential
  leak it surfaced. `opencontractserver/tests/architecture/test_log_redaction.py`
  (moved from `tests/test_pipeline_log_redaction.py`) now scans every module
  under `opencontractserver/` and `config/` instead of `pipeline/` only, and
  catches `%`-style arguments, `str.format`, the `%` operator and
  attribute/method expressions such as `self.get_component_settings()` as well
  as f-strings, for names ending in `settings` as well as `kwargs`. The wider
  scan found no raw formatting outside `pipeline/`, but did show that
  `AgentConfig` (`opencontractserver/llms/agents/core_agents.py`) kept its
  `api_key` field in the dataclass repr while `pydantic_ai_agents.py` logs the
  whole config at DEBUG; the field is now `repr=False`. Nothing assigns that
  field today, so no key was written. The embedder behavioural test builds its
  component with explicit `component_settings` instead of relying on a
  swallowed database-access error, and the three remaining over-long log
  lines are split like their siblings.
