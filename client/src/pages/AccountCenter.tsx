import { useEffect } from "react";
import { Link } from "wouter";
import { ADMIN_CONTACT, PLAN_CARDS, currentPlan, refreshPlan, usePlan } from "@/lib/plans";

/** Interface informativa: não apresenta exclusão/cancelamento como disponível antes do backend seguro. */
export default function AccountCenter() {
  const plan = usePlan();
  useEffect(() => { void refreshPlan(); }, []);
  const contactSubject = encodeURIComponent("Shakstory — solicitação sobre minha conta");
  const contact = `mailto:${ADMIN_CONTACT}?subject=${contactSubject}`;
  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "2rem 1rem", lineHeight: 1.6 }}>
      <nav><Link href="/">← Voltar ao Shakstory</Link></nav>
      <h1>Minha conta</h1>
      <p>Consulte seu plano e saiba como solicitar alterações e exercer seus direitos de privacidade.</p>
      <section aria-labelledby="account-plan">
        <h2 id="account-plan">Plano e assinatura</h2>
        <p>Plano informado pelo servidor: <strong>{plan.label}</strong></p>
        {plan.email && <p>E-mail de acesso: <strong>{plan.email}</strong></p>}
        {plan.paidUntil && <p>Validade informada: {new Date(plan.paidUntil).toLocaleDateString("pt-BR")}</p>}
        <p>Pagamentos são confirmados manualmente pela Ton. Solicitações não alteram seu plano automaticamente.</p>
        <h3>Planos disponíveis</h3>
        <ul>{PLAN_CARDS.map(item => <li key={item.id}><strong>{item.label}</strong> — {item.features.join("; ")}</li>)}</ul>
        <p><a href={contact}>Solicitar mudança de plano ou cancelamento</a></p>
      </section>
      <section aria-labelledby="account-data">
        <h2 id="account-data">Dados cadastrais</h2>
        <p>O e-mail de acesso é gerenciado pelo provedor de identidade. Alterações cadastrais devem preservar a identidade verificada.</p>
        <p><a href={contact}>Solicitar correção de dados</a></p>
      </section>
      <section aria-labelledby="account-privacy">
        <h2 id="account-privacy">Privacidade e LGPD</h2>
        <p>Você pode solicitar acesso, correção, portabilidade quando aplicável, informações sobre o tratamento e eliminação dos dados nas hipóteses previstas na LGPD.</p>
        <p><a href={contact}>Solicitar acesso ou exportação de dados</a></p>
      </section>
      <section aria-labelledby="account-close">
        <h2 id="account-close">Desativar ou excluir conta</h2>
        <p>Desativação é temporária; exclusão é irreversível após conclusão, ressalvadas retenções legais. A janela proposta para reativação é de 30 dias, conforme política do serviço, não por exigência da LGPD.</p>
        <p>Por segurança, a exclusão automática ainda não está disponível: será exigida confirmação por e-mail e autenticação recente, sem solicitar sua senha Google ao Shakstory.</p>
        <p><a href={contact}>Solicitar atendimento para desativação ou exclusão</a></p>
      </section>
      <small>Esta página não executa cancelamento, desativação ou exclusão automaticamente.</small>
    </main>
  );
}
