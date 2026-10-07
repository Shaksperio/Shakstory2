
- [x] Analisar o segundo anexo e separar sua estrutura reutilizável dos exemplos de orçamento de pintura.
- [x] Documentar a arquitetura do Shakstory com frontend, backend, repositório de dados e versionamento no GitHub.
- [x] Criar contratos JSON e schemas versionáveis específicos para livros, manuscritos, nós narrativos, planejamento, metas, timeline, versões e ativos visuais.
- [x] Criar manifesto da base e exemplos de dados editoriais sem dados fictícios de clientes, avaliações ou depoimentos.
- [x] Isolar o acesso a dados atrás de uma camada de repositório, sem o frontend conversar diretamente com o GitHub.
- [x] Preparar o adaptador de persistência versionada e o controle de concorrência por versão/SHA.
- [x] Atualizar README, variáveis de ambiente, instruções de instalação, validação, backup, restauração e deploy para o Shakstory.
- [x] Validar que nenhum arquivo, dado ou nomenclatura de orçamento de pintura foi incorporado ao editor.
- [x] Verificar a integração final com o repositório GitHub privado sem expor tokens, credenciais ou secrets.
- [x] Corrigir o validador de dados para ignorar diretórios ao percorrer o manifesto e os arquivos JSON.
- [x] Criar exemplos mínimos de dados editoriais válidos em `data/` compatíveis com os schemas.
- [x] Conectar a camada de repositórios aos serviços reais do app sem expor o GitHub ao frontend.
- [x] Adicionar documentação explícita de deploy e restore em ambiente limpo; secrets permanecem no gerenciador seguro e não são versionados.
- [x] Expandir a validação anti-domínio para código, documentação e nomes de arquivos, removendo referências remanescentes ao domínio de pintura.
- [x] Implementar GitHub OAuth com início de autorização, callback publicado e proteção contra CSRF/state.
- [x] Adicionar secrets do GitHub OAuth e documentar a configuração no GitHub.
- [x] Testar o fluxo OAuth sem expor client secret, access token ou dados de sessão; token Fine-grained validado via API GitHub.
- [x] Conectar getEditorialRepository() a uma leitura e gravação efetivas de documentos editoriais.
- [x] Publicar e validar no domínio permanente que `/api/github/oauth/start` redireciona ao GitHub.
- [x] Adicionar teste de integração OAuth com mocks para callback, token e identidade GitHub.
- [x] Corrigir o validador abrangente para não tentar ler diretórios como arquivos.
- [x] Expandir o validador do repositório para scripts, package e demais arquivos relevantes, documentando exceções estritamente necessárias.
- [x] Remover ou justificar formalmente referências técnicas restantes sem mascará-las por exclusão do verificador.
- [x] Validar os próprios scripts de verificação com allowlist linha a linha, sem ignorar arquivos inteiros.
- [x] Documentar formalmente as linhas técnicas permitidas nos guardrails de validação.
- [x] Preparar a ficha de configuração do GitHub App com URLs, permissões mínimas e eventos desativados por padrão.
- [x] Diferenciar no projeto o fluxo de instalação do GitHub App do fluxo OAuth App já implementado.
- [x] Adicionar secrets separados para App ID, App name, owner, repository, Client ID, Client Secret e Private Key do GitHub App.
- [x] Separar e documentar os dados do GitHub App sem misturá-los com GITHUB_OAUTH_CLIENT_ID e GITHUB_OAUTH_CLIENT_SECRET; a validação operacional permanece opcional e desativada.
- [x] Tornar o token Fine-grained GITHUB_TOKEN o mecanismo operacional principal de sincronização.
- [x] Documentar a Private Key do GitHub App como configuração opcional não utilizada no fluxo atual.
- [x] Remover o teste obrigatório da Private Key do GitHub App da suíte padrão e manter apenas a validação do token ativo.
- [x] Remover da operação ativa a dependência de configuração inválida do GitHub App, mantendo-a opcional.
- [x] Implementar sincronização editorial explícita usando o token Fine-grained e controle de SHA.
- [x] Criar registro de conflitos no estado do backend e ações de recuperação visíveis, sem sobrescrita silenciosa.
- [x] Implementar endpoint de webhook GitHub com validação de assinatura e eventos mínimos.
- [x] Exibir status de sincronização, conflitos e recuperação no editor.
- [x] Adicionar testes de webhook, sincronização e conflito e publicar a evolução.
- [x] Ajustar o guardrail anti-domínio para não bloquear termos técnicos legítimos do webhook, preservando a inspeção do arquivo inteiro.
- [x] Publicar um checkpoint após webhook, sync-state, WriterStudio e documentação atualizados.
- [x] Verificar no domínio publicado o webhook e os estados de sincronização/conflito da interface (POST sem assinatura respondeu 401; estados também cobertos pelos testes integrados).
- [x] Pesquisar o repositório OmniRoute e mapear sua forma de expor modelos, autenticação e compatibilidade.
- [x] Definir categorias de análise literária, formato estruturado de sugestões e política de privacidade do manuscrito.
- [x] Configurar a integração do OmniRoute ou um endpoint OpenAI-compatible exclusivamente no backend (adaptador opcional por `OMNIROUTE_BASE_URL`/`OMNIROUTE_API_KEY`, com fallback Manus quando ausente).
- [x] Implementar análise de ortografia, gramática, classes gramaticais, sinônimos, narrativa, tom e estilo.
- [x] Criar painel de assistência no editor com explicações e aplicação manual de sugestões.
- [x] Adicionar testes para contrato estruturado, falhas de modelo e proteção contra alteração automática do manuscrito.
- [x] Conectar o resultado da mutation ao painel e limpar análises obsoletas ao trocar de nó ou rascunho.
- [x] Associar posição/ocorrência às sugestões e aplicar alterações manuais no trecho correto.
- [x] Testar falhas do catálogo/LLM e garantir que o manuscrito não muda sem ação explícita.
- [x] Limpar o resultado da assistência também ao trocar de capítulo ou livro.
- [x] Adicionar teste de falha do catálogo/LLM e teste explícito de que a análise não altera o rascunho até a aplicação manual.
- [x] Cobrir falha do endpoint LLM (`invokeLLM`) e sua propagação pela procedure de assistência.
- [x] Criar teste do fluxo do WriterStudio que prove análise sem alteração automática e aplicação somente por ação explícita.
- [x] Testar `literaryAssist.analyze` via `appRouter.createCaller` e verificar o erro `BAD_GATEWAY`.
- [x] Testar o WriterStudio real: análise não altera o draft e Aplicar sugestão altera somente o offset confirmado.
- [x] Adicionar teste de UI que renderize o WriterStudio/assistente, dispare análise e clique em Aplicar sugestão.
- [x] Garantir que testes `.tsx` do cliente sejam descobertos pelo Vitest e passem na suíte padrão.
- [x] Completar o teste DOM com clique em Analisar trecho, resposta simulada e depois Aplicar sugestão.
- [x] Mockar a mutation tRPC no teste de UI para comprovar que a análise recebida não altera o draft.
- [x] Adicionar teste integrado do WriterStudio com mock explícito de `trpc.literaryAssist.analyze.useMutation` e validar que `data` não altera o draft automaticamente.
- [x] Documentar separadamente que os estados autenticados de sincronização/conflito não puderam ser forçados no domínio publicado sem uma sessão de usuário e um conflito real; manter a validação automatizada como cobertura disponível.
- [x] Auditar a implantação atual após o timeout e recuperar uma publicação estável.
- [x] Preparar a ativação externa do OmniRoute somente com URL HTTPS pública e chave configuradas como secrets server-side; sem esses valores, manter o fallback Manus e documentar o bloqueio.
- [x] Criar entidades editoriais de personagens, locais e timeline no WriterStudio, persistidas na fonte versionada existente.
- [x] Adicionar testes de personagens, locais, timeline e estados de sincronização.
- [x] Retirar a validação de conflito com edição de capítulo do fluxo principal; documentar que conflitos continuam protegidos pelo SHA e que o teste manual é opcional para a sincronização avançada.
- [x] Validar no backend que `OMNIROUTE_BASE_URL` use HTTPS em produção e cobrir URL insegura em teste.
- [x] Documentar separadamente que o adaptador OmniRoute está pronto, mas a ativação externa real depende de endpoint público e chave no gerenciador seguro.
- [x] Reorientar o produto para planejamento, organização e preparação editorial, sem exigir edição direta de capítulo.
- [x] Analisar Novelist, Kindle Create e Atticus como referências de estrutura, organização e exportação editorial, documentando limitações de acesso quando aplicável.
- [x] Redesenhar a navegação do WriterStudio com projeto, planejamento, manuscrito opcional e preparação/publicação.
- [x] Ajustar entidades e textos da interface para refletir o novo fluxo, preservando personagens, locais e timeline.
- [x] Adicionar testes da nova navegação e executar validação visual e de regressões.
- [x] Criar uma área Projeto separada de Planejar para resumo, status, meta e próximos passos do livro.
- [x] Criar uma área Preparar com metadados editoriais e pré-visualização estrutural, sem prometer exportação ainda não implementada.
- [x] Documentar explicitamente que o Atticus ficou bloqueado pelo captcha e que não foram inferidas funcionalidades não verificadas.
- [x] Adicionar testes e validação visual da navegação Biblioteca → Projeto → Planejar/Manuscrito → Preparar.
- [x] Exibir na área Projeto o status, a meta de palavras e próximos passos explícitos do livro.
- [x] Persistir próximos passos do projeto no documento editorial sem editar capítulos.
- [x] Cobrir em teste a sequência Biblioteca → Projeto → Planejar → Manuscrito → Preparar.
- [x] Capturar e registrar evidência visual da navegação interna autenticada/mockada.

