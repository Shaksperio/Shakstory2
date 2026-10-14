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
  if (CONTINGENCY || typeof fetch !== "function") return info;
  try {
    const response = await fetch("/api/me", { headers: { accept: "application/json" } });
    if (!response.ok) return info;
    const data = await response.json() as Partial<PlanInfo>;
    if (!data || typeof data.plan !== "string" || !data.features) return info;
    info = { ...FULL, ...data, features: { ...FULL.features, ...data.features } } as PlanInfo;
    emit();
  } catch { /* sem servidor: mantém tudo aberto */ }
  return info;
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
  if (!response.ok) throw new Error("Não foi possível listar as contas.");
  return ((await response.json()) as { users: never[] }).users;
}
export async function adminSetPlan(email: string, plan: string, days: number): Promise<void> {
  const response = await fetch("/api/admin/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, plan, days }) });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Não foi possível alterar o plano.");
}
