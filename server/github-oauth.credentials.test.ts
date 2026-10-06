import { describe, expect, it } from "vitest";

const credentialIt = process.env.RUN_GITHUB_CREDENTIAL_TESTS === "1" ? it : it.skip;

describe("GitHub OAuth credentials", () => {
  credentialIt("aceita o Client ID e o Client Secret configurados", async () => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    expect(clientId, "GITHUB_OAUTH_CLIENT_ID não configurado").toBeTruthy();
    expect(clientSecret, "GITHUB_OAUTH_CLIENT_SECRET não configurado").toBeTruthy();

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: "shakstory-credential-validation-only",
      }),
    });
    const payload = (await response.json()) as { error?: string };

    // Um código deliberadamente inválido deve falhar como código, não como credencial.
    expect(response.status).not.toBe(401);
    expect(payload.error).not.toBe("incorrect_client_credentials");
  }, 15000);
});