# ShakStory 1.1 — Plano mestre

- [x] Fase 0: produzir auditoria de engenharia do estado atual e fila de correções.
- [x] Fase 1: formalizar Writing, Story, Book, Layout, EPUB, PDF, DOCX, AI, Project, Asset, Version e Validation Engines.
- [x] Fase 2: consolidar o modelo semântico Book → Parts → Chapters → Scenes → Blocks.
- [x] Fase 3: automatizar abrir, criar, salvar, fechar, reabrir, autosave e recuperação do projeto.
- [x] Fase 4: evoluir o editor além de textarea, com estrutura semântica e testes de interação.
- [x] Fase 5: ampliar planejamento narrativo com cenas, eventos, objetivos, conflitos, relações e notas.
- [x] Fase 6: auditar prompts, contexto, limites, erros, timeout, retry, cancelamento, concorrência, custos e snapshots da IA.
- [x] Fase 7: criar Book Builder com conteúdo separado de layout.
- [x] Fase 8: criar Layout Engine com estilos, templates e pré-visualização.
- [x] Fase 9: implementar exportações EPUB, PDF e DOCX quando compatíveis com o ambiente.
- [x] Fase 10: consolidar assets, versionamento, segurança e Validation Engine.
- [x] Fase 11: executar regressão, inspeção visual, auditoria final e publicação.
- [x] Persistir `semanticBook` no documento versionado, mantendo `nodes` legados para compatibilidade.
- [x] Atualizar schemas/contratos compartilhados para oficializar `parts`, `chapters`, `scenes` e `blocks`.
- [x] Testar salvamento e reabertura preservando a estrutura semântica completa.
- [x] Testar no WriterStudio real criar → abrir → editar → autosave → voltar à biblioteca → reabrir → recuperar conteúdo e nó ativo.
- [x] Implementar ação explícita de fechar projeto e reidratação após reload/reabertura.
- [x] Substituir o textarea principal por uma UI estrutural de cenas e blocos, mantendo textarea apenas como fallback explícito.
- [x] Testar interação real entre capítulos, cenas, blocos e persistência semântica.
- [x] Adicionar teste integrado que crie um livro na interface antes de abrir, editar, autosalvar, fechar e reabrir.
- [x] Persistir e restaurar explicitamente projeto e nó ativos após remount/reload, com teste do WriterStudio.
- [x] Ligar o editor estrutural ao `semanticBook` como fonte de verdade, com cenas e blocos editáveis.
- [x] Testar UI de criar/mover/remover capítulos, navegar entre cenas, editar blocos e confirmar persistência semântica após reabrir.
- [x] Implementar criação, edição e remoção de relações narrativas entre entidades do projeto.
- [x] Adicionar módulo explícito de planejamento de cenas vinculado ao modelo semântico.
- [x] Cobrir objetivos, conflitos, notas, relações e cenas em testes DOM com persistência.
- [x] Implementar um contrato de exportação separado do documento editorial.
- [x] Gerar EPUB válido com manifesto, navegação e capítulos sem mutar o projeto.
- [x] Gerar DOCX e PDF/HTML de impressão com estilos editoriais selecionáveis.
- [x] Adicionar controles de estilo e exportação na área Preparar, com estados de erro e sucesso.
- [x] Implementar Layout Engine com templates nomeados, estilos consistentes e pré-visualização fiel.
- [x] Criar exportação PDF real ou documentar a limitação técnica explicitamente no produto.
- [x] Permitir editar relações narrativas existentes.
- [x] Vincular cenas planejadas ao `semanticBook` e ao editor estrutural.
- [x] Ampliar testes DOM para notas, relações, cenas e persistência completa.
- [x] Adicionar loading/success/error robustos para EPUB, DOCX, HTML e impressão.
- [x] Integrar cenas planejadas ao editor estrutural, exibindo e consumindo `semanticBook.plannedScenes` no fluxo real de edição/navegação.
- [x] Adicionar teste integrado que salve/reabra o projeto e comprove persistência de notas, relações e cenas no documento versionado/`semanticBook`.
- [x] Completar estados robustos de exportação para HTML e impressão, com loading, sucesso, erro e prevenção de ações concorrentes em todos os botões.

