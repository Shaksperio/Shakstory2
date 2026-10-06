# Operação com GitHub

O repositório GitHub deve ser privado e conter código, schemas, documentação, scripts e os arquivos JSON editoriais autorizados. O frontend nunca recebe o token do GitHub e nunca chama a API do GitHub diretamente.

## Variáveis de ambiente do servidor

```dotenv
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPOSITORY=
GITHUB_BRANCH=main
```

`GITHUB_TOKEN` é o mecanismo operacional principal da sincronização versionada. O token ativo foi validado contra a API do GitHub e deve permanecer Fine-grained, restrito a `Shaksperio/Shakstory`, com `Contents: Read and write` e `Metadata: Read-only`. As demais variáveis identificam o destino e não são credenciais, mas continuam sendo configuradas somente no ambiente do backend.

A autenticação nativa por GitHub App (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` e campos relacionados) é opcional e não participa do fluxo atual. Ela não deve ser tratada como obrigatória enquanto a Private Key não estiver validada; não é necessário conceder permissões de conta, organização ou enterprise.

## Fluxo de persistência

A API valida o payload, agrupa alterações do autosave e publica documentos independentes em um commit de sincronização. O adaptador lê o SHA atual antes de escrever e envia o SHA na atualização. Se o SHA tiver mudado, a gravação é rejeitada como conflito; nenhum conteúdo é sobrescrito silenciosamente.

O GitHub não é usado como banco de dados de baixa latência nem recebe um commit a cada tecla. O banco operacional mantém a interação rápida; JSON/GitHub representa persistência versionada, auditoria e backup.

## Webhook de sincronização

Quando o GitHub App estiver configurado para receber eventos, use `https://shakstory-cpuxtpcc.manus.space/api/github/webhook` como Webhook URL. Ative apenas o evento mínimo necessário para a estratégia adotada e salve um segredo aleatório longo como `GITHUB_WEBHOOK_SECRET`; o mesmo valor deve ser cadastrado no GitHub e no ambiente do backend. O endpoint valida `X-Hub-Signature-256` com comparação em tempo constante e responde imediatamente a eventos válidos. O frontend não recebe o segredo.

O painel do editor diferencia `Sincronizando`, `Sincronizado`, `Somente local` e `Conflito`. Um conflito de SHA nunca substitui o documento remoto silenciosamente: o autor deve recarregar e revisar antes de tentar novamente.

## GitHub OAuth

Para o OAuth App do GitHub, use como **Authorization callback URL**:

```text
https://shakstory-cpuxtpcc.manus.space/api/github/oauth/callback
```

O fluxo usa `state`, PKCE (`S256`) e cookies `HttpOnly`/`Secure`. O Client ID e o Client Secret são lidos exclusivamente do ambiente do servidor como `GITHUB_OAUTH_CLIENT_ID` e `GITHUB_OAUTH_CLIENT_SECRET`. O frontend inicia a autorização por `/api/github/oauth/start` e nunca recebe o Client Secret.

## Publicação do repositório

```bash
gh repo create shakstory --private --source=. --remote=github --push
```

Antes do comando, verifique o conteúdo com `pnpm check`, `pnpm test`, `pnpm validate:data` e `git diff --check`. O repositório `Shaksperio/Shakstory` já recebeu o branch `main` usando o token Fine-grained. Nunca use `git add` para arquivos de ambiente, arquivos de sessão, tokens ou dumps não autorizados.
