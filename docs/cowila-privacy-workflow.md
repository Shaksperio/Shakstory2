# Cowila Privacidade — contrato de implementação (fase 1)

## Objetivo
Atender pedidos LGPD dentro da Central de Contas, com autenticação, protocolo e execução automatizada **somente** de ações permitidas por política explícita do servidor.

## Estados persistidos no servidor
`recebido` → `verificacao_pendente` → `verificado` → `exportacao_preparando` → `exportacao_disponivel` → `confirmacao_pendente` → `executando` → `concluido`.
Exceções: `verificacao_recusada`, `falha`, `revisao_necessaria`, `cancelado`.

## Regras obrigatórias
- O servidor cria o protocolo **no recebimento**, antes da análise. Nunca usar apenas armazenamento local para protocolos.
- Identidade deriva de sessão validada no servidor; não aceitar e-mail, UID, titular ou permissões fornecidos pelo próprio cliente como prova.
- Reautenticação reforçada para alteração de credenciais, desativação e exclusão.
- A Cowila pode explicar e classificar o pedido, mas não pode autorizar execução apenas por texto de chat ou por decisão do modelo.
- A autorização é determinística, específica por operação e vinculada ao titular autenticado, com expiração e prevenção de repetição.
- Acesso, correção e portabilidade podem ser automatizados após verificação; execução deve ocorrer em serviços com escopo mínimo.
- Antes de operação destrutiva: inventariar manuscritos, anexos, dados locais e dados remotos; produzir exportação verificável, oferecer download, obter confirmação explícita, registrar recibo. Dados exclusivamente no navegador não podem ser exportados pelo servidor sem participação do dispositivo.
- **Exclusão definitiva desabilitada** até backup completo testado, reautenticação, política de retenção, confirmação explícita e testes de recuperação. Nunca apagar Firebase, D1, manuscritos ou sincronização nesta fase.
- Toda transição e execução registra evento auditável (identificador de pedido, ator, ação, resultado, horário), evitando conteúdo sensível desnecessário nos logs.
- Restringir consulta de protocolo ao próprio titular; aplicar limites de requisição e idempotência.
- Meta de resposta inicial: até 24h; não prometer execução em 24h para todos os direitos nem substituir prazos legais.
- Falhas de backup/exportação bloqueiam qualquer operação destrutiva; não marcar concluído sem confirmação do executor.

## API proposta (não implementada)
- POST /privacy/requests — criar protocolo autenticado
- GET /privacy/requests — listar pedidos do titular
- GET /privacy/requests/:id — consultar status e eventos autorizados
- POST /privacy/requests/:id/verify — iniciar/concluir desafio confiável
- POST /privacy/requests/:id/export — preparar pacote e comprovante de integridade
- POST /privacy/requests/:id/confirm — confirmar operação após download e reautenticação quando aplicável
- POST /privacy/requests/:id/execute — execução interna autorizada, não exposta diretamente ao navegador

## Próximas etapas
1. Identificar infraestrutura de autenticação e armazenamento do ambiente principal e contingência.
2. Implementar banco, endpoints autenticados, testes de isolamento entre contas e protocolo.
3. Implementar exportação real dos dados pessoais e manuscritos com conferência de integridade.
4. Integrar Cowila ao fluxo sem delegar a ela autorização de segurança.
5. Integrar Central de Contas e habilitar ações gradualmente após testes.