- [x] Revalidar os gaps de revisão antes do próximo checkpoint.



# ShakStory — Evolução de publicação e editor

- [x] Auditar e corrigir o erro `Unexpected token '<'` quando a aplicação espera JSON.
- [x] Adicionar capa personalizada ao modelo editorial e às opções de exportação.
- [x] Adicionar seleção de imagem de capa por URL HTTPS com preview, persistência editorial e fallback seguro.
- [x] Adicionar sumário editorial configurável e incluí-lo em EPUB, PDF, DOCX e HTML; o EPUB mantém `nav.xhtml` obrigatório para navegação, enquanto a opção controla o sumário editorial visível nos demais formatos.
- [x] Adicionar presets tipográficos Classic, Modern, Minimal, Fantasy, Sci-Fi, Romance, Thriller, Academic e Children.
- [x] Fazer os presets tipográficos controlarem fonte, escala, espaçamento, margens e títulos nos exportadores, com margens específicas por preset.
- [x] Alinhar a experiência do editor à combinação Novelist, Kindle Create e Atticus: planejamento semântico, escrita estrutural, preparação visual e publicação.
- [x] Adicionar testes unitários para capa, sumário, presets e resposta de API; a cobertura UI existente valida o fluxo editorial e a persistência, enquanto a prévia foi inspecionada em desktop/mobile.
- [x] Executar typecheck, suíte completa, build e inspeção visual antes de publicar.

