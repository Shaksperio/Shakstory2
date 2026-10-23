-- Aplicar e validar antes de publicar código que consulta estas colunas.
-- Não apaga dados e mantém contas existentes ativas.
ALTER TABLE users
  ADD COLUMN accountStatus ENUM('active', 'deactivated', 'deletion_pending', 'deleted') NOT NULL DEFAULT 'active',
  ADD COLUMN deactivatedAt TIMESTAMP NULL,
  ADD COLUMN deletionRequestedAt TIMESTAMP NULL,
  ADD COLUMN deletedAt TIMESTAMP NULL;
