# Shakstory — Relatório técnico de estrutura para desenvolvedores

**Data da auditoria:** 05/10/2026  
**Versão funcional de referência:** Shakstory 1.1  
**Repositório:** `Shaksperio/Shakstory`  
**Domínio publicado informado pelo ambiente:** `https://shakstory-cpuxtpcc.manus.space`

## 1. Objetivo do produto

O Shakstory é um estúdio web para autores. O produto combina planejamento narrativo, escrita estrutural, revisão literária assistida, preparação editorial, layout e exportação de livros em múltiplos formatos.

A orientação de produto é uma fusão funcional — não uma cópia de código — das seguintes referências:

| Referência | Conceitos aproveitados |
|---|---|
| Novelist | Planejamento de projeto, personagens, locais, eventos, metas e organização narrativa. |
| Kindle Create | Estrutura de manuscrito, preparação de publicação, sumário e preocupação com formatos de livro. |
| Atticus | Layout editorial, presets tipográficos, preview e exportação para publicação. |

O princípio central é separar **conteúdo autoral**, **estrutura narrativa**, **layout**, **ativos**, **persistência** e **exportação**. Uma mudança de código ou de layout não deve zerar o manuscrito nem alterar silenciosamente o texto do autor.

## 2. Estado atual resumido

A base atual contém:

| Área | Estado verificado |
|---|---|
| Editor | Estrutura semântica compatível com Livro → Partes → Capítulos → Cenas → Blocos, com nós legados preservados para compatibilidade. |
| Biblioteca | Projetos, busca, status editoriais, ordenação, métricas, ações de continuar, editar, exportar, zerar e excluir com confirmação. |
| Planejamento | CRUD de personagens, locais, eventos/timeline, cenas planejadas, objetivos, conflitos, notas, tags, status e relações por ID. |
| Persistência | Autosave local, recuperação, documento versionado, repositório JSON e adaptador GitHub com controle por SHA/conflito. |
| IA | Assistência literária server-side com contrato estruturado, limites, timeout, fallback e aplicação manual de sugestões. |
| Book Builder | Metadados editoriais, capa, ISBN, categoria, idioma, data de publicação, front matter, back matter e sumário. |
| Layout | Presets tipográficos, formatos A4/A5/6×9, margens, capitular, cabeçalho, rodapé e regras de viúvas/órfãs no HTML de impressão. |
| Exportação | EPUB, PDF, DOCX, TXT e HTML/ebook, sem mutar o documento editorial. |
| Segurança | Sessões e auditoria KicomAV no código atual, upload de capa condicionado à varredura e rotas protegidas. |
| QA | Suíte automatizada, typecheck, build, validação de dados e validação de repositório definidos no projeto. |

**Importante:** o código atual contém uma integração KicomAV inicial (`server/antivirus.ts`, worker Python, schema e Dockerfile), enquanto partes antigas do README e da auditoria preliminar ainda descrevem a proteção como planejada. Essa divergência documental deve ser corrigida em uma atualização específica; o relatório não trata documentação antiga como fonte de verdade quando ela contradiz o código atual.

## 3. Stack e runtime

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Radix UI/shadcn, Framer Motion, Lucide. |
| Roteamento | Wouter. |
| Contrato API | tRPC 11 com React Query/TanStack Query. |
| Backend | Node.js, Express, TypeScript, `tsx` em desenvolvimento, esbuild no bundle de produção. |
| Banco | Drizzle ORM, MySQL/TiDB, schema em `drizzle/schema.ts`. |
| Storage | Storage de objetos por `storagePut`; o documento editorial guarda referência/metadados, não bytes binários. |
| Persistência editorial | Repositório abstrato com modo JSON local e modo GitHub versionado por SHA. |
| Exportação | JSZip/EPUB, jsPDF/PDF, `docx`/DOCX e HTML de impressão. |
| IA | Adaptador literário próprio, fallback Manus e integração opcional OmniRoute/OpenAI-compatible no backend. |
| Antivírus | Worker Python/KicomAV vendorizado, com YARA e execução isolada prevista no container. |
| Testes | Vitest, Testing Library, jsdom e testes de domínio, backend e UI. |
| Deploy | Container Node 22 slim; Python 3 e ambiente virtual KicomAV no `Dockerfile`. |