# ShakStory 1.1 — Reconstrução profissional orientada pelo plano do autor

- [x] Auditar o erro real da IA no fluxo seleção → frontend → tRPC → provider → resposta, incluindo URL, status, content-type e autenticação.
- [x] Corrigir a análise de IA para retornar resposta estruturada ou erro operacional claro, sem mascarar falhas com fallback HTML.
- [x] Auditar a persistência atual e separar dados do autor do ciclo de atualização do código.
- [x] Garantir autosave local imediato, recuperação após reload/fechamento e backup/sincronização sem zerar manuscritos.
- [x] Garantir UUID/hash estável para livros, capítulos, cenas, personagens, locais, notas e versões; novas notas mantêm `noteIds` separados, o documento possui `versionId` e os demais registros usam `stableId`, com round-trip QA das entidades reais.
- [x] Tornar capítulos entidades editáveis, com título, conteúdo, inserção, exclusão, duplicação, reordenação e partes.
- [x] Remover dependência de números fixos como identidade dos capítulos e suportar numeração automática derivada da ordem.
- [x] Implementar editor rico de manuscrito com rich text sanitizado persistente, preservando marks, links e imagens, além de localizar/substituir, desfazer/refazer e contagem; o fluxo integrado reabre bold, link e imagem.
- [x] Implementar modo sem distração real para escrita.
- [x] Implementar tema clássico e tema escuro coerentes com o produto de referência.
- [x] Integrar metadados completos: capa, ISBN, data de publicação, autor, categoria/gênero, descrição e identificador do livro.
- [x] Alinhar Biblioteca, Manuscrito, Organização, IA, Diagramação e Exportação à experiência combinada das referências, sem copiar elementos proprietários; navegação e shell foram auditados em desktop/mobile.
- [x] Adicionar testes de recuperação após reload/backup local, edição de capítulos, numeração e IDs estáveis, rich text sanitizado, IA e modos de aparência; a integração cobre salvar, sair, reabrir e rich text.
- [x] Executar QA autônomo com logs, testes, build e inspeção visual antes de qualquer checkpoint.
- [x] Manter a regra de não declarar como validado nenhum fluxo ainda simulado; a autenticação manual pendente permanece explicitamente documentada.
- [x] Persistir o Protocolo Shakstory 1.1 nas instruções duráveis do projeto para orientar futuras atualizações.
- [x] Tentar reconstruir e validar o fluxo completo no preview aberto conforme o protocolo persistido; a execução autenticada foi bloqueada pela tela de login e permanece não aprovada.

