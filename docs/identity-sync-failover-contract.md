# Identidade, sincronização e continuidade — contrato de implementação

## Identidade obrigatória para gravar na nuvem
- Cloudflare Access: verificar assinatura RS256, issuer, audience, exp e e-mail; Firebase: verificar JWT via chaves públicas Google, issuer, audience, exp, sub e email_verified.
- O e-mail normalizado localiza a conta interna, mas **nunca** autoriza por si só. Resolver a identidade com vínculo do sujeito verificado (provider, sub/uid) em account_identity_providers; conflito de e-mail/subject bloqueia sincronização remota e gera evento.
- Nunca aceitar owner_id, uid ou e-mail fornecidos livremente pelo cliente como identidade autenticada.
- Toda operação de leitura/gravação deve usar account_id derivado no servidor, inclusive manuscritos, perfil, Cowila e solicitações LGPD. **Não migrar workspaces/main nem mirrors/<email> sem inventário e backup verificado**.

## Falha de um ambiente
- Se Cloudflare falhar e Firebase estiver disponível, validar Firebase no próprio Firebase/Firestore Security Rules e gravar apenas na pasta autorizada ao usuário.
- Se Firebase falhar e Cloudflare estiver disponível, validar Cloudflare Access no Worker e persistir no D1 com isolamento por account_id.
- Não tentar reatribuir automaticamente documentos antigos baseados em e-mail. Não criar conta alternativa em falha de resolução de identidade.
- Se o registro central de vínculos estiver indisponível, somente sessões previamente vinculadas com evidência válida e autorização local verificável podem continuar gravando remotamente; novos vínculos aguardam recuperação. Não fazer confiança implícita em cache local de e-mail.

## Sem Internet
- Manter editor local-first, IndexedDB para manuscritos/backups e localStorage apenas para preferências/metadados pequenos. Exibir estado pendente de sincronização.
- Não executar pedidos LGPD, alteração de identidade ou exclusão offline; enfileirar apenas a intenção para revalidação online.
- Ao reconectar: revalidar token e account_id, verificar versão/sha, mesclar em três vias, preservar cópias de conflito e só confirmar sincronização depois do ACK remoto.
- Testar: duas identidades com mesmo e-mail mas subjects conflitantes; token expirado; Cloudflare offline; Firebase offline; ambos offline; reconexão e conflitos; troca de conta no mesmo navegador; limite de armazenamento.