Dependências e scripts oficiais estão em `package.json`:

```bash
pnpm dev
pnpm check
pnpm test
pnpm validate:data
pnpm validate:repository
pnpm build
pnpm db:push
pnpm start
```

## 4. Organização do repositório

```text
Shakstory/
├── client/
│   ├── public/                 # Somente arquivos pequenos de configuração
│   └── src/
│       ├── components/         # Shell do estúdio, editor e componentes UI
│       ├── contexts/            # Tema claro/escuro
│       ├── hooks/               # Hooks reutilizáveis
│       ├── lib/                 # Cliente tRPC e utilitários
│       ├── pages/               # Home, preview e páginas de suporte
│       ├── App.tsx              # Router e providers globais
│       ├── index.css            # Tokens e temas
│       └── main.tsx              # Bootstrap React
├── server/
│   ├── _core/                  # Infraestrutura Manus, OAuth, contexto e servidor
│   ├── routers.ts              # Contratos tRPC da aplicação
│   ├── data-access.ts          # Seleção do repositório editorial
│   ├── db.ts                   # Helpers Drizzle
│   ├── literary-analysis.ts    # Contrato e gateway de IA literária
│   ├── omniroute.ts             # Adaptador OmniRoute opcional
│   ├── antivirus.ts             # Gateway KicomAV/fail-closed
│   ├── antivirus-sessions.ts   # Credenciais efêmeras e rotação
│   ├── storage.ts              # Upload para storage de objetos
│   ├── sync-state.ts            # Estado de sincronização/conflito
│   └── *.test.ts                # Testes de API, segurança e integração
├── backend/src/repositories/
│   ├── types.ts                # Contrato DocumentRepository
│   ├── json-file-repository.ts # Persistência local/JSON
│   └── github-json-repository.ts # Persistência GitHub com SHA
├── shared/
│   ├── book-model.ts            # Livro semântico e migração de nós legados
│   ├── project-lifecycle.ts     # IDs e operações de nós
│   ├── semantic-editor.ts       # Cenas e blocos
│   ├── book-export.ts           # EPUB, PDF, DOCX e HTML
│   ├── book-persistence.ts      # Persistência e recuperação
│   ├── library-recovery.ts      # Recuperação de biblioteca
│   ├── rich-text.ts             # Sanitização de conteúdo rico
│   ├── literary.ts              # Aplicação manual de sugestões
│   ├── validation.ts            # Validation Engine de domínio
│   └── *.test.ts                # Testes de domínio e regressão
├── drizzle/
│   ├── schema.ts                # Users, sessões e auditoria antivírus
│   ├── relations.ts
│   └── migrations/
├── schemas/                     # JSON Schema versionado
├── data/                        # Manifesto e dados editoriais autorizados
├── scripts/                     # Validação, worker e utilitários operacionais
├── vendor/kicomav/              # Código KicomAV fixado/vendorizado
├── docs/                        # Arquitetura, operação, auditorias e decisões
├── Dockerfile
├── package.json
└── todo.md                      # Rastreabilidade de requisitos e checkpoints
```

Na auditoria foram encontrados **80 arquivos TypeScript/TSX no client**, **44 no server**, **21 em shared** e **28 arquivos de teste** fora de `node_modules`. A contagem é informativa e pode mudar com novas features.

## 5. Shell da aplicação e navegação

`client/src/App.tsx` fornece:

1. `ErrorBoundary` para impedir que uma falha de componente derrube silenciosamente a aplicação.
2. `ThemeProvider` com tema claro inicial e alternância.
3. `TooltipProvider` e `Toaster` para feedback de interface.
4. Rotas Wouter para Home, preview editorial e fallback 404.

O `WriterStudio` concentra o workspace do autor e organiza as views:

```text
library   → Biblioteca e projetos
project   → Metadados, metas e próximos passos
planning  → Personagens, locais, eventos, cenas e relações
editor    → Manuscrito, árvore semântica, rich text e assistência IA
prepare   → Front/back matter, capa, layout, preview e exportação
security  → Painel de sessões/estado antivírus do proprietário
```