## Gaps obrigatórios identificados na auditoria final

- [x] Implementar modelo persistente real para rich text, com marks/HTML sanitizado e round-trip de negrito, itálico, link e imagem.
- [x] Implementar e testar numeração automática derivada da ordem de capítulos e partes, sem usar números como identidade.
- [x] Ampliar testes de IDs estáveis para cenas, notas e registros de versão, além de livros e capítulos, incluindo persistência QA de personagens, locais, cenas e notas.
- [x] Executar e registrar teste de recovery/remount/reload do workspace reconstruído, incluindo manuscrito ativo e backup local.
- [x] Continuar o redesign funcional da Biblioteca, Manuscrito e Preparar até haver evidência verificável de alinhamento premium com as referências; evidência visual desktop/mobile registrada.
- [x] Corrigir marcações anteriores do TODO que excederam a evidência disponível.

## Correções obrigatórias da segunda auditoria

- [x] Persistir rich text end-to-end no `semanticBook`/fonte de verdade e cobrir round-trip real de bold, italic, link e imagem.
- [x] Separar título autoral da numeração apresentada; parar de gravar `Capítulo N` como título padrão e testar numeração derivada após reorder.
- [x] Cobrir estabilidade de IDs também para registros de versão e reabertura/persistência de cenas, notas, personagens e locais.
- [x] Adicionar teste integrado confiável de reload/remount do workspace com livro/nó ativo, backup local e rich text restaurado.
- [x] Continuar o redesign funcional até haver evidência verificável de alinhamento premium com as referências.
- [x] Tornar a hidratação do documento idempotente por SHA para evitar loops e travamentos do editor durante reload e testes.
- [x] Validar typecheck, suíte completa (45 testes passando, 1 opcional ignorado) e build de produção após as correções.
- [x] Tentar executar o fluxo autenticado real no preview com um projeto QA isolado; a sessão permaneceu na tela de login, portanto nenhum livro real foi acessado ou alterado.

## Gaps da auditoria de release — não publicar como concluído

- [x] Adicionar teste integrado de reload/remount com backup local, livro e nó ativo, verificando rich text restaurado.
- [x] Cobrir persistência real de bold, link e imagem no editor, no `semanticBook` e na reabertura.
- [x] Criar testes de persistência para personagens, locais, cenas, notas e `versionId` em documentos QA reais.
- [x] Ajustar a documentação para distinguir `versionId` do documento de snapshots/histórico de versões; snapshots históricos permanecem explicitamente fora do escopo.
- [x] Não marcar como concluídos recursos cuja evidência atual seja apenas unicidade de strings ou teste unitário isolado.

## Gaps finais de evidência antes do próximo checkpoint

- [x] Adicionar teste integrado de reload/remount do WriterStudio com backup local, livro/nó ativo e rich text restaurado.
- [x] Criar prova end-to-end de rich text a partir do `semanticBook`, incluindo italic, e confirmar a fonte efetiva na reabertura.
- [x] Definir/documentar que `versionId` representa apenas a versão corrente do documento; snapshots históricos reais permanecem fora do escopo.
- [x] Cobrir criação pela UI de personagens, locais, cenas e notas seguida de atualização/reabertura do estado com IDs preservados; PlanningView e StoryEnginePanel usam harnesses QA isolados.
- [x] Adicionar testes explícitos para desfazer/refazer e contagem do editor rico.


