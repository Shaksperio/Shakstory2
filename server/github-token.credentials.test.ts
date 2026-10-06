import { describe, expect, it } from "vitest";

const credentialIt = process.env.RUN_GITHUB_CREDENTIAL_TESTS === "1" ? it : it.skip;

describe("GitHub repository token", () => {
  credentialIt("autentica na API do GitHub sem expor o token", async () => {
    const token = process.env.GITHUB_TOKEN;
    expect(token, "GITHUB_TOKEN não configurado").toBeTruthy();
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    expect(response.status).toBe(200);
  }, 15000);
});
