-- Stable internal identity; never authorize account linkage from a client-supplied email.
CREATE TABLE IF NOT EXISTS account_identities (
  account_id TEXT PRIMARY KEY,
  verified_email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS account_identity_providers (
  provider TEXT NOT NULL CHECK(provider IN ('firebase','cloudflare_access')),
  provider_subject TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES account_identities(account_id),
  verified_email_at_link TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider,provider_subject),
  UNIQUE(account_id,provider)
);
CREATE INDEX IF NOT EXISTS idx_account_identity_provider_account ON account_identity_providers(account_id);
CREATE TABLE IF NOT EXISTS account_identity_security_events (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