## Solicitação 2026-08-27 — biblioteca, navegação e CRUD editorial

- [x] Reestruturar o menu como navegação contextual retrátil/drawer, sem ocupar a área útil do editor.
- [x] Exibir na Biblioteca os últimos livros com nome/título, autor, ISBN, status editorial, páginas, capítulos, caracteres e tempo de edição.
- [x] Implementar ações da Biblioteca: editar livro, continuar de onde parou, resetar história com confirmação explícita, excluir com confirmação explícita e exportar em PDF, EPUB, DOCX, TXT e formatos compatíveis.
- [x] Implementar CRUD completo de livros com edição de metadados, status planejamento/rascunho/em edição/revisão/concluído e preservação de UUID.
- [x] Implementar CRUD completo de personagens, locais, eventos, cenas, notas e relações, com editar, excluir, status e IDs estáveis.
- [x] Cobrir persistência/reabertura dos CRUDs e métricas derivadas com testes QA isolados, sem usar livros reais.
- [x] Validar desktop/mobile, teclado, foco, diálogos destrutivos, console, rede, servidor e build antes do checkpoint; o fluxo autenticado do preview permanece explicitamente bloqueado pela ausência de login manual.


## Etapa futura — proteção antivírus com KicomAV

- [x] Auditar e fixar para avaliação a revisão KicomAV `bad9493`, licença MIT, dependências Python/YARA e política de atualização de assinaturas; ativação produtiva ainda depende da etapa de implementação.
- [x] Definir arquitetura isolada do scanner em worker/serviço separado, sem executar arquivos enviados no processo Node nem expor daemon diretamente à internet.
- [x] Implementar varredura de uploads antes de persistir/servir arquivos, com limite de 8 MB, timeout de 20 s, tipos MIME permitidos, nome sem caminho e worker KicomAV que trata arquivos compactados; hardening de archive bomb permanece limitado pelo engine/limite.
- [x] Implementar estados clean/infected/error/timeout/pending, registro de metadados de quarentena e fail-closed sem armazenar conteúdo malicioso no banco; quarentena física de bytes permanece desativada por desenho.
- [x] Integrar Shakstory e KicomAV por processo worker local server-side, sem rede externa nem credencial no frontend.
- [x] Criar trilha inicial de auditoria por metadados e política fail-closed para arquivos não verificados, sem bloquear o autosave textual seguro; alertas e métricas avançadas permanecem pendentes.
- [x] Cobrir testes com worker QA controlado para clean, infected, erro, JSON inválido e limite excedido; timeout/archive bomb com engine real permanecem pendentes de execução no container.
- [x] Executar análise estática de dependências/licença e validação de recuperação do worker; benchmark completo de custo/latência e ativação produtiva dependem do primeiro build no ambiente de publicação.


## Implementação aprovada — gateway privado KicomAV

- [x] Criar contrato server-side `clean/infected/error/timeout/pending` para o worker local KicomAV, com timeout e limite de resposta; não há cliente HTTP externo.
- [x] Remover a exigência de secrets externos `KICOMAV_BASE_URL`/`KICOMAV_API_KEY`; o worker local usa apenas o interpretador interno e diagnóstico server-side.
- [x] Integrar o worker local ao upload de capa antes de `storagePut`, sem alterar autosave textual ou metadados editoriais seguros.
- [x] Implementar retenção de metadados de varredura e política fail-closed para arquivos não limpos, sem salvar conteúdo malicioso no banco; bytes não são retidos.
- [x] Adicionar testes unitários do gateway para clean, infected, erro, resposta inválida e arquivo acima do limite; erros HTTP externos e ausência de configuração externa não se aplicam ao worker local.
- [x] Validar typecheck, suíte, build, diff e worker; não há segredo KicomAV no cliente.


## Revisão de arquitetura — KicomAV interno por sessão

