-- Scheduling metadata only. Never delete user records or manuscripts from this migration.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending_confirmation','scheduled','cancelled','blocked','completed')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  scheduled_for TEXT,
  cancelled_at TEXT,
  completed_at TEXT,
  backup_verified_at TEXT,
  backup_reference TEXT,
  block_reason TEXT,
  idempotency_key TEXT NOT NULL,
  UNIQUE(owner_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_one_active
 ON account_deletion_requests(owner_id) WHERE status IN ('pending_confirmation','scheduled');
CREATE INDEX IF NOT EXISTS idx_account_deletion_due ON account_deletion_requests(status,scheduled_for);
