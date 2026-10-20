-- Cowila: triagem automática segura, sem acesso a manuscritos ou credenciais.
-- A automação só classifica pedidos; execução de direitos exige revisão e verificação.
CREATE TABLE IF NOT EXISTS privacy_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES privacy_requests(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('received','triaged','review_required')),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_events_request_type
ON privacy_request_events(request_id, event_type);
CREATE INDEX IF NOT EXISTS idx_privacy_events_request
ON privacy_request_events(request_id, created_at);
