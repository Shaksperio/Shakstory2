# Workers de produção do Shakstory

- `shakstory` (atrás do Cloudflare Access): frontend + API D1. Rotas de compartilhamento adicionadas:
  `POST /api/share` (publica/atualiza o snapshot; token fixo por livro, padrão privado),
  `POST /api/share/visibility`, `GET /api/share/:token` (autor), `GET /api/share/login?next=/ler/:token`.
- `shakstory-leitor` (sem Access, `leitor-worker.js`): mesmo frontend e `GET /api/public/share/:token`,
  que só devolve histórias marcadas como públicas.
- Dados em `editorial_documents`: `shares/<token>.json` e `share-index/<sha256(bookId)>.json`.


## Cowila Privacidade — integração ainda não publicada

A inspeção de leitura do Worker `shakstory` em 20/10/2026 confirmou:
- Binding D1 `DB` aponta para `shakstory-pilot`.
- O Worker ativo contém `verifyAccessJwt` e valida o token `Cf-Access-Jwt-Assertion` em rotas existentes.
- O Worker ativo é um bundle próprio com `export default { async fetch(req, env) ... }`; não importa automaticamente módulos deste diretório.
- O código de `cloudflare-worker/privacy-requests.js` **não foi incorporado** ao Worker ativo.

Para integrar com segurança, inserir o código do módulo no bundle (sem `export`) e, no começo do `fetch`, antes do roteamento genérico de `/api/`:

```js
if (u.pathname.startsWith("/api/privacy/requests")) {
  const verifiedOwnerId = await verifyAccessJwt(req.headers.get("Cf-Access-Jwt-Assertion"));
  return await handlePrivacyRequest(req, env, verifiedOwnerId);
}
```

**Importante:** confirmar que `verifyAccessJwt` valida assinatura, issuer, audience e expiração e retorna uma identidade estável. O exemplo usa a identidade devolvida pelo verificador atual; antes de ativar contas reais, confirmar política de mudança de e-mail. Aplicar migração D1 somente após backup, aprovação e testes. Não substituir nem publicar o Worker sem conferir todas as rotas existentes e os bindings.
