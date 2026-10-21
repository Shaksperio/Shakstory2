// Plano da conta no app. A verdade fica no servidor (/api/me e os bloqueios do Worker); aqui só se mostra e se evita
// trabalho inútil. Sem servidor (contingência, testes, offline) o app abre tudo: quem decide é o Worker.
import { useSyncExternalStore } from "react";
import { CONTINGENCY } from "./contingency";

export type Feature = "export" | "cowila" | "share";
export type PlanInfo = {
  email?: string;
  owner: boolean;
  legacy?: boolean;
  plan: string;
  label: string;
  daysLeft?: number | null;
  trialEndsAt?: string;
  paidUntil?: string | null;
  features: Record<Feature, boolean>;
  /** Direitos do catálogo do servidor (chave estável -> liberado). Ausente em servidores antigos. */
  entitlements?: Record<string, boolean>;
  catalogVersion?: number;
  cowilaDaily?: number;
  cowilaUsedToday?: number;
};

export const FEATURE_LABEL: Record<Feature, string> = { export: "Exportar o livro", cowila: "Cowila atendimento", share: "Tornar a leitura pública" };
/** Espelho de PLAN_DEFS em cloudflare-worker/plans.js, só para a tela de planos. */
export const PLAN_CARDS = [
  { id: "economico", label: "Econômico", features: ["Escrever e organizar sem limite", "Exportar PDF, EPUB, DOCX, TXT e HTML"] },
  { id: "premium", label: "Premium", features: ["Tudo do Econômico", "Cowila atendimento (até 100 mensagens por dia)"] },
  { id: "vip", label: "VIP", features: ["Tudo do Premium", "Cowila com limite ampliado (400 por dia)", "Leitura pública do livro"] },
] as const;
/** Valores mostrados na tela de planos, por mês (ex.: { economico: "R$ 9,90" }). Vazio = "consulte o administrador". */
export const PLAN_PRICES: Partial<Record<"economico" | "premium" | "vip", string>> = {};
export const ADMIN_CONTACT = "antonyopintor@gmail.com";

const FULL: PlanInfo = { owner: true, plan: "owner", label: "Administrador", features: { export: true, cowila: true, share: true } };
let info: PlanInfo = FULL;
let dialog: { open: boolean; reason?: Feature } = { open: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const currentPlan = () => info;
export const setPlanForTest = (next: PlanInfo | null) => { info = next ?? FULL; dialog = { open: false }; emit(); };

export async function refreshPlan(): Promise<PlanInfo> {
  if (typeof fetch !== "function") return info;
  try {
    let url = "/api/me";
    const headers: Record<string, string> = { accept: "application/json" };
    if (CONTINGENCY) {
      // GitHub Pages não tem servidor: o plano vem do Worker de contingência, com o token do Google/Firebase.
      const [{ CONTINGENCY_AI_URL }, { mirrorIdToken }] = await Promise.all([import("./trpc"), import("./mirror/firebase")]);
      url = CONTINGENCY_AI_URL + "/api/me";
      headers.authorization = "Bearer " + (await mirrorIdToken());
    }
    const response = await fetch(url, { headers });
    if (!response.ok) return info;
    const data = await response.json() as Partial<PlanInfo>;
    if (!data || typeof data.plan !== "string" || !data.features) return info;
    info = { ...FULL, ...data, features: { ...FULL.features, ...data.features } } as PlanInfo;
    emit();
  } catch { /* sem servidor: mantém tudo aberto */ }
  return info;
}

/** Como guard, mas relê o plano no servidor antes (o teste pode ter acabado com o app aberto). */
export async function guardFresh(feature: Feature): Promise<boolean> {
  await refreshPlan();
  return guard(feature);
}

/** Direito do catálogo (ex.: "export.pdf"). Servidor antigo sem catálogo: não restringe. Direitos locais são só oferta de interface; a imposição real está no servidor. */
export function hasEntitlement(key: string, plan: PlanInfo = info): boolean {
  return plan.entitlements ? plan.entitlements[key] !== false : true;
}

/** true se o plano libera o recurso; senão abre a tela de planos e devolve false. */
export function guard(feature: Feature): boolean {
  if (info.features[feature]) return true;
  dialog = { open: true, reason: feature };
  emit();
  return false;
}
export const openPlans = () => { dialog = { open: true }; emit(); };
export const closePlans = () => { dialog = { open: false }; emit(); };

export const usePlan = () => useSyncExternalStore(subscribe, () => info, () => info);
export const usePlansDialog = () => useSyncExternalStore(subscribe, () => dialog, () => dialog);

export async function adminUsers(): Promise<Array<{ email: string; plan: string; label: string; createdAt: string; daysLeft: number | null; paidUntil: string | null }>> {
  const response = await fetch("/api/admin/users");
  if (!response.ok) throw new Error(response.status === 404 ? "A rota de contas não está instalada no Worker principal (HTTP 404). Atualize o Worker antes de administrar assinaturas." : response.status === 401 || response.status === 403 ? "A sessão não tem autorização para listar contas. Verifique o acesso de administrador." : `Não foi possível listar as contas (HTTP ${response.status}).`);
  return ((await response.json()) as { users: never[] }).users;
}
export async function adminSetPlan(email: string, plan: string, days: number): Promise<void> {
  const response = await fetch("/api/admin/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, plan, days }) });
  if (!response.ok) throw new Error(response.status === 404 ? "A rota de alteração de planos não está instalada no Worker principal (HTTP 404). Nenhuma assinatura foi modificada." : response.status === 401 || response.status === 403 ? "Operação negada: é necessário acesso de administrador validado no servidor." : ((await response.json().catch(() => ({}))) as { error?: string }).error || `Não foi possível alterar o plano (HTTP ${response.status}).`);
}
