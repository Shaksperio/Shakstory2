# Integração literária com OmniRoute

## Pesquisa registrada em 26 de agosto de 2026

O repositório público [OmniRoute](https://github.com/diegosouzapw/OmniRoute) descreve um gateway OpenAI-compatible com uma entrada local única e roteamento entre múltiplos provedores e modelos. O quickstart documenta o endpoint `http://localhost:20128/v1/chat/completions` e o uso de `model: "auto"`; o projeto também informa que modelos específicos podem ser chamados por identificadores de provedor. A documentação do repositório deve ser tratada como fonte operacional, pois catálogo, limites e provedores podem mudar.

| Decisão | Diretriz para o Shakstory |
| --- | --- |
| Ponto de integração | Backend do Shakstory; nunca expor chave ou endpoint administrativo no navegador. |
| Protocolo | Chat Completions compatível com OpenAI, com resposta estruturada JSON quando suportado. |
| Roteamento | Permitir modelo configurável no servidor; usar `auto` apenas quando o operador tiver validado os provedores ativos. |
| Fonte principal | Manus `invokeLLM` pode ser o fallback interno; OmniRoute entra como gateway externo opcional e configurável. |
| Manuscrito | Enviar somente o trecho solicitado; não persistir o texto enviado nem a resposta por padrão. |
| Autoria | A IA retorna diagnóstico e sugestões; nenhuma alteração é aplicada automaticamente. |
| Resiliência | Se OmniRoute estiver indisponível, mostrar erro recuperável e manter o rascunho local intacto. |

## Escopo inicial da assistência

A primeira versão será organizada em análises explícitas: revisão ortográfica e gramatical; identificação de tempo verbal, verbos, pronomes, artigos, preposições, substantivos e adjetivos; alternativas de palavras e sinônimos; coerência de voz narrativa; ritmo e repetição; tom e estilo. As análises devem distinguir erro provável, preferência editorial e observação literária, pois uma escolha estilística não é necessariamente um erro.

Cada sugestão deve carregar categoria, trecho original, proposta opcional, explicação curta, confiança e posição aproximada no texto. O contrato deve rejeitar propriedades desconhecidas, exigir que o trecho original esteja presente no texto analisado e limitar o tamanho do trecho submetido. A aplicação será manual e individual, preservando o histórico de autosave e sincronização GitHub já existente.

## Riscos e limites

O OmniRoute agrega provedores com políticas, quotas, retenção e disponibilidade diferentes. Portanto, o Shakstory não deve prometer que um modelo gratuito seja adequado para material inédito ou confidencial. A interface deve informar qual modo está ativo e recomendar revisão humana. Chaves de provedor e a URL do gateway devem ser armazenadas como segredos do servidor, com timeout, tratamento de falhas e limite de requisições.

## Referências

[1]: https://github.com/diegosouzapw/OmniRoute "OmniRoute — gateway de IA e documentação operacional"
[2]: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/PROVIDER_REFERENCE.md "OmniRoute Provider Reference"
[3]: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/SECURITY.md "OmniRoute Security"

## Configuração operacional confirmada no release v3.8.51

A documentação do release atual confirma que o gateway local atende por padrão na porta `20128` e aceita chamadas OpenAI-compatible em `/v1/chat/completions`, usando `model: "auto"` para roteamento automático. O arquivo de ambiente de exemplo também mostra que uma instalação do OmniRoute exige segredos próprios para iniciar com segurança, especialmente `JWT_SECRET` e `API_KEY_SECRET`; esses segredos pertencem ao servidor OmniRoute e não devem ser reutilizados no Shakstory.

Isso esclarece a configuração: o Shakstory não deve tentar descobrir um endereço remoto automaticamente. Se o OmniRoute estiver instalado na mesma máquina, `http://localhost:20128/v1` é o endereço natural; porém, o ambiente publicado do Shakstory não compartilha o `localhost` do computador do usuário. Para usar o OmniRoute a partir da produção, é necessário publicar o OmniRoute em uma URL HTTPS acessível ao backend, protegida por uma chave de API do próprio gateway. Caso isso ainda não exista, a implementação deve funcionar inicialmente com o LLM server-side integrado do Manus e deixar o conector OmniRoute como modo opcional, sem bloquear o editor.

O catálogo de modelos e provedores do OmniRoute é dinâmico. Portanto, o Shakstory deve consultar `/v1/models` no backend quando o conector estiver configurado, em vez de hardcodar a lista encontrada no README. O usuário poderá então escolher entre `auto` e os modelos efetivamente retornados pelo gateway.

## Validação de produção

Em 26 de agosto de 2026, um `POST` sem assinatura para `https://shakstory-cpuxtpcc.manus.space/api/github/webhook` respondeu `401` em JSON, confirmando que a rota publicada está ativa e protegida por HMAC. Não foi possível forçar, no domínio publicado, os estados autenticados `synced`, `local-only` e `conflict` sem uma sessão de usuário e uma alteração concorrente real. Esses estados permanecem cobertos por testes automatizados e pela implementação visível no WriterStudio; a validação manual de conflito deve ser feita pelo proprietário no preview ou na produção com duas sessões.

## Estado atual da ativação externa

O adaptador e a validação de segurança estão publicados no backend, porém a ativação externa efetiva ainda não ocorreu: não existe um endpoint HTTPS público nem uma chave real fornecidos para este projeto. Portanto, o Shakstory continua usando o fallback Manus por padrão. Quando o operador publicar o OmniRoute, deverá cadastrar `OMNIROUTE_BASE_URL=https://.../v1` e `OMNIROUTE_API_KEY` como secrets server-side; o backend rejeitará URLs HTTP em produção.
