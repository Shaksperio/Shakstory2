# Autoria e procedência (marco 1)

- **O que faz:** o autor ativa o Google Authenticator (TOTP) e, com o código, registra versões de um livro ("Autoria" no card do livro em Minha conta). Cada registro guarda o SHA-256 do livro **como está no servidor** (`library.json` da conta), a data do servidor e o hash do registro anterior (cadeia). `GET /api/xuri/history` reconfere a cadeia.
- **O que não faz:** não bloqueia edição nem salvamento (o guardião nunca bloqueia escrita). Não é certidão de autoria nem prova quem escreveu. A data é a do servidor, sem carimbo externo.
- **Segurança:** segredo TOTP cifrado (AES-GCM) com o segredo `XURI_KEY` do Worker; cada código vale uma vez; 5 erros travam por 10 min; 8 códigos de recuperação guardados só em hash; janela de 15 min depois de um código válido.
- **Ativação em produção:** criar o secret `XURI_KEY` no Worker (32+ caracteres aleatórios). Sem ele as rotas respondem 503.
- **Marco 2 (reservado nas tabelas `shak_versions.signature` e `ts_proof`):** assinatura Ed25519 feita no navegador e carimbo de tempo externo (OpenTimestamps ou ICP-Brasil), depois dossiê baixável e página pública de verificação.
