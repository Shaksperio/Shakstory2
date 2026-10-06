import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parse } from "cookie";
import { EncryptJWT } from "jose";
import type { Express, Request, Response } from "express";

const CALLBACK_URL = "https://shakstory-cpuxtpcc.manus.space/api/github/oauth/callback";
const OAUTH_COOKIE = "shakstory_github_oauth";
const SESSION_COOKIE = "shakstory_github_session";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

function oauthConfig() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GitHub OAuth não está configurado no servidor.");
  return { clientId, clientSecret };
}

function cookieSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não está configurado no servidor.");
  return createHash("sha256").update(secret).digest();
}

function base64Url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pkceChallenge(verifier: string) {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sealSession(payload: { accessToken: string; login: string; id: number }) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .encrypt(cookieSecret());
}

function setCookie(name: string, value: string, path: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearOAuthCookie(response: Response) {
  response.append("Set-Cookie", setCookie(OAUTH_COOKIE, "", "/api/github", 0));
}

export function registerGitHubOAuthRoutes(app: Express) {
  app.get("/api/github/oauth/start", (_request: Request, response: Response) => {
    try {
      const { clientId } = oauthConfig();
      const state = base64Url(randomBytes(32));
      const verifier = base64Url(randomBytes(48));
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: CALLBACK_URL,
        state,
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: "S256",
        scope: "repo",
        allow_signup: "false",
      });
      response.append("Set-Cookie", setCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier }), "/api/github", 600));
      response.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
    } catch {
      response.status(503).json({ error: "GitHub OAuth indisponível no momento." });
    }
  });

  app.get("/api/github/oauth/callback", async (request: Request, response: Response) => {
    const cookies = parse(request.headers.cookie ?? "");
    const oauthCookie = cookies[OAUTH_COOKIE];
    const returnedState = typeof request.query.state === "string" ? request.query.state : "";
    const code = typeof request.query.code === "string" ? request.query.code : "";
    if (!oauthCookie || !returnedState || !code) {
      return response.status(400).send("Autorização GitHub incompleta ou expirada.");
    }

    let stored: { state: string; verifier: string };
    try {
      stored = JSON.parse(oauthCookie) as { state: string; verifier: string };
    } catch {
      return response.status(400).send("Estado OAuth inválido.");
    }
    if (!stored.state || !stored.verifier || !safeEqual(stored.state, returnedState)) {
      return response.status(400).send("Falha de validação OAuth.");
    }

    try {
      const { clientId, clientSecret } = oauthConfig();
      const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: CALLBACK_URL, code_verifier: stored.verifier }),
      });
      const tokenPayload = (await tokenResponse.json()) as { access_token?: string; error?: string };
      if (!tokenResponse.ok || !tokenPayload.access_token) return response.status(400).send("O GitHub recusou a autorização.");

      const userResponse = await fetch(GITHUB_USER_URL, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tokenPayload.access_token}`, "X-GitHub-Api-Version": "2022-11-28" } });
      if (!userResponse.ok) return response.status(400).send("Não foi possível validar a identidade GitHub.");
      const user = (await userResponse.json()) as { id?: number; login?: string };
      if (!user.id || !user.login) return response.status(400).send("Resposta de identidade GitHub inválida.");

      const encryptedSession = await sealSession({ accessToken: tokenPayload.access_token, login: user.login, id: user.id });
      response.append("Set-Cookie", setCookie(SESSION_COOKIE, encryptedSession, "/", 60 * 60 * 24 * 30));
      clearOAuthCookie(response);
      return response.redirect(`/?github=connected&login=${encodeURIComponent(user.login)}`);
    } catch {
      clearOAuthCookie(response);
      return response.status(502).send("Não foi possível concluir a autorização GitHub.");
    }
  });
}

export const githubOAuthCallbackUrl = CALLBACK_URL;
