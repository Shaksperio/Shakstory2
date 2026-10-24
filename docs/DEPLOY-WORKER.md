# Publicar o Worker `shakstory` (contas, planos e pagamentos)

**Por que existe:** publicar o frontend (GitHub Pages ou a branch `cloudflare-dist-v2`) **não** atualiza o código do Worker. As rotas `/api/admin/billing`, `/api/admin/offer`, `/api/admin/users`, `/api/admin/plan` e `/api/billing/*` só existem no Worker depois de aplicar `cloudflare-worker/plans.js` nele. Sem isso elas respondem 404, mesmo com o frontend novo.

O app avisa quando isso acontece: o painel **Pagamentos** mostra "O Worker em produção está desatualizado" quando `/api/me` não informa a versão esperada (`workerVersion`, hoje `2026-10-24.2`).

## Atualizar o Worker `shakstory`

1. **Guarde o Worker atual.** Cloudflare → Workers → `shakstory` → Editar código → copie o script inteiro para um arquivo `worker-atual.js` e guarde uma cópia à parte (é o seu desfazer). O script não contém segredos: chaves ficam em variáveis e segredos do Worker, que não são tocados.
2. **Gere o novo script**, com o repositório atualizado (`turbo`):
   ```
   node scripts/patch-worker-plans.mjs --upgrade worker-atual.js worker-novo.js
   node --check worker-novo.js
   ```
   - Worker que **nunca** recebeu o código de contas: rode **sem** `--upgrade`.
   - Códigos de saída: `0` ok · `3` já aplicado (sem `--upgrade`) ou nada para atualizar (com `--upgrade`) · `4` formato inesperado do Worker · `5` falta aplicar antes `patch-worker-mirror.mjs` · `6` não achei o bloco instalado com segurança · `7` o portão não aparece exatamente uma vez. Em qualquer erro **nada é gravado**; não publique.
3. **Publique `worker-novo.js` no Worker `shakstory`** (e em nenhum outro). Variáveis, segredos e o D1 continuam como estão. As tabelas novas (`shak_offers`, `shak_purchases` etc.) são criadas sozinhas no primeiro uso.
4. **Worker de contingência `shakstory-ai`** (se for atualizá-lo): `node scripts/build-contingency-ai.mjs saida.js` e publique a saída nele.

## Conferir (cada item separado)

- Abra o app como administrador: o painel **Pagamentos** não mostra o aviso de Worker desatualizado.
- `GET /api/me` (logado como administrador) traz `"workerVersion": "2026-10-24.2"`.
- Painel **Pagamentos**: salvar uma oferta de teste, recarregar e ver que persistiu.
- Conta comum: não consegue abrir `/api/admin/*` (recebe recusa do servidor, não 404).
- Pagamento: o pedido só vira plano depois da confirmação com o ID da transação (nenhum link ativa plano sozinho).

## Central de Contas e privacidade

`cloudflare-worker/account-center.js` define `cowilaPrivacy` (`/api/privacy/requests`) e `ACCOUNT_CENTER_HTML` (`/account-center`). O patcher instala esse arquivo logo depois de `plans.js`; um upgrade nunca deve apagar o trecho entre o bloco de planos e a entrada do Worker. Depois de publicar, confira que `/account-center` abre e que `/api/privacy/requests` responde (401 sem login, lista com login).

## Consulta pública X-URI

A versão `2026-10-24.2` adiciona `GET /api/public/xuri/lookup?q=<UID ou SHA-256>` (alias `/api/xuri/public/lookup`) e `POST /api/xuri/publish`. Só obras que o autor publicou (janela do autenticador aberta) aparecem; a resposta nunca traz e-mail, nota, segredo nem texto da obra. Limite: 30 consultas por minuto por endereço. O D1 ganha as colunas `shak_works.published_at` e `public_name` e a tabela `shak_xuri_lookups` sozinhos no primeiro uso. Para a consulta funcionar sem login, o caminho `/api/public/*` precisa estar liberado no Cloudflare Access.

## Desfazer

Republique o `worker-atual.js` guardado no passo 1 (ou use Deployments → versão anterior, na Cloudflare). Os dados no D1 não são apagados por nenhuma das duas direções.

## Ao mudar `plans.js`

Troque `SHAK_WORKER_VERSION` em `cloudflare-worker/plans.js` e `EXPECTED_WORKER_VERSION` em `client/src/lib/plans.ts` para o mesmo valor (um teste confere). Assim o app passa a avisar até o Worker ser atualizado. A versão `2026-10-23.4` inclui também a validação estrutural mais estrita da resposta RFC 3161; ela não substitui a validação criptográfica externa do token.
