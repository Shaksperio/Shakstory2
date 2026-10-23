# Central da Conta — plano técnico de implantação

## Identidade e fontes de dados
- O backend Node mantém `users` por `openId` e realiza upsert no callback OAuth.
- O Worker usa identidade de Cloudflare Access por e-mail e mantém `shak_users`, compras, períodos e pagamentos no D1.
- O Firebase usa tokens de espelhamento com `mirrorEmail`; livros e compartilhamentos exigem inventário específico.
- **Não equiparar `openId` e e-mail sem vínculo autenticado.** Definir ID canônico e migração antes de exclusão.

## Fases
1. Inventariar dados pessoais por sistema (MySQL, D1, Firebase, armazenamento, backups, links públicos e logs), estabelecer retenção legal e responsabilidade de cada serviço.
2. Persistir estados `active/deactivated/deletion_pending/deleted` em fonte de autoridade; impedir login, upsert recriador, sessões antigas e rotas Worker/Firebase para estados não ativos.
3. Criar APIs autenticadas para perfil, exportação e direitos LGPD com verificação de propriedade; impedir mudança direta de e-mail/identidade.
4. Expor planos vigentes do Worker e solicitações de mudança/cancelamento; pagamentos Ton só por confirmação confiável, sem fingir renovação automática.
5. Integrar provedor transacional de e-mail (credenciais em secrets), reautenticação recente, token criptográfico de uso único armazenado apenas como hash, expiração de 15 minutos, limites de tentativa e envio; link GET nunca executa exclusão, exige confirmação POST autenticada.
6. Revogar sessões e acesso público, executar exclusão idempotente e rastreável em todos os armazenamentos, respeitar retenções legalmente obrigatórias; bloquear restauração involuntária por backup e criação automática da mesma identidade.
7. Criar interface /conta e páginas de confirmação, estados de processamento, testes E2E de segurança e implantação gradual.

## Invariantes de segurança
- Conta `deleted` jamais reativável; `deactivated` só reativável durante janela contratual de 30 dias, sem conversão silenciosa em exclusão.
- Token expirado, usado, pertencente a outra conta ou emitido antes de nova solicitação é inválido.
- Exclusão somente após confirmação explícita e reautenticação; nunca por GET.
- Dados elegíveis à eliminação são removidos de MySQL, D1, Firebase, objetos e compartilhamentos; exceções de retenção documentadas e segregadas.
- Falhas parciais não podem devolver acesso à conta; reconciliador registra etapas pendentes.
- Antes de liberar produção: testar login após exclusão, acesso por token antigo, links públicos, exportação, cancelamento e reativação.
