# Evolução editorial — 7 de outubro de 2026

A evolução aproveita o fluxo editorial observado no Reedsy sem alterar os IDs ou converter os capítulos dos projetos existentes. Os campos novos são opcionais no documento da biblioteca.

## Como usar

- **Biblioteca:** importar DOCX/ODT, conferir a prévia e confirmar a criação de um novo livro. Capas aparecem nos cartões. Em **Editar livro**, ativar ou desativar **Arquivar livro**; **Ver arquivo** alterna a biblioteca.
- **Manuscrito, revisão e preferências:** a estrutura reúne preliminares, corpo e pós-textuais. Seções podem ser incluídas, editadas, desativadas e reordenadas. Os capítulos continuam usando o editor existente.
- **Copyright e créditos:** autor, edição, ano, editora, ISBN por formato, créditos, cláusulas opcionais e texto adicional. O copyright é gerado na estrutura e nas exportações, respeitando sua posição e ativação.
- **Revisão e histórico:** comentários por capítulo, trecho citado, resolução/reabertura, rastreamento opcional das próximas edições e versões explícitas do capítulo. Edições consecutivas em até 30 segundos são agrupadas, preservando o texto inicial. Aceitar mantém a edição; rejeitar restaura somente quando não há edições posteriores. Restaurar uma versão guarda primeiro o texto deslocado.
- **Preferências de escrita:** fonte e entrelinha por navegador, independentes do layout exportado. A aparência clara/escura continua disponível no aplicativo.
- **Celular:** alternar entre Capítulos, Escrever e Ferramentas. Ações de capítulo não dependem de hover.
- **Preparação:** metadados e layout são salvos no livro. Exportações incorporam as imagens; falhas no carregamento são exibidas antes do download.

## Persistência e compatibilidade

Comentários, alterações, versões, copyright e arquivo ficam em `library.json`, junto ao livro, e seguem o salvamento no D1. O salvamento serializa gravações e usa o SHA confirmado na gravação seguinte; um conflito interrompe a fila até a atualização explícita. A cópia IndexedDB suporta manuscritos com imagens, além do backup legado em localStorage. O limite do localStorage não impede o salvamento remoto. Ao retornar a conexão, a fila pode continuar.

Cowila continua sob solicitação do autor, mantendo o fluxo de três amostras, expansão selecionada, aplicação manual e desfazer. Comentários são registros editoriais persistidos; esta versão não acrescenta convites, permissões de equipe ou edição simultânea.

## Importação e exportação

DOCX/ODT: até 25 MB comprimidos, 80 MB descompactados, 5.000 entradas; imagens internas PNG/JPEG/WebP até 4 MB por imagem. Títulos de nível 1 separam capítulos. Negrito, itálico, sublinhado DOCX, subtítulos e imagens são preservados. A prévia informa conversões e conteúdo não suportado. Tabelas são convertidas em parágrafos; notas de rodapé, comentários e alterações do arquivo original não são convertidos. Manter o original para conferência.

EPUB inclui pós-textuais no manifesto, navegação e ordem de leitura, incorpora imagens e usa data de modificação compatível com EPUB 3. HTML mantém o texto formatado e tamanho de página. DOCX mantém marcas básicas, imagens e tamanho de página. PDF mantém marcas básicas, imagens, títulos e sumários com quebra de linha, ordem editorial e numeração de páginas. Os mecanismos de composição dos formatos diferem; fontes e paginação não são idênticas entre PDF, DOCX e EPUB. Imagens WebP são convertidas em PNG pelo navegador antes da exportação.

## Validação

- 108 testes aprovados; 3 testes opcionais de credenciais reais ignorados.
- TypeScript, build frontend/backend, validação de dados, validação do repositório e `git diff --check` aprovados.
- Regressões cobrem importação, copyright, comentários, resolução, versões, rejeição sem rastreamento adicional, serialização de gravações, incorporação e falha de imagens, navegação EPUB e formatação/dimensões DOCX.
- Fixture PDF/DOCX/EPUB com capa e imagem: XML dos pacotes validado; ordem do PDF conferida por extração e página renderizada inspecionada.

## Preservação em operações estruturais

Dividir usa o cursor quando disponível (ou o meio do texto), mantém marcas, listas, links e imagens e recusa divisões com conteúdo formatado inconsistente. Unir combina os capítulos sem descartar formatação. Ambas as operações incorporam primeiro a edição ainda não salva e guardam versões do conteúdo alterado. Comentários e histórico do capítulo unido são associados ao capítulo mantido. Renomear e reorganizar reconciliam a árvore semântica; restaurar o snapshot do projeto guarda primeiro o estado deslocado.

## Créditos, paginação e navegação — 07/10/2026

Todos os caminhos de exportação usam o mesmo contrato editorial. Ano (copyright, ano de publicação ou data preenchida), ISBN e ID estável aparecem na página de copyright em PDF, DOCX, EPUB, HTML e TXT. O copyright e os avisos de direitos reservados/ficção são incluídos por padrão, com controles explícitos para desativar seções ou cláusulas. O aviso de ficção menciona personagens, lugares e acontecimentos e a coincidência com pessoas ou fatos reais. ISBNs por formato e créditos adicionais são mantidos.

Os capítulos recebem numeração contínua na cópia exportada; partes, prólogo e epílogo permanecem sem número de capítulo. Títulos e IDs do manuscrito original são preservados. PDF inicia seções em novas páginas, incorpora fontes DejaVu com variantes e usa sumário com destinos e números de páginas calculados após a composição. DOCX usa quebras de página, numeração PAGE no rodapé, bookmarks e sumário TOC com entradas em cache; solicita atualização dos campos ao abrir. No Word, atualizar o sumário recalcula os números conforme a paginação local. EPUB tem sumário navegável e páginas fluidas conforme o leitor; não possui numeração fixa equivalente ao PDF. HTML de impressão usa quebras e contadores CSS de páginas quando suportados pelo navegador; TXT não é um formato paginado.

A interface agrupa preliminares, corpo e pós-textuais na barra lateral. Seções podem ser ativadas e ordenadas; capítulos podem ser renomeados e reordenados por arraste ou botões. Biblioteca e área de escrita receberam superfícies editoriais, capas com destaque, barra lateral em azul acinzentado e página clara (escura no tema escuro).

Validação: 108 testes aprovados e 3 testes opcionais de credenciais reais ignorados; PDF de amostra renderizado e conferido (créditos, sumário, abertura e paginação); XML DOCX/EPUB conferido. Campos DOCX são dependentes do leitor; não foi usada uma sessão real do Word para validar sua atualização automática.

## Máquina de escrever

No Manuscrito, o botão **Máquina de escrever** ativa a folha em movimento e o teclado verde clássico. O teclado físico e as teclas visuais editam o mesmo rascunho, mantendo formatação e salvamento automático. Há maiúsculas, números, símbolos e acentos; a folha acompanha a linha de escrita. No celular, o teclado visual substitui o teclado do sistema neste modo. A preferência é lembrada no dispositivo; desativar retorna ao editor normal. O modo é silencioso e respeita a preferência de movimento reduzido.
