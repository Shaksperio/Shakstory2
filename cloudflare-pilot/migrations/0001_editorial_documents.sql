CREATE TABLE IF NOT EXISTS editorial_documents (
  document_path TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  sha TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_documents_updated_at
  ON editorial_documents(updated_at);
