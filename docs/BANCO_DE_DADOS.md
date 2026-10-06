# Banco de dados editorial

O domínio do Shakstory é centrado em um livro e em seus documentos relacionados. Cada entidade possui identificador estável, `version`, timestamps UTC e referência explícita ao livro proprietário.

| Entidade | Conteúdo | Persistência JSON sugerida |
| --- | --- | --- |
| Livro | Título, autoria, sinopse, idioma, status, meta e capa. | `data/books/{id}.json` |
| Nó do manuscrito | Parte, capítulo, cena, front matter ou back matter, conteúdo e ordem. | `data/manuscript-nodes/{id}.json` |
| Item narrativo | Personagem, local, objeto, evento, ideia ou nota. | `data/story-items/{id}.json` |
| Linha do tempo | Marco narrativo, descrição, posição temporal e cena relacionada. | `data/timeline/{id}.json` |
| Meta | Meta total, ritmo diário e prazo. | `data/goals/{id}.json` |
| Versão | Snapshot nomeado de um nó, conteúdo e contagem de palavras. | `data/versions/{id}.json` |
| Mídia | Referência de storage, tipo, MIME e tamanho; nunca bytes. | `data/media/{id}.json` |

As relações são feitas por IDs e não por cópia de registros inteiros. O editor preserva conteúdo, estrutura e snapshots do manuscrito mesmo quando metadados relacionados evoluem.

## Consistência

Uma operação de escrita atualiza o documento de origem, incrementa sua versão e atualiza o manifesto em uma unidade lógica. O banco operacional continua sendo a fonte de baixa latência para a interface. A exportação para JSON é validada antes de ser publicada no GitHub.

## Dados sensíveis

O `ownerId` não deve ser usado como dado público. Em arquivos versionados, use um identificador opaco estável ou mantenha os dados privados fora do repositório. Capas e referências visuais ficam no storage de objetos e são referenciadas por `storageKey`.
