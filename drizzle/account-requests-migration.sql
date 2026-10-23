-- Executar em janela controlada, após backup e validação do esquema.
CREATE TABLE account_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  kind ENUM('access','correction','export','privacy','plan_change','cancel_plan','deactivate','delete') NOT NULL,
  details TEXT NULL,
  status ENUM('pending','in_review','resolved','rejected') NOT NULL DEFAULT 'pending',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX account_requests_user_created_idx (userId, createdAt)
);
