# Piloto Shakstory — Cloudflare

Estado consolidado em 5 de outubro de 2026.

## Produção

- Versão validada: `2026-10-05.12`

- Worker: `shakstory-pilot`
- URL: https://shakstory-pilot.antonyopintor.workers.dev
- D1: `shakstory-pilot`
- D1 UUID: `b2c9c84a-0ff2-4d7f-8b17-e1046149af4a`
- Workers AI: ativo
- Repositório operacional: `Shaksperio/Shakstory2`
- Origem histórica: `Shaksperio/Shakstory-Backup`

## Funcionalidades já validadas

- Biblioteca multi-livro
- Manuscritos isolados por `bookId`
- Bíblia Inteligente com escopos Livro / Série / Universo
- Planejamento com personagens, locais e timeline
- Story Engine com objetivos, conflitos, relações, notas e cenas planejadas
- Memória persistente do assistente por livro
- Histórico de versões com restauração como nova versão
- Assistente contextual com cena + cânone de Livro/Série/Universo + planejamento + Story Engine
- D1 com controle de concorrência por SHA
- `/health` e `/self-test`
- Workers AI validado no servidor e pela interface

## Hierarquia narrativa

- Universo → Série → Livro
- Hierarquia por livro em `hierarchy/{bookId}.json`
- Cânone de série em `series-canon/{seriesId}.json`
- Cânone de universo em `universe-canon/{universeId}.json`
- IDs de série/universo são determinísticos por nome no piloto, permitindo compartilhamento entre livros.

## Segurança editorial

A IA gera propostas e análises. O manuscrito não é alterado automaticamente por respostas do assistente.

## Pendências externas

- Firebase Primary ainda sem projeto configurado.
- Firebase Secundário retorna 403.
- R2 depende de ativação na conta Cloudflare.
