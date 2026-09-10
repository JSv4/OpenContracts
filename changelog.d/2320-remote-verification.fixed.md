Remote ingest now verifies the whole ledger with stable completion, outstanding,
failure and unavailable exit codes and streaming JSON Lines results. Receipt HTTP
errors no longer masquerade as processing or overwrite durable ledger state.
Embedding response validation is shared with the server microservice client;
remote preparation requires complete, finite vectors before upload or caching.
