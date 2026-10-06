# Independência do ambiente de origem

O Shakstory deve funcionar como uma aplicação web comum, com frontend, backend, schemas, scripts e documentação presentes no repositório. O frontend não depende de ferramentas de sessão do ambiente de origem, nem acessa conectores ou APIs privadas diretamente.

A autenticação e os segredos são responsabilidades do servidor. O acesso ao GitHub ocorre somente pelo adaptador backend, usando variáveis de ambiente. O armazenamento operacional pode ser substituído por JSON local, GitHub, SQLite, PostgreSQL ou Firebase atrás da mesma interface de repositório.

## O que pertence ao GitHub

Código-fonte, migrations, schemas, manifesto, documentação, scripts e arquivos JSON editoriais autorizados devem ser versionados. Não devem ser versionados tokens, credenciais, sessões, dumps sem revisão, mídias binárias grandes ou informações pessoais não necessárias.

## O que não pertence ao frontend

O frontend não conhece `GITHUB_TOKEN`, não monta chamadas para a API de conteúdo do GitHub, não implementa commits e não decide qual storage é a fonte de verdade. Ele chama operações de domínio como listar livros, atualizar uma cena e restaurar uma versão.

## Evolução de storage

A primeira fase pode continuar usando o banco operacional já configurado para preservar a experiência. O adaptador JSON/GitHub fica isolado para exportação, backup, migração e futura fonte principal. A troca de motor não deve exigir reescrever o editor.
