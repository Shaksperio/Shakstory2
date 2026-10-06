import { createHmac } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerGitHubWebhookRoutes } from "./github-webhook";

const secret = process.env.GITHUB_WEBHOOK_SECRET;

describe("GitHub webhook", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    expect(secret, "GITHUB_WEBHOOK_SECRET não configurado").toBeTruthy();
    const app = express();
    registerGitHubWebhookRoutes(app);
    server = await new Promise<Server>(resolve => {
      const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de teste não iniciou");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("aceita uma assinatura válida no endpoint e rejeita uma inválida", async () => {
    const payload = JSON.stringify({ action: "ping", repository: { full_name: "Shaksperio/Shakstory" } });
    const signature = `sha256=${createHmac("sha256", secret!).update(payload).digest("hex")}`;
    const validResponse = await fetch(`${baseUrl}/api/github/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body: payload,
    });
    expect(validResponse.status).toBe(202);

    const invalidResponse = await fetch(`${baseUrl}/api/github/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=invalid" },
      body: payload,
    });
    expect(invalidResponse.status).toBe(401);
  });
});
