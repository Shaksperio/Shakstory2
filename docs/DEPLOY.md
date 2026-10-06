# Deploy independente

O projeto pode ser executado em um servidor Node compatível com o contrato abaixo. O domínio publicado no Manus é útil para validação do OAuth, mas não é uma exigência estrutural do aplicativo.

## Preparação

```bash
git clone https://github.com/Shaksperio/Shakstory.git
cd Shakstory
pnpm install
```

Não grave secrets no repositório nem em arquivos versionados. Configure autenticação, banco operacional e, quando desejado, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPOSITORY` e `GITHUB_BRANCH` no gerenciador de secrets da hospedagem.

## Build e execução

```bash
pnpm check
pnpm test
pnpm validate:data
pnpm build
NODE_ENV=production pnpm start
```

O servidor deve receber a porta pela variável `PORT`; não fixe a porta no código. Publique atrás de HTTPS, pois cookies OAuth e a callback exigem transporte seguro.

## Callback OAuth

No GitHub OAuth App, registre exatamente:

```text
https://shakstory-cpuxtpcc.manus.space/api/github/oauth/callback
```

Para outro domínio permanente, substitua o domínio e mantenha o caminho `/api/github/oauth/callback`. O valor deve coincidir com o callback usado pelo backend.

## Restore

Após clonar, restaure os arquivos JSON editoriais autorizados, valide o manifesto e execute a suíte de testes. Restaure mídia no storage de objetos e banco operacional separadamente. Consulte [`RECUPERACAO.md`](RECUPERACAO.md) para a ordem de recuperação e o teste de sobrevivência.
