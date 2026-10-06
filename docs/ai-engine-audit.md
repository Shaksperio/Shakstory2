# Auditoria do AI Engine

## Limites e contexto

A análise literária aceita trechos de 1 a 14.000 caracteres, recebe foco e idioma explícitos e solicita resposta JSON estritamente estruturada. O resultado é filtrado por offsets UTF-16: uma sugestão só pode ser aplicada quando o trecho literal ainda coincide com o manuscrito atual. Isso impede alteração automática e protege contra respostas desatualizadas.

## Timeout e falhas

O adaptador OmniRoute usa `AbortController` com limite de 12 segundos por requisição. Respostas HTTP não bem-sucedidas, endpoint inválido, protocolo inseguro em produção, resposta vazia e JSON fora do contrato propagam erros tratados pela procedure. O fallback para o modelo Manus permanece ativo quando OmniRoute não está configurado.

## Concorrência e cancelamento

A interface mantém uma mutation por análise e apresenta estado de carregamento; uma nova análise substitui o resultado anterior. A aplicação das sugestões é sempre manual e valida novamente offsets e texto original. O cancelamento de uma requisição em andamento não é exposto como controle separado no produto; o cancelamento técnico ocorre quando o timeout aborta a requisição.

## Retry, custos e snapshots

Não há retry automático deliberado no adaptador, evitando duplicar chamadas potencialmente custosas ou repetir análise sem consentimento. O produto não estima preço de tokens porque os gateways podem aplicar tabelas diferentes. O manuscrito não é enviado ao cliente de terceiros diretamente: a chamada é server-side. O estado analisado permanece no painel até troca de nó, livro ou nova análise; o documento versionado só muda mediante ação editorial explícita e salvamento.

## Evidência automatizada

A suíte cobre validação de limites e contrato, endpoint inseguro, falha HTTP/LLM, offsets inválidos, fallback Manus, propagação tRPC e proteção contra alteração automática do rascunho. A cobertura de integração externa real depende de endpoint e credencial OmniRoute fornecidos pelo proprietário.

## Decisões de segurança

Secrets permanecem no gerenciador seguro. Em produção, endpoints externos exigem HTTPS. Nenhuma sugestão é aplicada automaticamente ao texto e nenhuma resposta do modelo é tratada como autoridade sobre fatos, voz ou intenção autoral.
