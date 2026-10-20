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
