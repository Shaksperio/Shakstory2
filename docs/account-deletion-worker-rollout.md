# Integração segura da exclusão ao Worker

Estado: **não ativada em produção**. O código de elegibilidade é um módulo de pré-verificação somente leitura, não uma rota publicada e não um executor de exclusão.

## Pré-requisitos para publicar a rota

1. Identificar a entrada real do Worker em uso, revisar seu roteamento e política de autenticação; não criar uma rota paralela sem autenticação.
2. Confirmar a configuração Firebase project ID pelo ambiente (não confiar em valor fornecido pelo cliente). A chave pública JWKS precisa de verificação criptográfica e testes com tokens reais, incluindo rotação de chave.
3. Criar migração D1 para vínculo persistente e exclusivo entre o usuário Access, o e-mail canônico e o UID Google verificado. Exigir cerimônia autenticada pelos dois provedores. Não usar e-mail declarado pelo navegador nem custom token de espelhamento como prova de login Google.
4. Consultar o usuário D1 a partir da identidade Access validada no servidor. Não aceitar userId, e-mail ou googleUid da requisição como autoridade.
5. Registrar Turnstile site key e secret por configuração segura; exigir hostname correto, action delete_account e verificar o token no siteverify a cada operação. Aplicar rate limiting, proteção CSRF e limites de tamanho.
6. Vincular a pré-verificação a um desafio de uso único com TTL curto e consumo atômico em D1. Nunca transformar a resposta eligible em autorização de exclusão reutilizável.
7. Verificar retenções, backups, exportação, referências entre D1/Firestore/Storage e planos. Implementar exclusão idempotente e auditável, com recuperação em falhas parciais, antes de qualquer operação irreversível.
8. Testar localmente e em staging com identidades distintas, tokens expirados, contas desativadas, falhas de rede, replay, concorrência, recuperação de manuscritos e falha parcial de limpeza.

## Estado do código

- `google-identity.js`: verificador Firebase ID token RS256, projeto/issuer, provedor Google e email_verified.
- `deletion-eligibility.js`: exige Access verificado, UID previamente vinculado, e-mail D1 coincidente e autenticação Google com até 5 minutos.
- `deletion-confirmation.js`: nome exato e confirmação explícita; Turnstile siteverify.
- `deletion-preflight.js`: combina as verificações, devolve apenas resultado; **não executa exclusão**.
- `AccountCenter.tsx`: confirma intenção para **registrar solicitação**, sem oferecer exclusão automática.

## Regra de publicação

Não fazer deploy nem habilitar exclusão enquanto faltar qualquer pré-requisito. CI verde não comprova recuperação de manuscritos nem segurança do fluxo completo.

## Verificação de produção — 20/10/2026

Leitura via API Cloudflare confirmou que o Worker publicado é `shakstory` (módulo `worker.js` no multipart de `/content/v2`) e seu binding `DB` aponta para D1 `shakstory-pilot`, ID `b2c9c84a-0ff2-4d7f-8b17-e1046149af4a`.

A migração aditiva `shak_account_identity_links` foi aplicada nesse D1 após consulta da estrutura e obtenção de marcador Time Travel. A consulta de confirmação mostrou a tabela criada e **0 vínculos**. Nenhum manuscrito ou conta existente foi modificado.

**Bloqueio encontrado no código publicado:** `shakGateCore` permite modo legado quando `Cf-Access-Jwt-Assertion` não está presente, inclusive retornando `owner:true` em `/api/me`. Isso é incompatível com autorização de exclusão. O novo adaptador `account-deletion-route.js` rejeita qualquer requisição sem JWT validado; ele não deve herdar permissões legadas.

O adaptador é **somente código de integração**, não está registrado na entrada publicada do Worker. A tabela D1 `shak_users` possui `email, created_at, plan, paid_until`, mas não possui nome de exibição canônico. Por isso o adaptador **nega a pré-verificação** até existir esse dado no servidor. Também faltam `FIREBASE_PROJECT_ID` e credenciais Turnstile verificadas. Não publicar a rota nem expor um botão de exclusão como funcional antes de resolver esses bloqueios.

**Sincronização e recuperação:** os testes unitários de falha fechada não simulam uma sincronização D1 ↔ Firebase nem restauração real de manuscrito. É necessário um teste de staging isolado, com documento sintético, falhas injetadas, reconciliação e comparação de hashes antes/depois. Não utilizar dados editoriais de produção como fixture. Não houve teste de escrita em produção.

**Deploy:** nenhum deploy realizado nesta etapa. O Worker atualmente publicado não inclui a nova rota; a migração da tabela por si só não altera o roteamento.
