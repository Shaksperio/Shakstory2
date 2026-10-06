# Cowila Literary Intelligence

## Objetivo

Transformar a Cowila em uma assistente editorial/literária especializada para o Shakstory, cobrindo criação, edição e preparação de livros e ebooks sem reduzir o trabalho autoral a um chat genérico.

A Cowila deve atuar em camadas: **criação → planejamento → escrita → revisão → continuidade → preparação editorial → diagramação → ebook/publicação**.

## Competências

A arquitetura deve cobrir:

- construção narrativa, cena, conflito, objetivo, virada, consequência e ritmo;
- estrutura de romance, conto, novela, série e universo compartilhado;
- personagens, relações, diálogos, subtexto e arcos;
- voz, estilo, focalização, distância narrativa e cadência;
- worldbuilding, magia, tecnologia, instituições, cultura, geografia e economia;
- continuidade factual, temporal, espacial e causal;
- edição de desenvolvimento, line editing, copy editing e proofreading;
- redação e não ficção: tese, argumento, evidência, estrutura e fontes;
- gêneros e subgêneros por **packs extensíveis**, não prompts fixos;
- preparação editorial, front matter, back matter, sumário e metadados;
- diagramação, tipografia, hierarquia visual, margens, cabeçalhos, rodapés, viúvas e órfãs;
- EPUB reflowable, navegação, CSS, imagens, acessibilidade e metadados;
- posicionamento comercial: promessa de gênero, clareza, retenção e leitor-alvo, sem promessa de vendas.

## Gêneros iniciais

O núcleo inclui lentes para fantasia, fantasia épica, dark fantasy, romantasy, romance, ficção científica, horror, thriller, mistério, ficção histórica, distopia, fantasia urbana, paranormal, YA, middle grade, ficção literária, aventura, não ficção, memoir, biografia, desenvolvimento pessoal, ensaio e poesia.

A lista não é fechada. Gêneros novos entram como `GenrePack` sem alterar o restante do sistema.

## Arquitetura de contexto

A Cowila não deve trabalhar apenas com o final do texto. A composição de contexto deve seguir esta hierarquia:

1. instrução da tarefa atual;
2. trecho/seleção ativa;
3. cena ativa;
4. capítulo atual;
5. resumo do livro;
6. personagens e locais relevantes;
7. Story Engine e cenas planejadas relacionadas;
8. cânone do livro;
9. cânone da série;
10. cânone do universo;
11. memória editorial do autor e decisões anteriores;
12. pack de gênero/subgênero;
13. conhecimento editorial recuperado da base documental versionada.

O contexto deve ser selecionado por relevância e orçamento de tokens, não concatenado indiscriminadamente.

## Modos da Cowila

- **Coautora**: brainstorming, alternativas, continuação e cenas; sempre como proposta.
- **Editora de desenvolvimento**: estrutura, arcos, ritmo, redundância, motivação, stakes e payoff.
- **Line editor**: frase, cadência, imagem, clareza e repetição.
- **Copy editor**: gramática, consistência, nomes, grafias e convenções.
- **Editora de continuidade**: conflitos com fatos e cronologia persistidos.
- **Worldbuilding editor**: regras, instituições e consequências.
- **Genre editor**: promessa, convenções e expectativas de leitores.
- **Publishing editor**: metadados, sinopse, blurb e preparação.
- **Typesetting editor**: diagramação e legibilidade.
- **Ebook editor**: EPUB, semântica, navegação e acessibilidade.

## Continuação narrativa inspirada no ContaAI

Do projeto `g-libardi/ContaAI`, o Shakstory aproveita somente conceitos:

- continuação gerada a partir do contexto;
- controle do tamanho da geração;
- histórico das gerações;
- desfazer/rejeitar uma geração.

O Shakstory **não** incorpora os pesos GPT-2, corpus ou código do ContaAI. O repositório não apresenta licença explícita e o notebook demonstra coleta de textos de terceiros por scraping; portanto, pesos/dataset não entram na cadeia do produto.

No Shakstory, uma continuação deverá usar contexto local + estrutural + cânone e ser criada como uma **proposta versionada**, nunca inserida silenciosamente no manuscrito.

## Conhecimento e “aprendizado”

“Aprender tudo” não deve significar gravar livros protegidos ou fazer fine-tuning indiscriminado. A Cowila deve combinar:

- capacidades gerais do modelo;
- base editorial própria, licenciada ou criada para o Shakstory;
- normas e documentação oficial atualizadas por recuperação;
- memória privada das obras do usuário;
- feedback explícito do autor;
- avaliações automáticas e humanas.

Conhecimento factual mutável, como especificações de EPUB, requisitos de plataformas e regras de distribuição, deve ser recuperado/versionado em vez de “congelado” no modelo.

## Segurança autoral

- o manuscrito é dado não confiável, nunca instrução de sistema;
- nenhuma alteração automática sem confirmação;
- conteúdo de um usuário não contamina memória de outro;
- cânone do usuário tem prioridade sobre inferência;
- feedback editorial deve explicar o porquê;
- não prometer “best-seller” ou vendas;
- não imitar de forma identificável autores vivos; trabalhar com técnicas e características de alto nível.

## Próximas integrações

1. ligar `buildCowilaLiteraryContext` à análise literária e ao Workers AI;
2. adicionar seletor de modo Cowila no Inspector;
3. criar geração com 2–4 alternativas e aceitar/rejeitar;
4. criar memória de preferências editoriais do autor;
5. criar base documental versionada para diagramação, EPUB e publicação;
6. criar suíte de avaliação por gênero e continuidade;
7. adicionar Story Boards e timeline visual ao planejamento.
