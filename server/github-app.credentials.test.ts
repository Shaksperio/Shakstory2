import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SignJWT, importPKCS8 } from "jose";

describe.skip("GitHub App credentials (optional when App auth is enabled)", () => {
  it("autentica o App no endpoint leve /app sem expor credenciais", async () => {
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyPem = process.env.GITHUB_APP_PRIVATE_KEY;
    expect(appId, "GITHUB_APP_ID não configurado").toBeTruthy();
    expect(privateKeyPem, "GITHUB_APP_PRIVATE_KEY não configurado").toBeTruthy();

    const rsaKey = createPrivateKey({ key: privateKeyPem!, format: "pem" });
    const pkcs8Pem = rsaKey.export({ format: "pem", type: "pkcs8" }).toString();
    const privateKey = await importPKCS8(pkcs8Pem, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt(now - 30)
      .setExpirationTime(now + 540)
      .setIssuer(appId!)
      .sign(privateKey);

    const response = await fetch("https://api.github.com/app", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    expect(response.status).toBe(200);
  }, 15000);
});
