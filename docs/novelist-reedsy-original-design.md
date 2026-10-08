# Referências Novelist e Reedsy — implementação original no Shakstory

Análise em 07/10/2026. Fontes oficiais: https://www.novelist.app/, https://play.google.com/store/apps/details?id=it.returntrue.novelist e https://reedsy.com/studio/. Referência técnica adicional: HTML enviado pelo autor no arquivo “Markdown(1).md colado”. Nenhum código, asset, marca ou componente do concorrente foi incorporado ao projeto.

## Novelist: comparação funcional

O site apresenta elementos narrativos, cenas, organização do livro e metas como etapas distintas. A descrição atual do desenvolvedor acrescenta projetos com vários livros, referências durante a escrita, progresso diário, templates, histórico e backup.

| Capacidade | Shakstory nesta entrega |
| --- | --- |
| Planejar personagens, lugares, eventos e cenas | CRUD existente; cenas agora vinculam objetivos, conflitos e capítulos por ID. Renomeações aparecem na referência. |
| Organizar o manuscrito | Partes/capítulos/cenas, reordenação e split/merge já existentes. Não se troca a identidade dos registros pela posição. |
| Referências durante a escrita | Contexto lateral existente ampliado com cenas vinculadas ao capítulo ativo. |
| Metas e progresso | Metas e prazo existentes; participação por capítulo e sete dias recentes de variação de palavras adicionados. Retenção de até 90 dias de atividade salva. |
| Backup e restauração | JSON portátil do livro, validação do projeto de destino, prévia e confirmação; snapshot da cópia atual obrigatório antes da restauração. |
| Templates | Fichas predefinidas e templates pessoais de formulário reutilizáveis entre livros no mesmo dispositivo. Colunas dos quadros podem ser renomeadas. |
| Histórico, comentários e exportações | Recursos existentes de revisão/versões e EPUB/PDF/DOCX/HTML/TXT preservados. |

Não há paridade integral: elementos e cenas compartilhados entre livros, menções interativas no texto, tipos/status totalmente configuráveis, integração direta Google Drive e exportação ODT não foram implementados nesta entrega. ODT continua disponível apenas para importação. Templates pessoais ficam no dispositivo; planejamento do livro segue no D1.

## Reedsy: o que o anexo permite afirmar

O arquivo fornecido é a página de inicialização. O corpo contém apenas o ponto de montagem; o comportamento do editor está em bundles externos. As tentativas de consultar dois bundles apontados no anexo não forneceram conteúdo acessível. Portanto, não foi auditada a implementação completa do editor.

| Evidência no HTML fornecido | Conclusão limitada |
| --- | --- |
| Scripts de módulo, assets com hash e evento `vite:preloadError` | Carregamento modular e integração com o mecanismo de preload do Vite. |
| Arquivos nomeados `vue_export-helper`, `client-shared-vue`, `book-editor-vue` | Forte indicação de componentes Vue; versão e configuração não verificadas. |
| Arquivos nomeados `utils.io-ts` e `inversify.config` | Indício de validação tipada e injeção de dependências; apenas o nome não comprova o uso interno. |
| Arquivo nomeado `text-sanitizer` | Módulo relacionado a sanitização; não permite avaliar cobertura ou segurança. |
| Classes de tema e assets CSS separados | Tema e apresentação separados do ponto de montagem. |
| Manifest e ícones móveis | Preparação para acesso móvel/atalho; não comprova funcionamento offline. |
| Tratador inicial de erros e recarga no erro de preload | Recuperação de carregamento prevista; a recarga automática não prova preservação do rascunho. |

O anexo não identifica banco, APIs privadas, protocolo de colaboração, modelo documental interno, motor de texto, algoritmo de exportação ou garantias de autosave. Não há base para afirmar ProseMirror, Tiptap ou tecnologias de backend.

## Escolhas originais do Shakstory

Manter React/TypeScript, contratos compartilhados e Zod em vez de trocar stack por semelhança com a referência. O manuscrito continua separado de layout, referência narrativa e exportação. ID é a identidade; números e posições são derivados.

Falhas de módulos carregados depois da inicialização passam a exibir um aviso recuperável. Não há recarga automática. O autor pode continuar escrevendo, baixar a biblioteca local com os rascunhos mais recentes ou recarregar explicitamente. O arquivo de recuperação pode ser aberto no painel de backup do projeto correspondente. Isso não substitui a cópia IndexedDB nem garante resgate quando o bundle inicial nem chega a executar.

O HTML do Shakstory usa português, permite zoom e inclui manifest/ícone próprios. Não foi adicionado service worker, e não se declara suporte offline integral ou aplicativo nativo.

## Critérios de validação e limites

Verificação local: 123 testes passaram; três testes opcionais de credenciais foram ignorados. TypeScript, build de frontend/backend, validadores do repositório e `git diff --check` passaram. Após reforçar o schema de publicação, os sete testes de backup/projeto e TypeScript passaram novamente. O engine KicomAV real passou oito casos locais; a execução em container no CI é uma verificação adicional.

- Restauração mantém texto, marcas e IDs; recusa outro livro, IDs duplicados e estrutura inválida.
- Falha ao guardar a cópia atual interrompe a restauração.
- Referências ausentes conservam o texto anterior e aparecem como indisponíveis no Story Engine.
- Atividade diária mede diferenças na contagem de palavras de rascunhos salvos; não mede teclas, qualidade ou produtividade histórica anterior à atualização.
- Backup inclui dados embutidos, mas URLs de imagens externas continuam dependendo da origem.
- Testes DOM usam projetos QA isolados. Não equivalem a login OAuth real, acesso compartilhado entre usuários ou validação em Word/e-readers nativos.
