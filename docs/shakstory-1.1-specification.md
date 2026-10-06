# ShakStory 1.1 — Especificação executável

## Princípio de execução

Uma etapa só é considerada concluída depois de implementação, execução, testes, inspeção, correção, regressão e documentação. O usuário define visão, conteúdo e decisões irreversíveis; o sistema assume a responsabilidade por diagnóstico técnico, QA automatizado e correção de defeitos detectáveis.

## Engines do produto

| Engine | Responsabilidade | Primeiro incremento |
|---|---|---|
| Writing Engine | Escrita e revisão manual | Manuscrito opcional, autosave e recuperação |
| Story Engine | Partes, capítulos, cenas, personagens, locais, eventos, cronologia e relações | Planejamento já existente; relações e cenas semânticas na próxima camada |
| Book Engine | Livro como publicação | Metadados, front matter, partes e preferências de publicação |
| Layout Engine | Estilos, templates, margens e paginação | Tokens de estilo e pré-visualização estrutural |
| EPUB Engine | Livro digital refluível | Geração e validação em etapa própria |
| PDF Engine | Livro paginado | Renderização e inspeção em etapa própria |
| DOCX Engine | Documento editável | Geração e abertura/validação em etapa própria |
| AI Engine | Assessoria literária | Sugestões estruturadas, offsets, explicações e aplicação explícita |
| Project Engine | Projetos, metas, status e próximos passos | Área Projeto persistida no documento versionado |
| Asset Engine | Capas, imagens, mapas e arquivos | Metadados S3 antes de edição binária |
| Version Engine | SHA, snapshots, histórico e restauração | Controle de concorrência existente |
| Validation Engine | Verificação integral antes de release | Scripts, typecheck, testes, build e smoke test |

## Contrato semântico do livro

O livro será representado como documento versionado e compatível com versões anteriores:

```text
Book
 ├── metadata
 ├── frontMatter
 ├── parts
 │    └── chapters
 │          └── scenes
 │                └── blocks
 ├── characters
 ├── locations
 ├── events
 ├── timeline
 ├── notes
 ├── assets
 ├── styles
 ├── layout
 └── publishing
```

Durante a migração, nós legados continuam legíveis. Cada nó legado pode ser convertido progressivamente em capítulo/cena/bloco, sem apagar o texto original. O JSON/GitHub permanece a fonte principal; estruturas locais e banco relacional são índices ou fallback, não substitutos silenciosos.

## Critérios de aceitação

| Área | Aceite mínimo |
|---|---|
| Projeto | Criar, abrir, salvar, fechar e reabrir sem perda de dados; status, meta e próximos passos persistem |
| Estrutura | Capítulo, cena e bloco possuem IDs estáveis; relações não dependem de posição textual |
| Escrita | Manuscrito pode ser aberto explicitamente; autosave, recuperação e conflito não sobrescrevem silenciosamente |
| Planejamento | Personagens, locais, eventos, objetivos, conflitos, relações e notas podem referenciar unidades narrativas |
| IA | Texto só é enviado sob ação; resposta inválida, timeout e falha do provider são tratados; aplicação é manual e recuperável |
| Book Builder | Conteúdo semântico permanece separado de layout, estilos e preferências de publicação |
| Layout | Templates e estilos não alteram o conteúdo semântico; preview revela estrutura antes da exportação |
| Exportação | Cada formato é gerado, aberto/validado, inspecionado e reparado antes de ser considerado pronto |
| QA | Typecheck, unitários, integração, DOM/E2E, persistência, regressão, segurança e performance passam |
| Release | Checkpoint, build de produção e smoke test publicado passam; falha crítica exige rollback |

## Níveis de decisão

Defeitos técnicos, regressões, incompatibilidades, erros de API e problemas de performance devem ser corrigidos sem interromper o autor. Escolhas de produto ambíguas e decisões de conteúdo literário devem ser apresentadas como opções. Operações destrutivas, migrações irreversíveis e alterações de credenciais exigem autorização explícita.

## Ordem de execução

A execução seguirá os estados `PLANNED → IMPLEMENTING → TESTING → VALIDATED → RELEASED`. A ordem técnica será: auditoria; contrato semântico compatível; núcleo de projetos e persistência; editor estrutural; Story Engine; AI Engine; Book Builder; Layout Engine; exportações; Validation Engine; regressão e release.

## Não objetivos silenciosos

A versão 1.1 não copiará código proprietário de Novelist, Kindle Create ou Atticus. Também não fará a IA coautora silenciosa: qualquer sugestão literária continuará sendo uma proposta explicada, nunca uma alteração automática do texto do autor.
