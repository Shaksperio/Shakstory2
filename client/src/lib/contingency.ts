// Origem de contingência (GitHub Pages): não há API nem Cloudflare Access aqui. O editor trabalha no aparelho
// e grava direto no espelho do Firebase; ao voltar ao endereço principal, "Restaurar da cópia" mescla tudo.
export const CONTINGENCY = import.meta.env.VITE_CONTINGENCY === "1";

/** Administradores (mesma lista de firestore.rules e do Worker): pasta compartilhada workspaces/main e tudo liberado. Qualquer outro Google verificado entra com conta própria. */
export const ALLOWED_EMAILS = ["acpconsultorias@gmail.com", "antonyopintor@gmail.com"];
export const isOwnerEmail = (email?: string | null) => !!email && ALLOWED_EMAILS.indexOf(email.toLowerCase()) !== -1;
export const isAllowedEmail = isOwnerEmail;
