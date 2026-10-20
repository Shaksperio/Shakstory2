import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ADMIN_CONTACT, PLAN_CARDS, refreshPlan, usePlan } from "@/lib/plans";

/** Interface informativa: não apresenta exclusão/cancelamento como disponível antes do backend seguro. */
export default function AccountCenter() {
  const plan = usePlan();
  const [name, setName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileState, setProfileState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [requestKind, setRequestKind] = useState("access");
  const [typedDeletionName, setTypedDeletionName] = useState("");
  const [acknowledgeDeletion, setAcknowledgeDeletion] = useState(false);
  const [requestDetails, setRequestDetails] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestSending, setRequestSending] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/trpc/account.profile", { credentials: "same-origin" });
        if (!response.ok) throw new Error("Profile unavailable");
        const json = await response.json() as { result?: { data?: { json?: { name?: string; email?: string } } } };
        const profile = json.result?.data?.json;
        if (!profile) throw new Error("Profile unavailable");
        if (active) { setName(profile.name ?? ""); setProfileEmail(profile.email ?? ""); setProfileState("ready"); }
      } catch { if (active) setProfileState("unavailable"); }
    })();
    return () => { active = false; };
  }, []);
  const sendRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestKind === "delete" && (profileState !== "ready" || !name.trim() || typedDeletionName.trim() !== name.trim() || !acknowledgeDeletion)) {
      setRequestMessage("Para solicitar exclusão, confirme o nome exibido e reconheça as consequências.");
      return;
    }
    setRequestSending(true);
    setRequestMessage("");
    try {
      const response = await fetch("/api/trpc/account.request", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { kind: requestKind, details: requestDetails.trim() || undefined } }),
      });
      if (!response.ok) throw new Error("Request failed");
      setRequestMessage("Solicitação registrada para análise. Nenhuma mudança foi executada automaticamente.");
      setRequestDetails("");
    } catch { setRequestMessage("Não foi possível registrar a solicitação neste ambiente. Use o contato administrativo."); }
    finally { setRequestSending(false); }
  };
  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/trpc/account.updateProfile", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { name: name.trim() } }),
      });
      if (!response.ok) throw new Error("Update failed");
      setMessage("Nome atualizado com sucesso.");
    } catch { setMessage("Não foi possível atualizar seu nome. Confira sua sessão e tente novamente."); }
    finally { setSaving(false); }
  };
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
        {profileState === "loading" && <p>Carregando dados do perfil…</p>}
        {profileState === "unavailable" && <p>A edição do perfil não está disponível neste ambiente. Entre em contato com o suporte.</p>}
        {profileState === "ready" && <form onSubmit={saveProfile}>
          <label htmlFor="account-display-name">Nome de exibição</label>
          <input id="account-display-name" value={name} onChange={event => setName(event.target.value)} required maxLength={120} style={{ display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" }} />
          <p>E-mail verificado: <strong>{profileEmail || "Não informado"}</strong></p>
          <button type="submit" disabled={saving || !name.trim()}>{saving ? "Salvando…" : "Salvar nome"}</button>
          {message && <p role="status">{message}</p>}
        </form>}
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
      <section aria-labelledby="account-requests">
        <h2 id="account-requests">Registrar solicitação</h2>
        <p>O registro exige sessão autenticada e não altera plano, acesso ou dados automaticamente.</p>
        <form onSubmit={sendRequest}>
          <label htmlFor="account-request-kind">Tipo de solicitação</label>
          <select id="account-request-kind" value={requestKind} onChange={event => setRequestKind(event.target.value)} style={{ display: "block", marginBottom: "0.75rem" }}>
            <option value="access">Acesso aos meus dados</option>
            <option value="correction">Correção cadastral</option>
            <option value="export">Exportação de dados</option>
            <option value="privacy">Outros direitos LGPD</option>
            <option value="plan_change">Mudança de plano</option>
            <option value="cancel_plan">Cancelamento do plano</option>
            <option value="deactivate">Desativação da conta</option>
            <option value="delete">Exclusão da conta</option>
          </select>
          {requestKind === "delete" && <div role="group" aria-label="Confirmação de solicitação de exclusão">
            <p><strong>Atenção:</strong> este formulário registra apenas um pedido de análise; ele não apaga a conta ou manuscritos.</p>
            <label htmlFor="account-delete-name">Digite exatamente seu nome de exibição ({profileState === "ready" ? name : "perfil indisponível"})</label>
            <input id="account-delete-name" autoComplete="off" value={typedDeletionName} onChange={event => setTypedDeletionName(event.target.value)} required maxLength={120} style={{ display: "block", width: "100%", marginBottom: "0.75rem" }} />
            <label><input type="checkbox" checked={acknowledgeDeletion} onChange={event => setAcknowledgeDeletion(event.target.checked)} /> Entendo que a exclusão definitiva, quando implementada, poderá apagar meus manuscritos e será irreversível.</label>
          </div>}
          <label htmlFor="account-request-details">Detalhes (opcional)</label>
          <textarea id="account-request-details" value={requestDetails} onChange={event => setRequestDetails(event.target.value)} maxLength={2000} rows={3} style={{ display: "block", width: "100%", marginBottom: "0.75rem" }} />
          <button type="submit" disabled={requestSending || (requestKind === "delete" && (profileState !== "ready" || !name.trim() || typedDeletionName.trim() !== name.trim() || !acknowledgeDeletion))}>{requestSending ? "Registrando…" : "Registrar solicitação"}</button>
          {requestMessage && <p role="status">{requestMessage}</p>}
        </form>
      </section>
      <small>Esta página não executa cancelamento, desativação ou exclusão automaticamente.</small>
    </main>
  );
}
