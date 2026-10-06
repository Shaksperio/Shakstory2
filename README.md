# Shakstory

O Shakstory é um estúdio de autor para planejar, escrever, organizar, revisar e preparar livros para publicação. A experiência prioriza foco criativo, estrutura narrativa e continuidade segura do trabalho entre dispositivos.

## Arquitetura

O projeto separa interface, API, persistência operacional, dados JSON e versionamento. O frontend conversa apenas com a API protegida; ele não conhece GitHub nem tokens. O banco operacional mantém o uso interativo rápido. A camada de repositórios permite adicionar JSON versionado e GitHub como persistência, backup ou mecanismo de migração sem reescrever o editor.

| Diretório | Função |
| --- | --- |
| `client/` | Aplicação web e experiência do autor. |
| `server/` | Autenticação, autorização, contratos tRPC e persistência operacional. |
| `backend/src/repositories/` | Repositórios JSON local e GitHub com controle de SHA. |
| `schemas/` | JSON Schemas para livros, manuscritos, planejamento, metas, versões e mídia. |
| `data/` | Manifesto e dados editoriais versionáveis; inicia sem dados de usuários. |
| `scripts/` | Validação e futuras rotinas de exportação, backup e restauração. |
| `docs/` | Arquitetura, operação e recuperação. |

## Desenvolvimento

```bash
pnpm install
pnpm check
pnpm test
pnpm validate:data
pnpm dev
```

As variáveis de ambiente são injetadas pelo ambiente de execução e não devem ser gravadas no repositório. Para sincronização GitHub, configure no servidor `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPOSITORY` e opcionalmente `GITHUB_BRANCH`. Consulte [`docs/GITHUB.md`](docs/GITHUB.md) antes de habilitar o adaptador.

## Segurança e dados

Cada rota de domínio valida o autor autenticado antes de consultar ou alterar um livro. Arquivos visuais devem ser enviados para storage de objetos; os documentos JSON guardam apenas referências e metadados. Nenhum arquivo deste repositório deve conter token, senha, credencial Firebase, dump privado ou dados pessoais reais não autorizados.

O segundo anexo foi usado somente como referência para separação de camadas, manifesto, schemas, fila de persistência, controle de concorrência e recuperação. O domínio do Shakstory foi modelado exclusivamente para autoria, manuscritos e planejamento narrativo.

## Licença e publicação

Defina a licença e o destino de hospedagem antes da publicação externa. O repositório GitHub recomendado é privado por padrão. Um ambiente novo deve ser capaz de clonar o repositório, configurar secrets, instalar dependências, validar os dados, iniciar o servidor e recuperar os documentos versionados sem depender do ambiente que originou o projeto.


## Proteção antivírus planejada

A proteção de uploads baseada no [KicomAV](https://github.com/hanul93/kicomav) está planejada para uma etapa posterior. A decisão arquitetural é executar o scanner em worker/serviço isolado, com autenticação server-side, limites próprios de tamanho e tempo, quarentena separada e promoção para storage permanente somente após resultado limpo. O daemon não será exposto diretamente ao navegador ou à internet, e arquivos não verificados não serão servidos como se fossem seguros. A auditoria preliminar, a revisão de dependências/licença e os critérios de testes estão em [`docs/kicomav-integration-audit.md`](docs/kicomav-integration-audit.md). A proteção ainda não está ativa nesta versão.
