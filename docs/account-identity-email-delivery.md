# Autenticação vinculada e e-mail transacional

## Requisito de identidade

Antes de enviar confirmação de exclusão, mudar plano, desativar ou excluir:

1. Verificar no servidor o JWT Cloudflare Access usando `verifyAccessJwt`, incluindo assinatura, emissor, audience e expiração.
2. Verificar o Firebase ID token com chaves públicas do Google, emissor, audience, expiração e `email_verified === true`. A credencial deve representar o login Google efetivo no modo GitHub Pages, e não apenas um custom token emitido pelo próprio Worker.
3. Consultar o e-mail canônico da conta no D1 usando a identidade autenticada, nunca o e-mail enviado no body do navegador.
4. Exigir igualdade estrita após trim e lowercase entre os três e-mails. Divergência => 403, sem e-mail de exclusão nem mutação.
5. Vincular os IDs imutáveis do Google/Firebase e do Access à conta D1 para impedir takeover por reutilização ou alteração futura de e-mail; revalidar o vínculo em mudanças sensíveis.
6. No GitHub Pages, Cloudflare Access não protege diretamente a origem: exigir prova Google/Firebase no Worker, além da identidade Access obtida por um fluxo seguro de vínculo; não aceitar um e-mail declarado pelo cliente como prova Access.
7. Cloudflare Access é provedor de autenticação, **não serviço de envio transacional**. Cloudflare Email Routing trata recebimento/encaminhamento; para envio, integrar um provedor de e-mail de saída via Worker, com API key em secret, SPF/DKIM/DMARC, auditoria, rate limit e tratamento de bounce. Não afirmar que Access enviará e-mails de exclusão.

## Bloqueios de implantação

O helper `cloudflare-worker/account-identity.js` só compara valores **já verificados**; não é uma verificação criptográfica de tokens nem foi conectado a rotas de produção. Não ativar exclusão até implementar os passos acima e testes de fluxo completo, inclusive contingência e falhas de provedor.

O `mirror-token.js` atual emite custom token Firebase para lista administrativa com base apenas no Access. Isso não prova uma sessão Google separada. Para o novo requisito, exigir login Google verificado e vínculo explícito, sem quebrar o espelhamento legado até migração validada.
