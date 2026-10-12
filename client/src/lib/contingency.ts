// Origem de contingência (GitHub Pages): não há API nem Cloudflare Access aqui. O editor trabalha no aparelho
// e grava direto no espelho do Firebase; ao voltar ao endereço principal, "Restaurar da cópia" mescla tudo.
export const CONTINGENCY = import.meta.env.VITE_CONTINGENCY === "1";

/** Mesma lista de firestore.rules. Na contingência o app só abre para estes e-mails (e os dados só são lidos se as regras também aceitarem). */
export const ALLOWED_EMAILS = ["acpconsultorias@gmail.com", "antonyopintor@gmail.com"];
export const isAllowedEmail = (email?: string | null) => !!email && ALLOWED_EMAILS.indexOf(email.toLowerCase()) !== -1;
