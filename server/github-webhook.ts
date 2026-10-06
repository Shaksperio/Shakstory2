import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request } from "express";
import { recordWebhookEvent } from "./sync-state";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

type WebhookRequest = Request & { body: Buffer };

function hasValidSignature(request: WebhookRequest, secret: string) {
  const signature = request.header("x-hub-signature-256");
  if (!signature?.startsWith("sha256=") || !Buffer.isBuffer(request.body)) return false;

  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(request.body).digest("hex")}`);
  const received = Buffer.from(signature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function registerGitHubWebhookRoutes(app: Express) {
  app.post(
    "/api/github/webhook",
    express.raw({ type: "*/*", limit: MAX_WEBHOOK_BYTES }),
    (request, response) => {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        return response.status(503).json({ error: "Webhook não configurado." });
      }

      const webhookRequest = request as WebhookRequest;
      if (!hasValidSignature(webhookRequest, secret)) {
        return response.status(401).json({ error: "Assinatura de webhook inválida." });
      }

      const event = request.header("x-github-event") ?? "unknown";
      const deliveryId = request.header("x-github-delivery");
      recordWebhookEvent(event);
      console.info(`[GitHub webhook] Evento aceito: ${event}${deliveryId ? ` (${deliveryId})` : ""}`);

      // A confirmação é imediata para o GitHub; o processamento editorial assíncrono
      // poderá ser conectado ao repositório sem expor o token ao navegador.
      return response.status(202).json({ accepted: true, event });
    },
  );
}
