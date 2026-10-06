# Universo, Série e Cânone Compartilhado

O piloto do Shakstory usa três escopos canônicos:

- **Livro**: `canon/{bookId}.json`
- **Série**: `series-canon/{seriesId}.json`
- **Universo**: `universe-canon/{universeId}.json`

Cada livro guarda sua associação em:

`hierarchy/{bookId}.json`

## Resolução de contexto

Ao chamar `/api/assist`, o Worker:

1. recebe o cânone do livro ativo;
2. lê a hierarquia do livro no D1;
3. carrega o cânone da série, quando houver;
4. carrega o cânone do universo, quando houver;
5. combina os três escopos para a IA;
6. mantém o manuscrito imutável até uma ação explícita do autor.

## IDs no piloto

Universo e Série usam IDs determinísticos derivados do nome normalizado. Dois livros com os mesmos nomes de Universo e Série compartilham os mesmos documentos canônicos.

## Validação

Em 5 de outubro de 2026, um fato salvo no cânone de Série em `Segundo Livro de Teste` foi recuperado automaticamente por `Terceiro Livro de Teste`, configurado com a mesma Série. O assistente respondeu usando o fato compartilhado.
