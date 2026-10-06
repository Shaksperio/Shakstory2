import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const antivirusSessions = mysqlTable("antivirus_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  tokenPrefix: varchar("tokenPrefix", { length: 24 }).notNull(),
  sessionFingerprint: varchar("sessionFingerprint", { length: 128 }).notNull(),
  projectBaseUrl: varchar("projectBaseUrl", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt"),
});

export type AntivirusSession = typeof antivirusSessions.$inferSelect;
export type InsertAntivirusSession = typeof antivirusSessions.$inferInsert;

export const antivirusScans = mysqlTable("antivirus_scans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  filename: varchar("filename", { length: 160 }).notNull(),
  sha256: varchar("sha256", { length: 64 }),
  status: mysqlEnum("status", ["clean", "infected", "error", "timeout", "pending"]).notNull(),
  malwareName: varchar("malwareName", { length: 255 }),
  detail: text("detail"),
  engine: varchar("engine", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AntivirusScan = typeof antivirusScans.$inferSelect;
export type InsertAntivirusScan = typeof antivirusScans.$inferInsert;