O menu é contextual/retrátil para não ocupar o centro da área de escrita. O editor mantém livro e nó ativos em `localStorage`, reidrata o workspace após reload e restaura o último ponto de trabalho quando os IDs ainda existem.

## 6. Modelo editorial

### 6.1 Livro

O tipo de livro usado pelo workspace contém, entre outros campos:

```text
Book
├── id                 # ID estável, normalmente book-<UUID>
├── title / subtitle
├── status             # planning, draft, editing, revision, completed
├── targetWordCount
├── dailyGoalWords
├── deadline
├── startedAt / lastOpenedAt / updatedAt
├── editSeconds
├── nodes              # compatibilidade legada
├── semanticBook       # fonte semântica atual
├── planning
├── story
├── publication
└── nextSteps
```

`publication` suporta autor, gênero, categoria, idioma, descrição, ISBN, data de publicação, URL HTTPS da capa, sumário visível, preset tipográfico, formato, margens, capitular, cabeçalho, rodapé, front matter e back matter.

### 6.2 Estrutura semântica

`shared/book-model.ts` define a árvore:

```text
SemanticBook
└── parts: SemanticPart[]
    └── chapters: SemanticChapter[]
        └── scenes: SemanticScene[]
            └── blocks: SemanticBlock[]
```

Cada parte, capítulo, cena e bloco possui ID e ordem. Cenas também possuem `characterIds` e `locationIds`, permitindo relações sem depender da posição textual. Blocos podem ser parágrafo, citação, separador de cena ou heading.

A versão do contrato é `schemaVersion: "1.1"`. A migração de dados legados mantém os nós originais legíveis e cria uma representação semântica compatível, evitando perda destrutiva durante a evolução do modelo.

### 6.3 Operações estruturais

`shared/project-lifecycle.ts` oferece:

| Operação | Comportamento |
|---|---|
| Criar capítulo/parte | Gera ID estável e título editável. |
| Renomear | Atualiza título sem usar o número como identidade. |
| Duplicar | Cria novo ID e insere cópia adjacente. |
| Mover | Troca ordem por posição, preservando IDs. |
| Remover | Impede remover o último nó do conjunto. |
| Dividir | Cria continuação com novo ID, preservando conteúdo separado. |
| Unir | Combina nós adjacentes em um nó, com atualização temporal. |
| Atualizar conteúdo | Persiste texto plano e rich text sanitizado. |

A numeração exibida de partes e capítulos é derivada da ordem; o título autoral e o UUID continuam sendo a identidade real.

## 7. Planejamento e Story Engine

O módulo de planejamento usa CRUD persistido no documento editorial para:

| Entidade | Campos funcionais principais |
|---|---|
| Personagem | ID, nome, função, notas, tags e status. |
| Local | ID, nome, atmosfera, notas, tags e status. |
| Evento/timeline | ID, título, data, descrição, tags e status. |
| Cena planejada | ID, título, objetivo, conflito, notas e status. |
| Objetivo/conflito | Card com ID, título, descrição e status. |
| Relação | Origem/destino por ID, rótulo e status. |
| Nota | Conteúdo, ID estável e status. |

Os status editoriais são `planning`, `draft`, `editing`, `revision` e `completed`. Relações devem referenciar IDs, não copiar entidades inteiras; isso evita inconsistência quando um personagem ou local é editado.

A principal evolução futura é tornar os vínculos entre cenas planejadas, objetivos e conflitos ainda mais visíveis no editor estrutural e no preview do Story Engine.

## 8. Persistência, autosave e recuperação

O fluxo documentado é:

```text
Autor → WriterStudio → localStorage/autosave → tRPC protegido
      → validação → DocumentRepository → JSON local ou GitHub
      → banco/storage quando aplicável
```

Características atuais:

- Rascunho local por biblioteca e por nó.
- Autosave agrupado para evitar gravação a cada tecla.
- Recuperação de backup local quando a leitura remota falha ou está ausente.
- Documento `library.json` com `versionId` e SHA remoto.
- Controle de concorrência por `expectedSha`.
- Conflito explícito quando o documento remoto mudou; não há sobrescrita silenciosa.
- Estado de sincronização com modos `github` ou `json` e estados de erro/conflito.
- Dados de usuário separados de código e da lógica de migração.

