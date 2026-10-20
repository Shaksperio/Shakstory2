/**
 * Worker D1 LGPD protocol routes.
 * Call handlePrivacyRequest(request, env, verifiedOwnerId) only after
 * the Worker has verified the Cloudflare Access JWT.
 * Never trust an identity header supplied by the browser.
 */
export async function handlePrivacyRequest(request, env, verifiedOwnerId) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/privacy/requests")) return null;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
  if (!verifiedOwnerId || typeof verifiedOwnerId !== "string") return json({ error: "Não autenticado" }, 401);
  if (!env.DB) return json({ error: "Serviço indisponível" }, 503);
  const base = "/api/privacy/requests";
  if (url.pathname === base && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!body || !["access", "correction", "portability", "processing_info"].includes(body.kind) ||
        typeof body.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey) ||
        (body.details != null && (typeof body.details !== "string" || body.details.length > 1500))) {
      return json({ error: "Solicitação inválida" }, 400);
    }
    const existing = await env.DB.prepare("SELECT id, status FROM privacy_requests WHERE owner_id = ? AND idempotency_key = ?")
      .bind(verifiedOwnerId, body.idempotencyKey).first();
    if (existing) return json({ protocol: existing.id, status: existing.status });
    const protocol = "LGPD-" + crypto.randomUUID();
    try {
      await env.DB.prepare("INSERT INTO privacy_requests (id, owner_id, kind, details, status, idempotency_key) VALUES (?, ?, ?, ?, 'received', ?)")
        .bind(protocol, verifiedOwnerId, body.kind, body.details?.trim() || null, body.idempotencyKey).run();
    } catch {
      const retry = await env.DB.prepare("SELECT id, status FROM privacy_requests WHERE owner_id = ? AND idempotency_key = ?")
        .bind(verifiedOwnerId, body.idempotencyKey).first();
      if (retry) return json({ protocol: retry.id, status: retry.status });
      return json({ error: "Não foi possível registrar o pedido" }, 503);
    }
    return json({ protocol, status: "received" }, 201);
  }
  if (url.pathname === base && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id AS protocol, kind, status, created_at AS createdAt, updated_at AS updatedAt FROM privacy_requests WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50")
      .bind(verifiedOwnerId).all();
    return json({ requests: rows.results || [] });
  }
  if (url.pathname.startsWith(base + "/") && request.method === "GET") {
    const protocol = decodeURIComponent(url.pathname.slice(base.length + 1));
    if (protocol.length > 64 || !protocol.startsWith("LGPD-")) return json({ error: "Não encontrado" }, 404);
    const row = await env.DB.prepare("SELECT id AS protocol, kind, status, created_at AS createdAt, updated_at AS updatedAt FROM privacy_requests WHERE owner_id = ? AND id = ?")
      .bind(verifiedOwnerId, protocol).first();
    return row ? json(row) : json({ error: "Não encontrado" }, 404);
  }
  return json({ error: "Método não permitido" }, 405);
}
