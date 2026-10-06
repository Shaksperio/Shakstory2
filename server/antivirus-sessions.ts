import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { antivirusSessions } from "../drizzle/schema";
import { getDb } from "./db";

export type AntivirusSessionReport = {
  id: number;
  tokenPrefix: string;
  projectBaseUrl: string;
  status: "active" | "revoked";
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function createProjectBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || "localhost";
  return `${forwardedProto || req.protocol}://${host}`;
}

export function fingerprintSession(cookieHeader: string | undefined): string {
  return hashSecret(cookieHeader || "anonymous-session");
}

function toReport(row: typeof antivirusSessions.$inferSelect): AntivirusSessionReport {
  return {
    id: row.id,
    tokenPrefix: row.tokenPrefix,
    projectBaseUrl: row.projectBaseUrl,
    status: row.status,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

export async function ensureAntivirusSession(input: {
  userId: number;
  sessionFingerprint: string;
  projectBaseUrl: string;
}): Promise<AntivirusSessionReport | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select()
    .from(antivirusSessions)
    .where(and(eq(antivirusSessions.userId, input.userId), eq(antivirusSessions.sessionFingerprint, input.sessionFingerprint), eq(antivirusSessions.status, "active")))
    .orderBy(desc(antivirusSessions.createdAt))
    .limit(1);
  if (existing[0]) {
    await db.update(antivirusSessions).set({ lastUsedAt: new Date(), projectBaseUrl: input.projectBaseUrl }).where(eq(antivirusSessions.id, existing[0].id));
    return { ...toReport(existing[0]), lastUsedAt: new Date(), projectBaseUrl: input.projectBaseUrl };
  }

  const secret = randomBytes(32).toString("base64url");
  const inserted = await db.insert(antivirusSessions).values({
    userId: input.userId,
    tokenHash: hashSecret(secret),
    tokenPrefix: secret.slice(0, 10),
    sessionFingerprint: input.sessionFingerprint,
    projectBaseUrl: input.projectBaseUrl,
    status: "active",
    lastUsedAt: new Date(),
  });
  const id = Number(inserted[0].insertId);
  const created = await db.select().from(antivirusSessions).where(eq(antivirusSessions.id, id)).limit(1);
  return created[0] ? toReport(created[0]) : null;
}

export async function listAntivirusSessions(userId: number): Promise<AntivirusSessionReport[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(antivirusSessions).where(eq(antivirusSessions.userId, userId)).orderBy(desc(antivirusSessions.createdAt));
  return rows.map(toReport);
}

export async function revokeAntivirusSession(userId: number, id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(antivirusSessions).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(antivirusSessions.id, id), eq(antivirusSessions.userId, userId), eq(antivirusSessions.status, "active")));
  return Number(result[0].affectedRows ?? 0) > 0;
}

export async function rotateAntivirusSessions(userId: number, projectBaseUrl: string): Promise<AntivirusSessionReport | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(antivirusSessions).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(antivirusSessions.userId, userId), eq(antivirusSessions.status, "active"), isNull(antivirusSessions.revokedAt)));
  const secret = randomBytes(32).toString("base64url");
  await db.insert(antivirusSessions).values({
    userId,
    tokenHash: hashSecret(secret),
    tokenPrefix: secret.slice(0, 10),
    sessionFingerprint: `manual-rotation-${Date.now()}`,
    projectBaseUrl,
    status: "active",
    lastUsedAt: new Date(),
  });
  const rows = await db.select().from(antivirusSessions).where(and(eq(antivirusSessions.userId, userId), eq(antivirusSessions.tokenPrefix, secret.slice(0, 10)))).orderBy(desc(antivirusSessions.createdAt)).limit(1);
  return rows[0] ? toReport(rows[0]) : null;
}
