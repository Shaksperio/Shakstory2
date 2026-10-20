/**
 * Durable deletion request state machine for D1.
 * This module never deletes manuscripts, Firebase data or accounts.
 * The destructive executor must be a separate, explicitly gated deployment.
 */
export const DELETION_STATES = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  RETRY: "retry",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

export async function requestPermanentDeletion(db, { accountEmail, requestId, now = Date.now() }) {
  if (!db || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail || "") ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId || "") || !Number.isSafeInteger(now)) {
    return { ok: false, reason: "invalid_request" };
  }
  const email = accountEmail.toLowerCase();
  try {
    const account = await db.prepare("SELECT email FROM shak_users WHERE email = ? COLLATE NOCASE").bind(email).first();
    if (!account) return { ok: false, reason: "account_not_found" };
    await db.prepare(
      "INSERT OR IGNORE INTO shak_account_deletion_requests (request_id, account_email, status, created_at, updated_at, attempts) VALUES (?, ?, 'pending', ?, ?, 0)"
    ).bind(requestId, email, now, now).run();
    const row = await db.prepare(
      "SELECT request_id, account_email, status FROM shak_account_deletion_requests WHERE request_id = ?"
    ).bind(requestId).first();
    if (!row) {
      const existing = await db.prepare("SELECT request_id, status FROM shak_account_deletion_requests WHERE account_email = ? COLLATE NOCASE AND status IN ('pending', 'processing', 'retry') LIMIT 1").bind(email).first();
      if (existing) return { ok: true, requestId: existing.request_id, status: existing.status, deletionExecuted: false };
      return { ok: false, reason: "request_conflict" };
    }
    if (row.account_email.toLowerCase() !== email) return { ok: false, reason: "request_conflict" };
    return { ok: true, requestId: row.request_id, status: row.status, deletionExecuted: false };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

/** Cancellation is possible only before processing begins; no data is erased. */
export async function cancelPermanentDeletion(db, { accountEmail, requestId, now = Date.now() }) {
  if (!db || !accountEmail || !requestId || !Number.isSafeInteger(now)) return { ok: false, reason: "invalid_request" };
  try {
    const result = await db.prepare(
      "UPDATE shak_account_deletion_requests SET status = 'cancelled', updated_at = ? WHERE request_id = ? AND account_email = ? COLLATE NOCASE AND status = 'pending'"
    ).bind(now, requestId, accountEmail).run();
    return { ok: result.meta?.changes === 1, deletionExecuted: false };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

/** Fail closed: no processing transition until an audited executor is installed. */
export async function processPermanentDeletion() {
  return { ok: false, reason: "executor_disabled", deletionExecuted: false };
}
