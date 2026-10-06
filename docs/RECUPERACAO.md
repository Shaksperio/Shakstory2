# Backup e recuperação

O Shakstory trabalha com três camadas complementares: o banco operacional para continuidade do uso, o storage de objetos para mídia e o GitHub privado para código, schemas, manifesto e documentos JSON autorizados. Nenhuma camada isolada deve ser tratada como a única cópia de um manuscrito importante.

## Exportação

A exportação deve gerar documentos JSON independentes por entidade, atualizar `data/manifest.json` e validar todos os arquivos contra os schemas antes de abrir um commit. Os diretórios de mídia guardam apenas metadados e referências; os bytes permanecem no storage de objetos.

## Restauração

1. Clone o repositório privado em um ambiente limpo.
2. Configure as variáveis de ambiente do servidor sem adicionar `.env` ao Git.
3. Instale dependências e execute `pnpm check`, `pnpm test` e `pnpm validate:data`.
4. Restaure primeiro o banco operacional e o storage de objetos a partir de suas cópias autorizadas.
5. Reimporte os documentos JSON em ordem: livros, nós do manuscrito, planejamento, metas, timeline, versões e referências de mídia.
6. Verifique contadores do manifesto, versões e relações por ID.
7. Abra o editor e confirme login, leitura, escrita, autosave e restauração de uma versão.

## Conflitos

Uma divergência de SHA nunca deve ser resolvida sobrescrevendo automaticamente o arquivo remoto. O sistema deve preservar o documento local, registrar o conflito no log de auditoria e solicitar uma decisão explícita. Snapshots de manuscrito são preferíveis a tentativas de mesclar texto literário automaticamente.

## Teste de sobrevivência

A validação final consiste em reconstruir o ambiente a partir do clone, configurar secrets, validar os JSONs, iniciar o servidor, autenticar, abrir um livro, alterar uma cena, criar um snapshot e restaurar o snapshot. O teste deve ser repetido sem qualquer acesso ao ambiente de origem.
