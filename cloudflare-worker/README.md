# Workers de produção do Shakstory

- `shakstory` (atrás do Cloudflare Access): frontend + API D1. Rotas de compartilhamento adicionadas:
  `POST /api/share` (publica/atualiza o snapshot; token fixo por livro, padrão privado),
  `POST /api/share/visibility`, `GET /api/share/:token` (autor), `GET /api/share/login?next=/ler/:token`.
- `shakstory-leitor` (sem Access, `leitor-worker.js`): mesmo frontend e `GET /api/public/share/:token`,
  que só devolve histórias marcadas como públicas.
- Dados em `editorial_documents`: `shares/<token>.json` e `share-index/<sha256(bookId)>.json`.
