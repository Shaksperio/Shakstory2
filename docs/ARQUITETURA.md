# Arquitetura do Shakstory

O Shakstory seguirá a separação estrutural do segundo anexo, mas com vocabulário e entidades exclusivos de um estúdio de autoria. O frontend conhece apenas os contratos de domínio e as operações da API. Ele não acessa GitHub, Firebase, arquivos JSON ou credenciais diretamente.

> **Princípio:** o aplicativo conversa com uma camada de acesso a dados; a escolha entre banco operacional, JSON local versionado, GitHub ou Firebase pertence ao backend.

| Camada | Responsabilidade | Dependências permitidas |
| --- | --- | --- |
| `client/` | Dashboard, editor, planejamento, preview e experiência offline local. | Contratos tRPC e tipos compartilhados. |
| `server/` | Autenticação, autorização, validação, autosave, busca e histórico. | Banco operacional, storage e repositórios. |
| `backend/src/repositories/` | Abstração para leitura, escrita, listagem e restauração de documentos. | Implementações intercambiáveis. |
| `schemas/` | Contratos JSON para validar documentos exportados ou sincronizados. | JSON Schema 2020-12. |
| `data/` | Dados editoriais versionáveis quando o modo JSON estiver habilitado. | Arquivos independentes por entidade. |
| `scripts/` | Validação, exportação, backup e restauração. | Ambiente de execução do servidor. |
| `docs/` | Operação, recuperação e decisões de arquitetura. | Nenhuma credencial. |

## Fluxo de escrita

Uma alteração no editor é persistida primeiro como rascunho local, agrupada pelo autosave e enviada à API. A API valida autorização, versão do documento e conteúdo; depois grava no banco operacional. Quando o adaptador versionado estiver configurado, a mesma mudança poderá ser enfileirada para JSON e publicada em lote em um commit, sem alterar o frontend.

```text
Autor → Editor → API protegida → Validação → Repositório → Banco operacional
                                      └────→ JSON/GitHub, quando habilitado
```

## Independência de provedores

A autenticação existente do projeto continua protegendo as rotas. O Firebase não será acessado diretamente pelo navegador como dependência obrigatória. Ele poderá atuar como fonte de migração, réplica ou backup, desde que suas credenciais permaneçam exclusivamente no ambiente do servidor. O GitHub será usado para código e dados versionados, nunca como uma API de CRUD chamada a cada tecla.

## Concorrência

Cada documento JSON terá `version` e `updatedAt`. O adaptador GitHub também guardará o `sha` do conteúdo lido. Uma gravação só poderá substituir o arquivo se o SHA ainda corresponder ao que foi lido; caso contrário, a API registra um conflito e preserva ambos os estados para decisão explícita.

## Segurança

Os dados são sempre filtrados pelo identificador do autor no backend. Os diretórios de dados não conterão tokens, chaves privadas, arquivos de sessão, imagens binárias ou informações de outros usuários. Arquivos visuais permanecem no storage de objetos; o JSON guarda apenas o identificador e os metadados necessários.