O `server/data-access.ts` escolhe o repositório GitHub quando `GITHUB_TOKEN`, `GITHUB_OWNER` e `GITHUB_REPOSITORY` estão configurados; caso contrário, usa `JsonFileRepository` no diretório indicado por `SHAKSTORY_DATA_DIR` ou `data`.

Para uma implantação de produção, banco operacional, storage de objetos e GitHub devem ser tratados como camadas complementares. Nenhuma camada isolada deve ser considerada backup único de um manuscrito importante.

## 9. API e contratos tRPC

`server/routers.ts` expõe os principais grupos:

| Grupo | Procedimentos e responsabilidade |
|---|---|
| `auth` | `me`, `logout`; ao reconhecer sessão, registra sessão antivírus sem bloquear login. |
| `security.antivirus` | Listar, revogar e rotacionar sessões, limitado ao proprietário/admin. |
| `literaryAssist` | Listar modelos e analisar trecho com contrato estruturado. |
| `assets` | Upload de capa; valida bytes, tipo, tamanho e varredura antes do storage. |
| `data` | Status do repositório, leitura e gravação de documento com SHA esperado. |
| `system` | Rotas do framework Manus. |

As entradas são validadas com Zod. Caminhos de documentos aceitam somente nomes JSON seguros, e o frontend não recebe credenciais de GitHub nem chama a API do GitHub diretamente.

## 10. Assistência literária por IA

O módulo aceita focos de linguagem, gramática, classes gramaticais, léxico, narrativa, voz, estilo ou análise completa.

Regras de segurança e produto:

1. O envio ocorre somente depois de uma ação explícita do autor.
2. O trecho tem limite de 1 a 14.000 caracteres.
3. A resposta esperada é JSON estruturado com resumo, pontos fortes, sugestões, notas narrativas, modelo e modelos disponíveis.
4. Cada sugestão carrega categoria, severidade, texto original, proposta, explicação, confiança e offsets.
5. A aplicação valida novamente offsets e texto original antes de alterar o draft.
6. A análise nunca altera o manuscrito automaticamente.
7. Falhas HTTP, HTML recebido onde se esperava JSON, endpoint inválido, resposta vazia, timeout e contrato inválido retornam erro operacional claro.
8. OmniRoute é opcional; sem configuração, o fallback Manus permanece disponível.
9. Em produção, URL externa exige HTTPS; secrets ficam exclusivamente no servidor.
10. Não existe retry automático deliberado nem estimativa universal de custo de tokens.

O erro histórico `Unexpected token '<'` é tratado como resposta HTML inesperada, e não como JSON válido. O frontend deve mostrar a falha operacional sem esconder HTML recebido dentro de um objeto JSON falso.

## 11. Book Builder, Layout Engine e exportação

O conteúdo editorial é convertido para um contrato de exportação separado, evitando que a geração de um arquivo altere o livro persistido.

### Formatos

| Formato | Implementação atual |
|---|---|
| EPUB | JSZip, `mimetype`, `container.xml`, `content.opf`, `nav.xhtml`, capa e capítulos XHTML. |
| PDF | jsPDF, formatos A4/A5/6×9, sumário e paginação programática. |
| DOCX | Biblioteca `docx`, headings, margens, cabeçalho/rodapé e estilos. |
| HTML/ebook | HTML de impressão com CSS editorial, capa, front matter, TOC e capítulos. |
| TXT | Saída textual simples para conteúdo sem layout rico. |

### Presets tipográficos

Os presets atuais são `classic`, `modern`, `minimal`, `fantasy`, `sci-fi`, `romance`, `thriller`, `academic` e `children`. Eles controlam fonte web, fonte PDF, tamanho de corpo, espaçamento, peso de título, cor de destaque e margem base.

O layout também suporta:

- Formatos A4, A5 e 6×9.
- Margens estreita, normal e larga.
- Capitular opcional.
- Cabeçalho e rodapé.
- Regras de viúvas e órfãs no HTML de impressão.
- Capa personalizada por URL HTTPS ou upload protegido.
- Sumário editorial configurável; o EPUB mantém `nav.xhtml` para navegação estrutural.
- Front matter e back matter habilitáveis.

