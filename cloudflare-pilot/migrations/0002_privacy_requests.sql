-- Isolated LGPD protocol records; no changes to manuscripts or editorial_documents.
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('access','correction','portability','processing_info')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_owner_created ON privacy_requests(owner_id, created_at DESC);
