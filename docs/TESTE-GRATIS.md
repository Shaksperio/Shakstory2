# Proteção do teste grátis

Quando um e-mail entra pela primeira vez, o Worker decide se a conta ganha os 7 dias de teste. A decisão é sempre do servidor.

- **Prova do e-mail:** já vem do Cloudflare Access (código enviado ao e-mail). Quem entra controla a caixa postal.
- **Sinais registrados** (tabela `shak_signups`): e-mail normalizado (gmail sem pontos e sem `+tag`), cookie do aparelho (`shak_dev`), IP (só o hash), rede/país, domínio descartável, domínio sem servidor de e-mail (DNS MX, com falha aberta).
- **Sinais fortes negam sozinhos:** e-mail descartável, e-mail duplicado, domínio sem e-mail, aparelho que já usou o teste, rede com 4 testes em 30 dias.
- **Sinais médios só negam em conjunto:** VPN/proxy/hospedagem/Tor (heurística pelo nome da rede, não é infalível) e rede com 2 ou 3 testes em 30 dias. VPN sozinha é só registrada.
- **Negado** = a conta é criada sem teste (plano "expirado", com os motivos na tela). Escrever e baixar backup continuam liberados.
- **Liberar:** Contas e planos → aplicar "Reiniciar teste de 7 dias". A lista mostra quem ficou sem teste e por quê (`GET /api/admin/signups`).
- Falha técnica na checagem nunca impede o acesso e nunca pune.
- Privacidade: IP guardado só como hash; reter por tempo limitado (a limpeza automática ainda não existe).