**Limite técnico a considerar:** EPUB e HTML possuem controle CSS mais expressivo que PDF/DOCX. A equivalência visual perfeita entre todos os formatos não deve ser presumida; cada exportador precisa de validação própria.

## 12. Assets e segurança de uploads

Capas e outras mídias não devem ser armazenadas em colunas binárias do banco. O fluxo correto é:

```text
arquivo → validação de nome/MIME/tamanho → KicomAV
       → clean → storage de objetos
       → metadados/referência no documento editorial
```

O upload de capa no router aceita JPEG, PNG e WebP, aplica limite de 8 MB, calcula SHA-256 durante a varredura e só chama `storagePut` quando o resultado é seguro.

### KicomAV

A integração atual contém:

- Worker Python por stdin/stdout.
- Código vendorizado em revisão fixada.
- Ambiente Python/YARA no `Dockerfile`.
- Contrato de estados `clean`, `infected`, `error`, `timeout` e `pending`.
- Timeout e limites no gateway server-side.
- Fail-closed para conteúdo não verificado.
- Registro de metadados de varredura.
- Sessões efêmeras armazenadas como hash.
- Painel do proprietário para listar, revogar e rotacionar credenciais.

Não se deve expor o daemon KicomAV ao navegador ou à internet. O worker precisa operar com filesystem temporário e sem acesso às credenciais do banco, ao repositório editorial ou a outros diretórios sensíveis.

Ainda requer validação no ambiente de produção: execução real do container, assinaturas atualizadas, detecção controlada, benchmark, comportamento com arquivos compactados abusivos, recuperação após timeout e teste autenticado com banco/storage reais.

## 13. Banco de dados e schema Drizzle

`drizzle/schema.ts` atualmente define:

| Tabela | Finalidade |
|---|---|
| `users` | Identidade OAuth Manus, nome, email, papel e timestamps. |
| `antivirus_sessions` | Hash de credencial, prefixo, fingerprint, base lógica, status e ciclo de vida. |
| `antivirus_scans` | Nome, SHA-256, resultado, malware, detalhe, engine e timestamp. |

O documento editorial completo permanece no repositório de documentos; o banco relacional atual apoia autenticação, auditoria e operação de segurança. A evolução recomendada é adicionar tabelas relacionais somente para consultas operacionais que realmente precisem de baixa latência, mantendo o documento editorial como fonte versionada e compatível.

Todos os timestamps de negócio devem ser armazenados em UTC e convertidos para o fuso local somente na apresentação.

## 14. Validação e testes

A política do projeto exige implementação, teste, inspeção, correção, regressão e documentação antes de declarar uma etapa concluída.

Camadas existentes:

| Camada | Cobertura |
|---|---|
| TypeScript | `pnpm check` com `tsc --noEmit`. |
| Domínio | IDs, migração semântica, split/merge, rich text, validação e persistência. |
| Backend | Auth, data access, sync, conflitos, IA, OmniRoute, antivírus, sessões e upload. |
| UI/DOM | WriterStudio, navegação, criação/reabertura, planejamento e aplicação manual de sugestões. |
| Dados | `pnpm validate:data` valida manifesto e JSONs. |
| Guardrail | `pnpm validate:repository` inspeciona código, schemas, dados, scripts e documentação. |
| Build | `pnpm build` gera frontend Vite e bundle Node. |
| QA | Fixtures isoladas para não usar livros reais em operações destrutivas. |

A validação visual e o teste autenticado no preview público dependem de sessão de usuário real. A ausência de login não deve ser descrita como aprovação de fluxo autenticado; deve ser registrada como limitação operacional.

## 15. Deploy e operação

Fluxo mínimo recomendado:

```bash
git clone https://github.com/Shaksperio/Shakstory.git
cd Shakstory
pnpm install
pnpm check
pnpm test
pnpm validate:data
pnpm build
NODE_ENV=production pnpm start
```

