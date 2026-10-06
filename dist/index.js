// server/_core/index.ts
import "dotenv/config";
import express3 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var antivirusSessions = mysqlTable("antivirus_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  tokenPrefix: varchar("tokenPrefix", { length: 24 }).notNull(),
  sessionFingerprint: varchar("sessionFingerprint", { length: 128 }).notNull(),
  projectBaseUrl: varchar("projectBaseUrl", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt")
});
var antivirusScans = mysqlTable("antivirus_scans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  filename: varchar("filename", { length: 160 }).notNull(),
  sha256: varchar("sha256", { length: 64 }),
  status: mysqlEnum("status", ["clean", "infected", "error", "timeout", "pending"]).notNull(),
  malwareName: varchar("malwareName", { length: 255 }),
  detail: text("detail"),
  engine: varchar("engine", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function recordAntivirusScan(input) {
  const db = await getDb();
  if (!db) return;
  await db.insert(antivirusScans).values({
    userId: input.userId,
    filename: input.filename,
    sha256: input.sha256,
    status: input.status,
    malwareName: input.malwareName,
    detail: input.detail,
    engine: input.engine
  });
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/github-oauth.ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parse } from "cookie";
import { EncryptJWT } from "jose";
var CALLBACK_URL = "https://shakstory-cpuxtpcc.manus.space/api/github/oauth/callback";
var OAUTH_COOKIE = "shakstory_github_oauth";
var SESSION_COOKIE = "shakstory_github_session";
var GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
var GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
var GITHUB_USER_URL = "https://api.github.com/user";
function oauthConfig() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GitHub OAuth n\xE3o est\xE1 configurado no servidor.");
  return { clientId, clientSecret };
}
function cookieSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET n\xE3o est\xE1 configurado no servidor.");
  return createHash("sha256").update(secret).digest();
}
function base64Url(value) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function pkceChallenge(verifier) {
  return base64Url(createHash("sha256").update(verifier).digest());
}
function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function sealSession(payload) {
  return new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime("30d").encrypt(cookieSecret());
}
function setCookie(name, value, path3, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=${path3}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function clearOAuthCookie(response) {
  response.append("Set-Cookie", setCookie(OAUTH_COOKIE, "", "/api/github", 0));
}
function registerGitHubOAuthRoutes(app) {
  app.get("/api/github/oauth/start", (_request, response) => {
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
        allow_signup: "false"
      });
      response.append("Set-Cookie", setCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier }), "/api/github", 600));
      response.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
    } catch {
      response.status(503).json({ error: "GitHub OAuth indispon\xEDvel no momento." });
    }
  });
  app.get("/api/github/oauth/callback", async (request2, response) => {
    const cookies = parse(request2.headers.cookie ?? "");
    const oauthCookie = cookies[OAUTH_COOKIE];
    const returnedState = typeof request2.query.state === "string" ? request2.query.state : "";
    const code = typeof request2.query.code === "string" ? request2.query.code : "";
    if (!oauthCookie || !returnedState || !code) {
      return response.status(400).send("Autoriza\xE7\xE3o GitHub incompleta ou expirada.");
    }
    let stored;
    try {
      stored = JSON.parse(oauthCookie);
    } catch {
      return response.status(400).send("Estado OAuth inv\xE1lido.");
    }
    if (!stored.state || !stored.verifier || !safeEqual(stored.state, returnedState)) {
      return response.status(400).send("Falha de valida\xE7\xE3o OAuth.");
    }
    try {
      const { clientId, clientSecret } = oauthConfig();
      const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: CALLBACK_URL, code_verifier: stored.verifier })
      });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenPayload.access_token) return response.status(400).send("O GitHub recusou a autoriza\xE7\xE3o.");
      const userResponse = await fetch(GITHUB_USER_URL, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tokenPayload.access_token}`, "X-GitHub-Api-Version": "2022-11-28" } });
      if (!userResponse.ok) return response.status(400).send("N\xE3o foi poss\xEDvel validar a identidade GitHub.");
      const user = await userResponse.json();
      if (!user.id || !user.login) return response.status(400).send("Resposta de identidade GitHub inv\xE1lida.");
      const encryptedSession = await sealSession({ accessToken: tokenPayload.access_token, login: user.login, id: user.id });
      response.append("Set-Cookie", setCookie(SESSION_COOKIE, encryptedSession, "/", 60 * 60 * 24 * 30));
      clearOAuthCookie(response);
      return response.redirect(`/?github=connected&login=${encodeURIComponent(user.login)}`);
    } catch {
      clearOAuthCookie(response);
      return response.status(502).send("N\xE3o foi poss\xEDvel concluir a autoriza\xE7\xE3o GitHub.");
    }
  });
}

// server/github-webhook.ts
import { createHmac, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import express from "express";

// server/sync-state.ts
var snapshot = {
  status: "idle",
  lastSyncAt: null,
  lastWebhookAt: null,
  lastWebhookEvent: null,
  lastConflictPath: null,
  lastError: null
};
function getSyncSnapshot() {
  return { ...snapshot };
}
function markSyncStarted() {
  snapshot.status = "syncing";
  snapshot.lastError = null;
}
function markSyncSucceeded() {
  snapshot.status = "synced";
  snapshot.lastSyncAt = Date.now();
  snapshot.lastConflictPath = null;
  snapshot.lastError = null;
}
function markSyncConflict(path3) {
  snapshot.status = "conflict";
  snapshot.lastConflictPath = path3;
  snapshot.lastError = "O documento mudou no GitHub antes do salvamento.";
}
function markSyncFailed(error) {
  snapshot.status = "error";
  snapshot.lastError = error instanceof Error ? error.message : "Falha de sincroniza\xE7\xE3o.";
}
function recordWebhookEvent(event) {
  snapshot.lastWebhookAt = Date.now();
  snapshot.lastWebhookEvent = event;
}

// server/github-webhook.ts
var MAX_WEBHOOK_BYTES = 1024 * 1024;
function hasValidSignature(request2, secret) {
  const signature = request2.header("x-hub-signature-256");
  if (!signature?.startsWith("sha256=") || !Buffer.isBuffer(request2.body)) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(request2.body).digest("hex")}`);
  const received = Buffer.from(signature);
  return received.length === expected.length && timingSafeEqual2(received, expected);
}
function registerGitHubWebhookRoutes(app) {
  app.post(
    "/api/github/webhook",
    express.raw({ type: "*/*", limit: MAX_WEBHOOK_BYTES }),
    (request2, response) => {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        return response.status(503).json({ error: "Webhook n\xE3o configurado." });
      }
      const webhookRequest = request2;
      if (!hasValidSignature(webhookRequest, secret)) {
        return response.status(401).json({ error: "Assinatura de webhook inv\xE1lida." });
      }
      const event = request2.header("x-github-event") ?? "unknown";
      const deliveryId = request2.header("x-github-delivery");
      recordWebhookEvent(event);
      console.info(`[GitHub webhook] Evento aceito: ${event}${deliveryId ? ` (${deliveryId})` : ""}`);
      return response.status(202).json({ accepted: true, event });
    }
  );
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z3 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/data-access.ts
import { resolve } from "node:path";

