import { describe, expect, it } from "vitest";

describe("GitHub repository token", () => {
  it("autentica na API do GitHub sem expor o token", async () => {
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