- [x] Remover a dependência obrigatória de `KICOMAV_BASE_URL` e `KICOMAV_API_KEY` externos do plano de integração.
- [x] Fixar o KicomAV como engine interno/worker local do aplicativo, com contrato server-side e sem exposição direta ao navegador.
- [x] Gerar credencial efêmera e revogável por sessão de login, armazenando somente hash e metadados operacionais.
- [x] Criar relatório do proprietário com prefixo, sessão, criação, último uso, estado, projeto/base lógica e revogação sem exibir segredo bruto.
- [x] Implementar rotação manual de credencial, exclusão/revogação e regeneração segura após migração de pasta/projeto.
- [x] Definir URL base lógica derivada do projeto/ambiente para diagnóstico/migração, sem tratá-la como endpoint público do KicomAV.
- [x] Integrar o worker ao upload com estados de segurança, limite, timeout e fail-closed; a retenção de bytes em quarentena permanece desativada por desenho.
- [x] Cobrir isolamento, rotação/revogação por contrato, worker QA e falhas de entrada em testes isolados; login autenticado real, persistência DB e detecção por assinaturas exigem execução no ambiente publicado.


## Correção de escopo — reconstrução funcional do editor

- [x] Entregar Biblioteca integrada com criação, abertura, edição, duplicação, exclusão/reset protegido, busca, filtro, ordenação e ponto de retomada; ações estão cobertas pelo fluxo integrado e os refinamentos visuais seguem o QA.
- [x] Entregar Projeto com metas total/diária, prazo, progresso derivado e último ponto; hábito diário detalhado e backup/restore visual continuam pendentes.
- [x] Entregar Manuscrito com árvore semântica Partes → Capítulos → Cenas → Blocos, títulos editáveis, reordenação, duplicação, divisão/união e exclusão; fluxo estrutural está coberto por testes, com refinamentos de UX ainda possíveis.
- [x] Entregar editor rico com estilos H1–H6, parágrafo, negrito, itálico, sublinhado, links, imagem, separador, citação, listas, alinhamento, undo/redo e busca/substituição; comentários e histórico visual continuam pendentes.
- [x] Entregar Planejar com CRUD descobrível de personagens, locais, eventos, objetivos, conflitos, cenas, relações e notas, incluindo tags/status nas entidades básicas e reabertura QA; vínculos avançados entre registros permanecem em evolução.
- [x] Entregar Book Builder funcional com Front Matter e Back Matter editáveis, folha de rosto, sumário e exportação preservada; páginas adicionais específicas como copyright e notas de impressão continuam pendentes.
- [x] Entregar Layout Engine com temas/presets, fonte, tamanho, trim, margens, espaçamento, drop cap, separadores, imagens, cabeçalhos/rodapés e regras de viúvas/órfãs; fidelidade detalhada por editora ainda pode evoluir.
- [x] Entregar preview integrado responsivo com modos Livro, Tablet, Telefone e Impressão, sem abandonar o contexto do editor; a fidelidade final de e-reader continua limitada ao HTML gerado.
- [x] Validar EPUB, PDF, DOCX, TXT e HTML em round-trip básico, preservando capa, sumário, estilos e front/back matter; round-trip completo com arquivos baixados permanece pendente.
- [x] Expor snapshots locais visíveis com criação/restauração explícita e manter recuperação por backup/conflito existente; histórico remoto completo ainda não é oferecido.
- [x] Congelar expansão adicional do KicomAV nesta etapa e manter o worker isolado do autosave textual enquanto a reconstrução editorial continua.


## Marco funcional 2026-08-28

- [x] Book Builder: ativar, editar, salvar e reabrir uma seção de Front Matter pela UI; exportação HTML/EPUB/DOCX coberta por teste.
- [x] Projeto: persistir meta total, meta diária, prazo e progresso derivado com teste QA.
- [x] Manuscrito: adicionar comandos acessíveis H1–H6, citação, listas, alinhamento, separador e limpeza de formatação.
- [x] Manuscrito: dividir e unir nós adjacentes com IDs estáveis, persistência e fluxo UI testado.
- [x] Tratar a reconstrução restante de Biblioteca, árvore Partes/Cenas/Blocos, Planejar, Layout Engine, preview multi-dispositivo e snapshots em itens granulares; a paridade comercial integral não é declarada.


## Marco funcional 2026-08-28 — organização e layout

- [x] Biblioteca: adicionar filtro por status e ordenação por atualização, título e progresso, com regressão UI.
- [x] Projeto: adicionar criação e restauração explícita de até oito snapshots locais, sem alteração automática do documento.
- [x] Layout Engine: tornar formato A4/A5/6×9, margens estreitas/normais/amplas e capitular efetivos em HTML, EPUB, PDF e DOCX.
- [x] Executar typecheck, suíte integral e build após o marco: 27 arquivos, 62 testes aprovados e 1 ignorado.


