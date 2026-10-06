# Evidências do preview — 27/08/2026

O preview público abriu a página inicial do Shakstory corretamente e exibiu a entrada do estúdio. A Biblioteca autenticada não pôde ser acessada no navegador de teste porque a sessão encontrou a tela de login do Manus; não foram inseridas credenciais pessoais. A captura desktop disponível mostrou uma interface clara, legível e responsiva na tela pública, porém mais próxima de um dashboard SaaS genérico do que da direção visual literária escura/clássica solicitada pelo autor.

A correção verificável em ambiente local confirmou que `/api/not-a-route` retorna `404 application/json` com `{"error":"API route not found"}` e que `/api/trpc/literaryAssist.models` sem sessão retorna `401 application/json`, não HTML. A suíte automatizada confirmou o caso de provedor LLM que devolve `<!DOCTYPE html>` e agora recebe diagnóstico operacional explícito.

Limitação real: o fluxo autenticado de criação de livro QA, upload de capa, escrita, reabertura e análise no navegador permanece pendente até existir sessão autenticada no browser. Os testes locais cobrem os contratos e o ciclo de vida sem usar livros reais.

## Revisão visual adicional

A captura desktop do preview autenticado mostrou tema clássico com fundo papel quente, superfícies claras, tipografia serifada para títulos e acento violeta; a hierarquia da Biblioteca ficou mais editorial e menos genérica. A captura mobile (390×844) manteve o cabeçalho com marca, tema escuro e busca, empilhou os cartões de métricas e expandiu o CTA Novo livro para a largura disponível sem sobreposição visível.

A tela autenticada foi visualizada pelo preview gerenciado; a sessão do navegador de interação continua separada e permanece na tela de login do Manus. Portanto, a evidência visual não substitui ainda o teste manual autenticado de upload e análise no browser.

## Revisão adicional — 27/08/2026

A captura desktop do preview mostrou o tema clássico com superfícies de papel quente, tipografia serifada, acento violeta e navegação legível. A estrutura permanece utilizável em largura desktop. Entretanto, a consulta autenticada `data.get` retornou documento remoto sem livros, e a Biblioteca exibiu zero projetos. Como não foi possível concluir a interação de login pelo navegador de teste nesta sessão, o fluxo completo de criação, gravação remota, reload e exportação continua pendente de validação manual autenticada. Esse achado não deve ser tratado como confirmação de perda de dados: é uma evidência de que a recuperação remota precisa ser exercitada com um projeto QA e uma sessão autenticada.

## Semântica de identidade editorial

`versionId` identifica a versão corrente do documento `library.json` no fallback/local e acompanha a persistência do documento. Ele não deve ser interpretado como um histórico de snapshots. O histórico operacional do repositório continua sendo representado pelo SHA remoto quando disponível; uma linha do tempo de snapshots por edição permanece fora do escopo desta iteração.


## Auditoria visual da Biblioteca — 2026-08-27

O preview local mostrou um cabeçalho compacto com gatilho de menu à esquerda, navegação direta apenas em telas largas e conteúdo principal sem sobreposição permanente. Em desktop, a Biblioteca apresenta hierarquia clara, busca alinhada à seção de projetos e estado vazio legível. Em mobile de 390 px, o título, descrição, CTA, cards de estatísticas, busca e estado vazio refluem em uma coluna sem overflow horizontal visível. A validação de cartões com livros reais, abertura do menu, diálogos destrutivos e fluxo autenticado continua dependente de sessão autenticada; os testes QA isolados cobrem esses estados sem dados editoriais do autor.


## Auditoria visual final do marco 2026-08-28

A captura desktop confirmou o shell com menu contextual, Biblioteca, Projeto, Manuscrito, Planejar, Preparar e Segurança sem cobrir a área principal. A captura mobile em 390×844 confirmou recolhimento dos itens de navegação, botão Novo livro em largura adaptada e cartões empilhados sem overflow horizontal aparente. O conteúdo autenticado de um livro e os fluxos de exportação ainda dependem de login manual no preview.
