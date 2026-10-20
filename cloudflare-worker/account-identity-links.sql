-- Additive migration. Do not apply before confirming D1 binding and backup.
-- Identity links are independent of manuscript/document storage.
CREATE TABLE IF NOT EXISTS shak_account_identity_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  access_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  google_uid TEXT NOT NULL UNIQUE,
  google_email TEXT NOT NULL COLLATE NOCASE,
  linked_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  CHECK (length(access_email) BETWEEN 3 AND 320),
  CHECK (length(google_uid) BETWEEN 1 AND 128),
  CHECK (lower(access_email) = lower(google_email))
);
