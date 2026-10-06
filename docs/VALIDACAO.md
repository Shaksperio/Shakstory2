# Validação do repositório

`pnpm validate:data` verifica o manifesto e os documentos JSON. `pnpm validate:repository` percorre código, schemas, dados, scripts e documentação para bloquear nomenclaturas fora do domínio editorial.

Os próprios validadores precisam carregar as palavras bloqueadas para poder detectá-las. Por isso, `validate-repository.mjs` usa uma allowlist explícita de linhas, e não uma exclusão de arquivo. A mesma regra permite apenas a linha da expressão de bloqueio e a mensagem de saída em `validate-data.mjs`. Todo o restante desses arquivos é verificado normalmente.

| Arquivo | Linhas permitidas | Justificativa |
| --- | --- | --- |
| `scripts/validate-data.mjs` | A declaração da expressão bloqueada e a mensagem de resultado. | O guard de dados precisa reconhecer entradas inadequadas e comunicar o resultado. |
| `scripts/validate-repository.mjs` | A declaração da expressão bloqueada. | O guard do repositório precisa conter os termos que procura, mas sua lógica e nomes continuam sob inspeção. |
| `todo.md` | Histórico de tarefas. | Mantém rastreabilidade das decisões e requisitos; não participa do artefato executável. |

A exceção do `todo.md` é de rastreabilidade, não de código ou dado operacional. Qualquer arquivo novo em `client`, `server`, `backend`, `schemas`, `data`, `docs`, `scripts` ou na raiz que contenha os termos bloqueados faz a validação falhar.