Secrets nunca devem ser gravados em `.env` versionado. Para GitHub, o servidor pode usar `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPOSITORY` e opcionalmente `GITHUB_BRANCH`. Para OAuth, configurar client ID/secret e callback no domínio publicado, mantendo o caminho:

```text
/api/github/oauth/callback
```

O servidor deve receber `PORT` pelo ambiente, usar HTTPS em produção e manter storage, banco, worker antivírus e repositório editorial em camadas com permissões mínimas.

## 16. Convenções para futuras alterações

1. Começar pela auditoria do requisito e do estado atual.
2. Atualizar `todo.md` antes da implementação.
3. Preservar dados do autor e IDs existentes.
4. Criar fixture QA isolada para fluxos destrutivos.
5. Manter dados editoriais fora do código.
6. Usar tRPC e contratos Zod, sem criar fetch/Axios paralelo para domínio existente.
7. Nunca colocar tokens, chaves, cookies ou bytes sensíveis no Git.
8. Não alterar o manuscrito por IA sem ação explícita.
9. Exibir erro claro quando API retorna HTML, timeout ou contrato inválido.
10. Antes de checkpoint: revisar `todo.md`, executar typecheck, testes, build, validação de dados, inspeção visual e verificar logs.
11. Publicar somente estado verificável, separando claramente teste automatizado, teste manual, limitação e feature ainda planejada.

## 17. Lacunas e próximos incrementos recomendados

| Prioridade | Trabalho |
|---|---|
| Alta | Atualizar README e auditorias antigas para refletir que KicomAV já possui integração inicial, sem declarar detecção real de produção antes da validação. |
| Alta | Executar fluxo autenticado real no preview com projeto QA: login, criar, editar, autosave, reload, reabrir, backup/restore e exportação. |
| Alta | Validar o container KicomAV com assinaturas e arquivos de teste controlados em ambiente de produção/CI. |
| Média | Implementar histórico visual de versões além dos snapshots locais e documentar restauração por versão. |
| Média | Tornar vínculos de cenas, objetivos e conflitos mais visíveis no Story Engine. |
| Média | Completar colaboração editorial com comentários, autoria, status e resolução. |
| Média | Validar visualmente cada formato exportado em leitores reais, não apenas a existência do arquivo. |
| Baixa | Refinar drag-and-drop de capas diretamente nos cards da Biblioteca. |
| Baixa | Expandir métricas de páginas e tempo de edição com cálculo baseado em layout efetivamente renderizado. |

## 18. Conclusão

A estrutura atual já representa um **estúdio de autor funcional**, não apenas um dashboard: há contratos semânticos, persistência com recuperação, planejamento editorial, editor estrutural, assistência IA controlada, preparação de publicação, exportação e uma primeira camada de segurança antivírus.

O ponto mais importante para a continuidade é manter a distinção entre:

- **implementado e testado automaticamente**;
- **implementado, mas dependente de validação autenticada/produção**;
- **documentado como arquitetura futura**;
- **ainda não implementado**.

Essa distinção evita regressões, preserva os dados do autor e impede que uma nova publicação seja declarada completa apenas porque o projeto compila.


## 19. Resultado da auditoria desta sessão

O arquivo foi criado com 443 linhas e 18 seções principais, e sua presença/integridade textual foi verificada.

| Verificação executada | Resultado |
|---|---|
| `pnpm check` | Aprovado. |
| `pnpm test` | 61 aprovados, 1 ignorado e 1 falhou em `server/github-token.credentials.test.ts` com HTTP 401. O teste depende de credencial/autorização GitHub operacional; nenhum segredo foi exposto. |
| `pnpm validate:data` | Aprovado: manifesto e JSONs editoriais válidos. |
| `pnpm validate:repository` | Bloqueado por referências detectadas em documentação preexistente (`README.md` e auditorias antigas). O novo relatório não contém os termos detectados pelo guardrail. |
| `pnpm build` | Aprovado: Vite e bundle Node produzidos. O build emitiu apenas aviso de chunks frontend maiores que 500 kB. |

Esses resultados são registrados para que o relatório não declare uma suíte totalmente verde quando há uma dependência externa sem autorização e um guardrail documental preexistente ainda pendente.
