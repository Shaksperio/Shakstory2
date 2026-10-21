# Pagamento com Stripe (cartão e Pix, 12 meses)

**Como funciona:** o usuário abre *Ver planos* → **Pagar (cartão ou Pix)**. O Worker cria um pedido com o preço salvo em *Contas e planos* e abre uma sessão do Stripe Checkout. Quando a Stripe confirma o pagamento, ela chama o webhook do Worker, que confere a assinatura, o valor e a moeda e **ativa o plano por 12 meses**. Voltar do checkout não ativa nada.

## O que o dono configura (uma vez)

1. **Conta Stripe** ativada (Pix habilitado em *Configurações → Formas de pagamento*).
2. **Chave secreta restrita** (*Desenvolvedores → Chaves de API → Criar chave restrita*): só a permissão **Checkout Sessions: Gravação**. Cadastre no Worker `shakstory` como segredo `STRIPE_SECRET_KEY` (Cloudflare → Workers → shakstory → Configurações → Variáveis e segredos → tipo *Segredo*). Nunca cole a chave em chat, issue ou código.
3. **Webhook** (*Desenvolvedores → Webhooks → Adicionar endpoint*):
   - URL: `https://<domínio do app>/api/public/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - Copie o *Segredo de assinatura* (`whsec_…`) e cadastre no Worker como segredo `STRIPE_WEBHOOK_SECRET`.
4. **Cloudflare Access:** a rota `/api/public/stripe-webhook` precisa de uma política **Bypass** (a Stripe não tem login do Access). Só essa rota; o resto continua protegido. A rota se protege sozinha: sem a assinatura correta responde 400.
5. Em *Contas e planos*, salve o preço de cada plano (o link da Ton passa a ser opcional).

## Regras de segurança do Worker

- Assinatura `Stripe-Signature`: HMAC-SHA256 de `<t>.<corpo cru>` com `STRIPE_WEBHOOK_SECRET`, comparação em tempo constante, tolerância de 5 minutos.
- Só `payment_status = paid` ativa. O valor e a moeda precisam ser iguais aos do pedido; se não forem, o pedido vai para *revisão* e nada é ativado.
- Idempotência: a transação (`payment_intent`) é única por provedor; reenvio do mesmo evento não soma outro período, e a mesma transação não vale para dois pedidos.
- Pagamento de pedido já cancelado/recusado vai para a fila de revisão do administrador (não ativa sozinho). Se a conta já tiver outro plano pago vigente, também vai para revisão.
- O preço vem sempre do servidor, nunca do navegador. Nenhum dado de cartão passa pelo Shakstory.

## Conferir

- `GET /api/public/plans` mostra `"stripe": true` quando `STRIPE_SECRET_KEY` existe.
- Use o **modo de teste** da Stripe primeiro (chaves `sk_test_…` e `whsec_…` de teste; cartão `4242 4242 4242 4242`). Só depois troque pelos segredos de produção.
- Reembolsos são feitos no painel da Stripe; o plano é encerrado à mão em *Contas e planos* (política de reembolso ainda a definir).
