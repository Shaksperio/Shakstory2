# Espelho Firebase sem login do Google no endereço principal

O endereço principal só aceita entrada por e-mail + código (Cloudflare Access). Para alimentar o Firebase sem popup do Google:

1. O navegador chama `GET /api/mirror-token` (já atrás do Access).
2. O Worker valida o JWT do Access (assinatura, emissor, público), confere o e-mail na lista (`acpconsultorias@gmail.com`, `antonyopintor@gmail.com`) e assina um *custom token* do Firebase com a chave de serviço (segredo `FIREBASE_SERVICE_ACCOUNT`).
3. O app entra no Firebase com esse token (claim `mirrorEmail`); `firestore.rules` autoriza a pasta `workspaces/main` para essa claim ou para o login Google dos mesmos e-mails.
4. O GitHub Pages continua entrando com Google. Os dois lados chegam à mesma pasta, pelo mesmo e-mail autorizado.

## Configuração (uma vez)

- Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave privada (arquivo JSON).
- Cloudflare → Workers → `shakstory` → Configurações → Variáveis e segredos → segredo `FIREBASE_SERVICE_ACCOUNT` com o conteúdo do JSON.
- Publicar `firestore.rules` no Firebase.
- Aplicar a rota no Worker: `node scripts/patch-worker-mirror.mjs <worker-atual.js> <saida.js>` e publicar a saída.

Sem o segredo, a rota responde 501 e o app mostra o botão de conexão manual com o Google.
