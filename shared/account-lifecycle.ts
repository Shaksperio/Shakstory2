/** Política de estados da conta. Não executa exclusões nem altera dados. */
export const ACCOUNT_REACTIVATION_DAYS = 30;
export const DELETION_LINK_TTL_MINUTES = 15;

export type AccountStatus = "active" | "deactivated" | "deletion_pending" | "deleted";

export interface AccountLifecycle {
  status: AccountStatus;
  deactivatedAt?: string | null;
  deletionRequestedAt?: string | null;
  deletedAt?: string | null;
}

/** O prazo de 30 dias é política do produto, não imposição da LGPD. */
export function canReactivate(account: AccountLifecycle, now = Date.now()): boolean {
  if (account.status !== "deactivated" || !account.deactivatedAt) return false;
  const started = Date.parse(account.deactivatedAt);
  return Number.isFinite(started) && now >= started &&
    now <= started + ACCOUNT_REACTIVATION_DAYS * 86400000;
}

export function canAccessAccount(account: AccountLifecycle): boolean {
  return account.status === "active";
}

export function canRequestDeletion(account: AccountLifecycle): boolean {
  return account.status === "active" || account.status === "deactivated";
}

export function deletionLinkValid(
  issuedAt: string,
  usedAt: string | null,
  now = Date.now(),
): boolean {
  const issued = Date.parse(issuedAt);
  return !usedAt && Number.isFinite(issued) && now >= issued &&
    now < issued + DELETION_LINK_TTL_MINUTES * 60000;
}