// backend/src/repositories/types.ts
var RepositoryConflictError = class extends Error {
  constructor(documentPath2, message = "O documento foi alterado por outra sess\xE3o.") {
    super(message);
    this.documentPath = documentPath2;
    this.name = "RepositoryConflictError";
  }
};

// backend/src/repositories/github-json-repository.ts
function encodePath(documentPath2) {
  return documentPath2.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
var GitHubJsonRepository = class {
  constructor(options) {
    this.options = options;
    this.branch = options.branch ?? "main";
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }
  branch;
  apiBaseUrl;
  url(documentPath2) {
    return `${this.apiBaseUrl}/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repository)}/contents/${encodePath(documentPath2)}`;
  }
  headers() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.options.token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  async get(documentPath2) {
    const response = await fetch(`${this.url(documentPath2)}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub n\xE3o p\xF4de ler o documento (${response.status}).`);
    const payload = await response.json();
    if (!payload.content || !payload.sha) throw new Error("Resposta inv\xE1lida do GitHub para documento JSON.");
    const normalized = payload.content.replace(/\n/g, "");
    return { data: JSON.parse(Buffer.from(normalized, "base64").toString("utf8")), sha: payload.sha };
  }
  async put(documentPath2, document, expectedSha) {
    const current = await this.get(documentPath2);
    if (expectedSha !== void 0 && current?.sha !== expectedSha) {
      throw new RepositoryConflictError(documentPath2);
    }
    const raw = `${JSON.stringify(document, null, 2)}
`;
    const response = await fetch(this.url(documentPath2), {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore(data): sincronizar ${documentPath2}`,
        content: Buffer.from(raw, "utf8").toString("base64"),
        branch: this.branch,
        ...current?.sha ? { sha: current.sha } : {}
      })
    });
    if (response.status === 409 || response.status === 422) throw new RepositoryConflictError(documentPath2);
    if (!response.ok) throw new Error(`GitHub n\xE3o p\xF4de gravar o documento (${response.status}).`);
    const payload = await response.json();
    return { data: document, sha: payload.content?.sha };
  }
};
function githubRepositoryFromEnvironment() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repository2 = process.env.GITHUB_REPOSITORY;
  if (!token || !owner || !repository2) return null;
  return new GitHubJsonRepository({ token, owner, repository: repository2, branch: process.env.GITHUB_BRANCH });
}

// backend/src/repositories/json-file-repository.ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
function safePath(rootDirectory, documentPath2) {
  if (!documentPath2 || isAbsolute(documentPath2)) throw new Error("Caminho de documento inv\xE1lido.");
  const resolvedRoot = normalize(rootDirectory);
  const resolvedDocument = normalize(join(resolvedRoot, documentPath2));
  const relativeDocument = relative(resolvedRoot, resolvedDocument);
  if (relativeDocument.startsWith("..") || isAbsolute(relativeDocument)) {
    throw new Error("Caminho de documento fora da base permitida.");
  }
  return resolvedDocument;
}
var JsonFileRepository = class {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
  }
  async get(documentPath2) {
    const filePath = safePath(this.rootDirectory, documentPath2);
    try {
      const [raw, metadata] = await Promise.all([readFile(filePath, "utf8"), readFile(`${filePath}.sha`, "utf8").catch(() => "")]);
      return { data: JSON.parse(raw), sha: metadata || void 0 };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async put(documentPath2, document, expectedSha) {
    const filePath = safePath(this.rootDirectory, documentPath2);
    const current = await this.get(documentPath2);
    if (expectedSha !== void 0 && current?.sha !== expectedSha) {
      throw new Error("Conflito de vers\xE3o no documento JSON.");
    }
    const raw = `${JSON.stringify(document, null, 2)}
`;
    const sha = await sha256(raw);
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, raw, { encoding: "utf8", mode: 384 });
    await rename(temporaryPath, filePath);
    await writeFile(`${filePath}.sha`, sha, { encoding: "utf8", mode: 384 });
    return { data: document, sha };
  }
};
async function sha256(value) {
  const { createHash: createHash3 } = await import("node:crypto");
  return createHash3("sha256").update(value).digest("hex");
}

// server/data-access.ts
var repository = null;
function getEditorialRepository() {
  if (repository) return repository;
  repository = githubRepositoryFromEnvironment() ?? new JsonFileRepository(resolve(process.env.SHAKSTORY_DATA_DIR ?? "data"));
  return repository;
}
function getEditorialRepositoryMode() {
  return process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPOSITORY ? "github" : "json";
}

// server/literary-analysis.ts
import { z as z2 } from "zod";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
function parseJsonResponseBody(body, contentType, label) {
  const normalized = body.trim();
  if (normalized.startsWith("<") || contentType.includes("text/html")) {
    throw new Error(`${label} retornou HTML em vez de JSON (content-type: ${contentType || "desconhecido"}).`);
  }
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error(`${label} retornou um corpo que n\xE3o \xE9 JSON v\xE1lido.`);
  }
}
async function readJsonResponse(response, label) {
  return parseJsonResponseBody(await response.text(), response.headers.get("content-type") ?? "", label);
}
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return readJsonResponse(response, "O gateway LLM");
}
async function listLLMModels() {
  assertApiKey();
  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models` : "https://forge.manus.im/v1/models";
  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return readJsonResponse(response, "O cat\xE1logo LLM");
}

// server/omniroute.ts
var getBaseUrl = () => {
  const raw = (process.env.OMNIROUTE_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("OMNIROUTE_BASE_URL precisa ser uma URL v\xE1lida.");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("OMNIROUTE_BASE_URL deve usar HTTPS em produ\xE7\xE3o.");
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("OMNIROUTE_BASE_URL deve usar http ou https.");
  return raw;
};
var isOmniRouteConfigured = () => Boolean(getBaseUrl());
var headers = () => ({
  "content-type": "application/json",
  ...process.env.OMNIROUTE_API_KEY ? { authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` } : {}
});
async function request(path3, init) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("OmniRoute n\xE3o est\xE1 configurado.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12e3);
  try {
    const response = await fetch(`${baseUrl}${path3}`, { ...init, headers: { ...headers(), ...init?.headers ?? {} }, signal: controller.signal });
    if (!response.ok) throw new Error(`OmniRoute respondeu HTTP ${response.status}.`);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OmniRoute excedeu o tempo limite.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function readJson(response) {
  if (typeof response.text !== "function") return response.json();
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (bodyText.trimStart().startsWith("<") || !contentType.toLowerCase().includes("json")) throw new Error("OmniRoute retornou HTML ou uma resposta n\xE3o-JSON; verifique a URL p\xFAblica do gateway.");
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("OmniRoute retornou JSON inv\xE1lido.");
  }
}
async function listOmniRouteModels() {
  const response = await request("/models");
  const body = await readJson(response);
  return { data: (body.data ?? []).filter((model) => typeof model.id === "string" && model.id.length > 0) };
}
async function invokeOmniRouteLLM(input) {
  const response = await request("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: input.model ?? "auto", messages: input.messages, response_format: input.response_format, max_tokens: input.maxTokens })
  });
  const body = await readJson(response);
  if (!body.choices?.[0]?.message?.content) throw new Error("OmniRoute retornou uma resposta sem conte\xFAdo.");
  return { model: body.model ?? input.model ?? "auto", choices: body.choices };
}

// server/literary-analysis.ts
var literaryFocusSchema = z2.enum([
  "language",
  "grammar",
  "parts_of_speech",
  "lexicon",
  "narrative",
  "voice",
  "style",
  "full"
]);
var literaryAnalysisInputSchema = z2.object({
  text: z2.string().trim().min(1, "Escreva algum texto antes de analisar.").max(14e3, "Analise um trecho de at\xE9 14.000 caracteres."),
  focus: literaryFocusSchema.default("full"),
  model: z2.string().trim().min(1).max(120).optional(),
  language: z2.string().trim().min(2).max(40).default("pt-BR")
});
var suggestionSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["ortografia", "gramatica", "classe_gramatical", "lexico", "narrativa", "voz", "estilo"] },
    severity: { type: "string", enum: ["erro_provavel", "revisar", "observacao"] },
    original: { type: "string" },
    suggestion: { type: "string" },
    explanation: { type: "string" },
    confidence: { type: "number" },
    start: { type: "integer", minimum: 0 },
    end: { type: "integer", minimum: 0 }
  },
  required: ["category", "severity", "original", "suggestion", "explanation", "confidence", "start", "end"],
  additionalProperties: false
};
var literaryAnalysisResponseSchema = z2.object({
  summary: z2.string(),
  strengths: z2.array(z2.string()).max(8),
  suggestions: z2.array(z2.object({
    category: z2.enum(["ortografia", "gramatica", "classe_gramatical", "lexico", "narrativa", "voz", "estilo"]),
    severity: z2.enum(["erro_provavel", "revisar", "observacao"]),
    original: z2.string(),
    suggestion: z2.string(),
    explanation: z2.string(),
    confidence: z2.number().min(0).max(1),
    start: z2.number().int().min(0),
    end: z2.number().int().min(0)
  })).max(40),
  narrativeNotes: z2.array(z2.string()).max(8),
  model: z2.string()
});
var focusInstructions = {
  language: "Priorize ortografia, acentua\xE7\xE3o, pontua\xE7\xE3o e clareza sem apagar escolhas estil\xEDsticas deliberadas.",
  grammar: "Priorize concord\xE2ncia, reg\xEAncia, coloca\xE7\xE3o, tempos verbais, verbos, pronomes, artigos e preposi\xE7\xF5es.",
  parts_of_speech: "Identifique usos relevantes de verbos, pronomes, artigos, preposi\xE7\xF5es, substantivos e adjetivos, apontando apenas casos \xFAteis para edi\xE7\xE3o.",
  lexicon: "Priorize repeti\xE7\xF5es, palavras semelhantes, precis\xE3o vocabular e sin\xF4nimos que preservem sentido, registro e voz.",
  narrative: "Analise coer\xEAncia, foco narrativo, ritmo, continuidade, tens\xE3o, cena e transi\xE7\xF5es; n\xE3o reescreva a hist\xF3ria pelo autor.",
  voice: "Analise tom de voz, dist\xE2ncia narrativa, perspectiva, consist\xEAncia e efeito no leitor; trate prefer\xEAncia como observa\xE7\xE3o, n\xE3o erro.",
  style: "Analise estilo, cad\xEAncia, imagens, densidade, registro e marcas autorais; ofere\xE7a alternativas somente quando agregarem clareza ou efeito.",
  full: "Fa\xE7a uma revis\xE3o equilibrada de linguagem, gram\xE1tica, classes gramaticais, l\xE9xico, narrativa, voz e estilo."
};
var responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 8 },
    suggestions: { type: "array", items: suggestionSchema, maxItems: 40 },
    narrativeNotes: { type: "array", items: { type: "string" }, maxItems: 8 }
  },
  required: ["summary", "strengths", "suggestions", "narrativeNotes"],
  additionalProperties: false
};
var extractText = (content) => Array.isArray(content) ? content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") : content;
function parseStructuredResponse(raw) {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!normalized) throw new Error("A IA retornou uma resposta vazia.");
  if (normalized.startsWith("<")) throw new Error("O provedor da IA retornou HTML em vez de JSON; verifique o endpoint e a autentica\xE7\xE3o.");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error("A IA retornou conte\xFAdo que n\xE3o \xE9 JSON estruturado.");
  }
}
async function listLiteraryModels() {
  return isOmniRouteConfigured() ? listOmniRouteModels() : listLLMModels();
}
async function analyzeLiteraryText(input) {
  const catalog = await listLiteraryModels();
  const available = new Set(catalog.data.map((model) => model.id));
  const selectedModel = input.model && available.has(input.model) ? input.model : void 0;
  const request2 = {
    ...selectedModel ? { model: selectedModel } : {},
    messages: [
      {
        role: "system",
        content: `Voc\xEA \xE9 uma editora liter\xE1ria brasileira, rigorosa e respeitosa \xE0 autoria. Responda somente em JSON conforme o schema. O idioma do trecho \xE9 ${input.language}. ${focusInstructions[input.focus]} Diferencie erro verific\xE1vel de prefer\xEAncia editorial. Nunca invente regra, n\xE3o elogie de forma gen\xE9rica e n\xE3o proponha mudan\xE7as que alterem fatos, personagens ou inten\xE7\xE3o sem explicar o risco. O campo original deve ser uma sequ\xEAncia literal encontrada no trecho, exceto quando a sugest\xE3o for uma observa\xE7\xE3o sem substitui\xE7\xE3o; nesse caso use uma string vazia. Informe start e end como offsets UTF-16 do trecho original; para observa\xE7\xF5es sem substitui\xE7\xE3o, use start=0 e end=0. A confian\xE7a deve ficar entre 0 e 1.`
      },
      { role: "user", content: `Analise o trecho abaixo. N\xE3o o reescreva integralmente e n\xE3o aplique altera\xE7\xF5es.

${input.text}` }
    ],
    response_format: { type: "json_schema", json_schema: { name: "literary_analysis", strict: true, schema: responseSchema } },
    maxTokens: 5e3
  };
  const response = isOmniRouteConfigured() ? await invokeOmniRouteLLM(request2) : await invokeLLM(request2);
  const raw = extractText(response.choices[0]?.message?.content ?? "");
  const parsed = literaryAnalysisResponseSchema.parse({ ...parseStructuredResponse(raw), model: response.model });
  const safeSuggestions = parsed.suggestions.filter((item) => {
    if (!item.original) return item.start === 0 && item.end === 0;
    return item.start >= 0 && item.end > item.start && input.text.slice(item.start, item.end) === item.original;
  });
  return { ...parsed, suggestions: safeSuggestions, availableModels: catalog.data.map((model) => model.id) };
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/antivirus.ts
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
var MAX_SCAN_BYTES = 8 * 1024 * 1024;
var SCAN_TIMEOUT_MS = 2e4;
function normalizeStatus(value) {
  if (value === "clean" || value === "infected" || value === "timeout" || value === "pending") return value;
  return "error";
}
async function scanWithLocalKicomAV(input) {
  if (input.bytes.length === 0) {
    return { status: "error", detail: "Arquivo vazio.", engine: "kicomav-local" };
  }
  if (input.bytes.length > MAX_SCAN_BYTES) {
    return { status: "error", detail: "Arquivo acima do limite de varredura.", engine: "kicomav-local" };
  }
  const request2 = JSON.stringify({
    id: randomUUID(),
    filename: input.filename,
    contentType: input.contentType,
    base64: input.bytes.toString("base64")
  });
  try {
    const stdout = await runWorker(request2);
    const result = JSON.parse(stdout.trim());
    return {
      status: normalizeStatus(result.status),
      malwareName: typeof result.malwareName === "string" ? result.malwareName : void 0,
      sha256: typeof result.sha256 === "string" ? result.sha256 : void 0,
      detail: typeof result.detail === "string" ? result.detail : void 0,
      engine: "kicomav-local"
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "killed" in error && Boolean(error.killed);
    return {
      status: timedOut ? "timeout" : "error",
      detail: timedOut ? "A varredura excedeu o tempo limite." : error instanceof Error ? error.message : "Worker KicomAV indispon\xEDvel.",
      engine: "kicomav-local"
    };
  }
}
function runWorker(request2) {
  return new Promise((resolve2, reject) => {
    const pythonBin = process.env.KICOMAV_PYTHON ?? "python3";
    const workerScript = process.env.KICOMAV_WORKER_SCRIPT ?? "scripts/kicomav_worker.py";
    const child = spawn(pythonBin, [workerScript], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), SCAN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 256 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 32 * 1024) child.kill("SIGKILL");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve2(stdout);
      else reject(new Error(stderr.trim() || `Worker finalizado com c\xF3digo ${code ?? "desconhecido"}.`));
    });
    child.stdin.end(request2);
  });
}
function isSafeToPersist(result) {
  return result.status === "clean";
}

// server/antivirus-sessions.ts
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { and, desc, eq as eq2, isNull } from "drizzle-orm";
function hashSecret(secret) {
  return createHash2("sha256").update(secret).digest("hex");
}
function createProjectBaseUrl(req) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || "localhost";
  return `${forwardedProto || req.protocol}://${host}`;
}
function fingerprintSession(cookieHeader) {
  return hashSecret(cookieHeader || "anonymous-session");
}
function toReport(row) {
  return {
    id: row.id,
    tokenPrefix: row.tokenPrefix,
    projectBaseUrl: row.projectBaseUrl,
    status: row.status,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null
  };
}
async function ensureAntivirusSession(input) {
  const db = await getDb();
  if (!db) return null;
  const existing = await db.select().from(antivirusSessions).where(and(eq2(antivirusSessions.userId, input.userId), eq2(antivirusSessions.sessionFingerprint, input.sessionFingerprint), eq2(antivirusSessions.status, "active"))).orderBy(desc(antivirusSessions.createdAt)).limit(1);
  if (existing[0]) {
    await db.update(antivirusSessions).set({ lastUsedAt: /* @__PURE__ */ new Date(), projectBaseUrl: input.projectBaseUrl }).where(eq2(antivirusSessions.id, existing[0].id));
    return { ...toReport(existing[0]), lastUsedAt: /* @__PURE__ */ new Date(), projectBaseUrl: input.projectBaseUrl };
  }
  const secret = randomBytes2(32).toString("base64url");
  const inserted = await db.insert(antivirusSessions).values({
    userId: input.userId,
    tokenHash: hashSecret(secret),
    tokenPrefix: secret.slice(0, 10),
    sessionFingerprint: input.sessionFingerprint,
    projectBaseUrl: input.projectBaseUrl,
    status: "active",
    lastUsedAt: /* @__PURE__ */ new Date()
  });
  const id = Number(inserted[0].insertId);
  const created = await db.select().from(antivirusSessions).where(eq2(antivirusSessions.id, id)).limit(1);
  return created[0] ? toReport(created[0]) : null;
}
async function listAntivirusSessions(userId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(antivirusSessions).where(eq2(antivirusSessions.userId, userId)).orderBy(desc(antivirusSessions.createdAt));
  return rows.map(toReport);
}
async function revokeAntivirusSession(userId, id) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(antivirusSessions).set({ status: "revoked", revokedAt: /* @__PURE__ */ new Date() }).where(and(eq2(antivirusSessions.id, id), eq2(antivirusSessions.userId, userId), eq2(antivirusSessions.status, "active")));
  return Number(result[0].affectedRows ?? 0) > 0;
}
async function rotateAntivirusSessions(userId, projectBaseUrl) {
  const db = await getDb();
  if (!db) return null;
  await db.update(antivirusSessions).set({ status: "revoked", revokedAt: /* @__PURE__ */ new Date() }).where(and(eq2(antivirusSessions.userId, userId), eq2(antivirusSessions.status, "active"), isNull(antivirusSessions.revokedAt)));
  const secret = randomBytes2(32).toString("base64url");
  await db.insert(antivirusSessions).values({
    userId,
    tokenHash: hashSecret(secret),
    tokenPrefix: secret.slice(0, 10),
    sessionFingerprint: `manual-rotation-${Date.now()}`,
    projectBaseUrl,
    status: "active",
    lastUsedAt: /* @__PURE__ */ new Date()
  });
  const rows = await db.select().from(antivirusSessions).where(and(eq2(antivirusSessions.userId, userId), eq2(antivirusSessions.tokenPrefix, secret.slice(0, 10)))).orderBy(desc(antivirusSessions.createdAt)).limit(1);
  return rows[0] ? toReport(rows[0]) : null;
}

// server/routers.ts
var documentPath = z3.string().regex(/^[a-z0-9][a-z0-9/_-]*\.json$/i, "Caminho de documento inv\xE1lido.");
var scopedPath = (ownerId, path3) => `authors/${ownerId}/${path3}`;
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (opts.ctx.user) {
        try {
          await ensureAntivirusSession({
            userId: opts.ctx.user.id,
            sessionFingerprint: fingerprintSession(opts.ctx.req.headers.cookie),
            projectBaseUrl: createProjectBaseUrl(opts.ctx.req)
          });
        } catch (error) {
          console.error("[Antivirus] N\xE3o foi poss\xEDvel registrar a sess\xE3o sem bloquear o login:", error);
        }
      }
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  security: router({
    antivirus: router({
      sessions: protectedProcedure.query(({ ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError3({ code: "FORBIDDEN", message: "O relat\xF3rio antiv\xEDrus \xE9 exclusivo do propriet\xE1rio." });
        return listAntivirusSessions(ctx.user.id);
      }),
      revoke: protectedProcedure.input(z3.object({ id: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError3({ code: "FORBIDDEN", message: "Somente o propriet\xE1rio pode gerenciar credenciais antiv\xEDrus." });
        return { revoked: await revokeAntivirusSession(ctx.user.id, input.id) };
      }),
      rotate: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError3({ code: "FORBIDDEN", message: "Somente o propriet\xE1rio pode renovar credenciais antiv\xEDrus." });
        return rotateAntivirusSessions(ctx.user.id, createProjectBaseUrl(ctx.req));
      })
    })
  }),
  literaryAssist: router({
    models: protectedProcedure.query(async () => {
      const result = await listLiteraryModels();
      return { models: result.data };
    }),
    analyze: protectedProcedure.input(literaryAnalysisInputSchema).mutation(async ({ input }) => {
      try {
        return await analyzeLiteraryText(input);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_GATEWAY", message: error instanceof Error ? `A assessoria liter\xE1ria n\xE3o respondeu: ${error.message}` : "A assessoria liter\xE1ria n\xE3o respondeu." });
      }
    })
  }),
  assets: router({
    uploadCover: protectedProcedure.input(z3.object({ filename: z3.string().regex(/^[a-zA-Z0-9._-]+$/).max(120), contentType: z3.enum(["image/jpeg", "image/png", "image/webp"]), base64: z3.string().min(1).max(12e6) })).mutation(async ({ ctx, input }) => {
      try {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.length > 8 * 1024 * 1024) throw new Error("A capa deve ter no m\xE1ximo 8 MB.");
        const scan = await scanWithLocalKicomAV({ bytes, filename: input.filename, contentType: input.contentType });
        await recordAntivirusScan({ userId: ctx.user.id, filename: input.filename, sha256: scan.sha256, status: scan.status, malwareName: scan.malwareName, detail: scan.detail, engine: scan.engine });
        if (!isSafeToPersist(scan)) {
          throw new Error(scan.status === "infected" ? `A capa foi colocada em quarentena: ${scan.malwareName ?? "amea\xE7a detectada"}.` : `A capa n\xE3o foi armazenada porque a verifica\xE7\xE3o antiv\xEDrus falhou (${scan.status}).`);
        }
        return await storagePut(`authors/${ctx.user.id}/covers/${input.filename}`, bytes, input.contentType);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_GATEWAY", message: error instanceof Error ? `N\xE3o foi poss\xEDvel armazenar a capa: ${error.message}` : "N\xE3o foi poss\xEDvel armazenar a capa." });
      }
    })
  }),
  data: router({
    status: protectedProcedure.query(() => ({ mode: getEditorialRepositoryMode(), versioned: true, ...getSyncSnapshot() })),
    get: protectedProcedure.input(z3.object({ path: documentPath })).query(
      ({ ctx, input }) => getEditorialRepository().get(scopedPath(ctx.user.id, input.path))
    ),
    put: protectedProcedure.input(z3.object({
      path: documentPath,
      data: z3.record(z3.string(), z3.unknown()),
      expectedSha: z3.string().optional()
    })).mutation(async ({ ctx, input }) => {
      markSyncStarted();
      try {
        const result = await getEditorialRepository().put(scopedPath(ctx.user.id, input.path), input.data, input.expectedSha);
        markSyncSucceeded();
        return result;
      } catch (error) {
        if (error instanceof RepositoryConflictError) {
          markSyncConflict(input.path);
          throw new TRPCError3({ code: "CONFLICT", message: "O documento foi alterado por outra sess\xE3o. Recarregue antes de salvar." });
        }
        markSyncFailed(error);
        throw error;
      }
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express2 from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express2.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve2) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve2(true));
    });
    server.on("error", () => resolve2(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express3();
  const server = createServer(app);
  registerGitHubWebhookRoutes(app);
  app.use(express3.json({ limit: "50mb" }));
  app.use(express3.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGitHubOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.use("/api", (req, res) => {
    if (!res.headersSent) res.status(404).json({ error: "API route not found", path: req.path });
  });
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