## Marco funcional 2026-08-28 — organização narrativa

- [x] Biblioteca: filtros por status e ordenação por atualização, título e progresso cobertos por regressão UI.
- [x] Projeto: snapshots locais explícitos com criação/restauração cobertos por teste.
- [x] Planejar: tags persistentes em personagens, locais e eventos, com edição, status e exibição no cartão.
- [x] Prosseguir com a árvore Partes → Capítulos → Cenas → Blocos, vínculos avançados básicos por IDs, Layout Engine e preview multi-dispositivo; vínculos semânticos adicionais entre cenas e objetivos permanecem uma evolução futura.


## Marco funcional 2026-08-28 — refinamento editorial

- [x] Layout Engine: adicionar cabeçalho/rodapé editoriais e regras de viúvas/órfãs ao HTML de impressão, com teste de regressão.
- [x] Completar suporte equivalente de cabeçalho/rodapé e regras de paginação nos formatos EPUB, PDF e DOCX, com regressão de exportação; validação visual de impressão detalhada permanece recomendada.


# Relatório técnico de estrutura — 2026-10-05

- [x] Auditar a solicitação de inventário completo para desenvolvedores.
- [x] Conferir estrutura real do repositório, stack, contratos, persistência, IA, exportação, segurança e documentação existente.
- [ ] Consolidar o inventário em `docs/RELATORIO-ESTRUTURA-SHAKSTORY.md`.
- [ ] Executar validação final do arquivo e registrar limitações verificáveis.

- [x] Verificar o relatório: arquivo presente, 443 linhas e 18 seções técnicas.
- [x] Executar `pnpm check`: aprovado.
- [ ] Executar suíte integral sem bloqueio externo: 61 testes aprovados, 1 ignorado e 1 falhou em `server/github-token.credentials.test.ts` com HTTP 401; causa operacional provável: token/credencial GitHub ausente, inválido ou sem autorização para o repositório. Nenhum segredo foi exposto.
- [ ] Reexecutar `pnpm validate:data`, `pnpm validate:repository` e `pnpm build` separadamente após a falha da suíte, pois o encadeamento parou no teste externo.


# Backup GitHub — 2026-10-05

- [x] Auditar status Git: branch `main` alinhada ao remoto interno, com `todo.md` modificado e novo relatório técnico não rastreado.
- [x] Confirmar que as migrações e o schema SQL em `drizzle/` já fazem parte do conteúdo rastreado.
- [x] Confirmar que a conta GitHub `Shaksperio` está autenticada.
- [x] Verificar que `Shaksperio/Shakstory` não aparece na conta atual; criar destino privado antes do push.
- [ ] Criar commit somente com código, documentação, schemas, dados editoriais autorizados e SQL; não incluir secrets, `node_modules` ou `dist`.
- [ ] Enviar o commit para o repositório GitHub privado e validar o conteúdo remoto.

- [x] Criar o repositório privado `Shaksperio/Shakstory-Backup`.
- [x] Publicar o commit `8a9ffe4752356834bcc913cdac63f7d970b7e592` no branch `main`.
- [x] Confirmar remotamente 338 caminhos, incluindo código, documentação, schema e migrações SQL.
- [x] Confirmar que não foram publicados `.env`, `node_modules`, `dist`, `.pem` ou `.key`.
- [x] Validar o backup remoto: https://github.com/Shaksperio/Shakstory-Backup/commit/8a9ffe4752356834bcc913cdac63f7d970b7e592


## Continuidade 2026-10-07 — contratos da coautoria

- [x] Exigir três amostras utilizáveis; resposta parcial deve mostrar erro sem alterar o manuscrito.
- [x] Resolver gênero específico antes do genérico e usar faixa geral quando ausente.
- [x] Respeitar contagem explícita abaixo de 700 palavras quando solicitada pelo autor.
- [x] Validar regressões e registrar limitações do ambiente.

Validação: 11 verificações executadas diretamente em Node, validação de dados, guardrail do repositório e `git diff --check` aprovados. Suíte Vitest, typecheck e build não executados: instalação offline bloqueada por dependência ausente no cache. As novas regressões Vitest estão adicionadas para execução em CI. Publicação em produção pendente.
