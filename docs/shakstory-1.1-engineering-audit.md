# ShakStory 1.1 — Engineering Audit

**Data da auditoria:** 26 de agosto de 2026.  
**Estado:** diagnóstico executado sobre o repositório existente; nenhuma reconstrução desnecessária foi feita.

## Resumo executivo

O Shakstory é uma aplicação React 19 + Vite no cliente, Express + tRPC no servidor, autenticação Manus OAuth, Drizzle/MySQL para a base de identidade e um repositório editorial versionado em JSON/GitHub como fonte operacional principal. O núcleo atual já possui biblioteca, abertura de projetos, área Projeto, planejamento de personagens/locais/timeline, manuscrito opcional, autosave local, sincronização por SHA, estado de conflito, webhook GitHub e assistência literária estruturada.

A principal conclusão é que o projeto tem uma base funcional para evoluir incrementalmente, mas ainda não é um sistema editorial semântico completo. O conteúdo narrativo está concentrado em nós com texto, o banco relacional contém essencialmente a tabela de usuários e não há ainda engines independentes para layout, EPUB, PDF ou DOCX. O próximo trabalho deve preservar o repositório JSON/GitHub e introduzir contratos semânticos compatíveis, sem apagar dados existentes.

## Arquitetura atual

| Camada | Implementação observada | Estado |
|---|---|---|
| Interface | React 19, Vite, Tailwind 4, shadcn/Radix, Wouter | Funcional |
| Transporte | tRPC 11 sobre `/api/trpc` | Funcional |
| Servidor | Express 4, esbuild, TypeScript | Funcional |
| Identidade | Manus OAuth e procedimentos protegidos | Funcional |
| Persistência editorial | Repositório JSON versionado no GitHub, com fallback local/estado | Funcional, precisa de evolução semântica |
| Banco | Drizzle ORM + MySQL/TiDB; schema efetivo contém `users` | Básico |
| IA | Helper Manus LLM + adaptador OpenAI-compatible OmniRoute opcional | Funcional com fallback |
| Sincronização | SHA, webhook HMAC, estado de conflito e recuperação | Funcional |
| Assets | Helpers S3 disponíveis no template | Infraestrutura disponível; fluxo editorial ainda incompleto |
| Exportação | Sem engines EPUB, PDF ou DOCX implementadas | Pendente |
| QA | Vitest unitário, integração e DOM; build e typecheck | Funcional, deve crescer para contratos e E2E |

## Módulos existentes

O `WriterStudio` concentra a biblioteca e a navegação entre Projeto, Planejar, Manuscrito e Preparar. A área de planejamento contém personagens, locais e eventos de timeline. A área de preparação contém metadados editoriais e pré-visualização estrutural, mas não gera arquivos. A assistência literária recebe texto somente sob solicitação, devolve sugestões ancoradas por offsets e não altera o rascunho sem ação explícita.

No servidor, `routers.ts` expõe leitura e gravação editorial protegidas, procedimentos de assistência e estado de sincronização. `github-json-repository.ts` implementa a persistência versionada. `github-webhook.ts` valida HMAC-SHA256. `omniroute.ts` usa um contrato OpenAI-compatible com timeout e exige HTTPS em produção. Os guardrails `validate-data.mjs` e `validate-repository.mjs` verificam consistência e pureza editorial.

## Evidências executadas

A auditoria executou `pnpm check`, `pnpm test` e `pnpm build`. O resultado atual foi typecheck aprovado, build aprovado e **20 testes aprovados, 1 teste opcional ignorado**. O build produziu os artefatos de cliente e servidor, com apenas o aviso de chunk JavaScript acima de 500 kB. Os logs recentes não mostram erro de runtime persistente; as chamadas tRPC observadas retornaram `200` para autenticação, biblioteca e estado de sincronização. O endpoint de webhook publicado respondeu `401` sem assinatura, conforme esperado.

A inspeção visual confirmou a navegação de desenvolvimento nas quatro telas internas: Projeto, Planejar, Manuscrito e Preparar. A rota de harness é condicionada a `import.meta.env.DEV` e não deve ser usada como funcionalidade de produção.

## Lacunas e riscos

| Área | Achado | Severidade | Correção proposta |
|---|---|---:|---|
| Modelo semântico | Não há hierarquia formal Parts → Chapters → Scenes → Blocks | Alta | Adicionar tipos versionados compatíveis e migração não destrutiva |
| Editor | O manuscrito principal ainda usa textarea/nós simples | Alta | Introduzir cenas/blocos e comandos graduais, preservando texto bruto |
| Planejamento | Personagens, locais e timeline existem; relações com cenas ainda são fracas | Média | IDs relacionais e testes de renomeação/movimentação |
| Book Builder | Preparação tem metadados, mas não possui templates de livro | Alta | Criar configuração de front matter, estilos e publicação |
| Layout | Não há engine de estilos/paginação | Alta | Separar conteúdo de layout e criar pré-visualização verificável |
| Exportação | EPUB, PDF e DOCX ainda não existem | Alta | Implementar cada formato com geração, abertura/validação e reparo |
| IA | Análise estruturada existe; retry, cancelamento e custos ainda não estão completos | Média | Testar timeouts, respostas vazias, concorrência e limites |
| Persistência | JSON/GitHub é fonte principal, mas o schema relacional é mínimo | Média | Evoluir contratos JSON antes de criar tabelas derivadas |
| Performance | Bundle principal ultrapassa 500 kB minificado | Baixa | Code splitting por área e lazy loading de engines |
| QA | Não há estresse de 100 capítulos/centenas de milhares de palavras | Média | Criar fixture técnica não editorial e teste de performance |
| Segurança | Segredos estão server-side; ativação remota OmniRoute depende de endpoint real | Média | Manter HTTPS, timeout, redaction e secrets sem versionamento |

## Fila interna de correções

A ordem recomendada é: consolidar contratos semânticos sem quebrar JSON atual; automatizar o ciclo de projeto e persistência; evoluir cenas/blocos; fortalecer relações do Story Engine; completar o AI Engine; criar Book Builder e Layout Engine; implementar exportações independentes; fechar Validation Engine e estresse; executar regressão e publicar somente com evidência de build, testes, segurança e smoke test.

## Critérios de segurança e autonomia

Problemas técnicos detectáveis por typecheck, testes, logs, inspeção, build ou validação visual devem ser corrigidos autonomamente. Decisões de conteúdo autoral, interpretação literária e alterações irreversíveis em dados de produção continuam sob controle do autor. A IA deve sempre seguir o fluxo texto original → proposta → diff/offset → aplicação explícita → snapshot ou possibilidade de recuperação.

## Referências do protocolo

O plano mestre anexado pelo proprietário define as engines Writing, Story, Book, Layout, EPUB, PDF, DOCX, AI, Project, Asset, Version e Validation, além do ciclo obrigatório `PLANNED → IMPLEMENTING → TESTING → VALIDATED → RELEASED`. Este audit é o estado inicial para executar esse protocolo incrementalmente, sem considerar uma etapa concluída apenas porque o código foi escrito.
