-- Additive migration: persistent deletion requests, no destructive triggers.
CREATE TABLE IF NOT EXISTS shak_account_deletion_requests (
  request_id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'retry', 'completed', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_error_code TEXT,
  lease_until INTEGER,
  completed_at INTEGER,
  CHECK(length(account_email) BETWEEN 3 AND 320)
);
CREATE INDEX IF NOT EXISTS shak_account_deletion_requests_account_status
ON shak_account_deletion_requests(account_email, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS shak_account_deletion_requests_one_open
ON shak_account_deletion_requests(account_email)
WHERE status IN ('pending', 'processing', 'retry');
