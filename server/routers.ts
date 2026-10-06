import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getEditorialRepository, getEditorialRepositoryMode } from "./data-access";
import { RepositoryConflictError } from "../backend/src/repositories/types";
import { analyzeLiteraryText, listLiteraryModels, literaryAnalysisInputSchema } from "./literary-analysis";
import { getSyncSnapshot, markSyncConflict, markSyncFailed, markSyncStarted, markSyncSucceeded } from "./sync-state";
import { storagePut } from "./storage";
import { recordAntivirusScan } from "./db";
import { isSafeToPersist, scanWithLocalKicomAV } from "./antivirus";
import { ENV } from "./_core/env";
import { createProjectBaseUrl, ensureAntivirusSession, fingerprintSession, listAntivirusSessions, revokeAntivirusSession, rotateAntivirusSessions } from "./antivirus-sessions";

const documentPath = z.string().regex(/^[a-z0-9][a-z0-9/_-]*\.json$/i, "Caminho de documento inválido.");
const scopedPath = (ownerId: number, path: string) => `authors/${ownerId}/${path}`;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async opts => {
      if (opts.ctx.user) {
        try {
          await ensureAntivirusSession({
            userId: opts.ctx.user.id,
            sessionFingerprint: fingerprintSession(opts.ctx.req.headers.cookie),
            projectBaseUrl: createProjectBaseUrl(opts.ctx.req),
          });
        } catch (error) {
          console.error("[Antivirus] Não foi possível registrar a sessão sem bloquear o login:", error);
        }
      }
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  security: router({
    antivirus: router({
      sessions: protectedProcedure.query(({ ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError({ code: "FORBIDDEN", message: "O relatório antivírus é exclusivo do proprietário." });
        return listAntivirusSessions(ctx.user.id);
      }),
      revoke: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o proprietário pode gerenciar credenciais antivírus." });
        return { revoked: await revokeAntivirusSession(ctx.user.id, input.id) };
      }),
      rotate: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o proprietário pode renovar credenciais antivírus." });
        return rotateAntivirusSessions(ctx.user.id, createProjectBaseUrl(ctx.req));
      }),
    }),
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
        throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error ? `A assessoria literária não respondeu: ${error.message}` : "A assessoria literária não respondeu." });
      }
    }),
  }),
  assets: router({
    uploadCover: protectedProcedure.input(z.object({ filename: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(120), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(1).max(12_000_000) })).mutation(async ({ ctx, input }) => {
      try {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.length > 8 * 1024 * 1024) throw new Error("A capa deve ter no máximo 8 MB.");
        const scan = await scanWithLocalKicomAV({ bytes, filename: input.filename, contentType: input.contentType });
        await recordAntivirusScan({ userId: ctx.user.id, filename: input.filename, sha256: scan.sha256, status: scan.status, malwareName: scan.malwareName, detail: scan.detail, engine: scan.engine });
        if (!isSafeToPersist(scan)) {
          throw new Error(scan.status === "infected" ? `A capa foi colocada em quarentena: ${scan.malwareName ?? "ameaça detectada"}.` : `A capa não foi armazenada porque a verificação antivírus falhou (${scan.status}).`);
        }
        return await storagePut(`authors/${ctx.user.id}/covers/${input.filename}`, bytes, input.contentType);
      } catch (error) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error ? `Não foi possível armazenar a capa: ${error.message}` : "Não foi possível armazenar a capa." });
      }
    }),
  }),
  data: router({
    status: protectedProcedure.query(() => ({ mode: getEditorialRepositoryMode(), versioned: true, ...getSyncSnapshot() })),
    get: protectedProcedure.input(z.object({ path: documentPath })).query(({ ctx, input }) =>
      getEditorialRepository().get(scopedPath(ctx.user.id, input.path)),
    ),
    put: protectedProcedure.input(z.object({
      path: documentPath,
      data: z.record(z.string(), z.unknown()),
      expectedSha: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      markSyncStarted();
      try {
        const result = await getEditorialRepository().put(scopedPath(ctx.user.id, input.path), input.data, input.expectedSha);
        markSyncSucceeded();
        return result;
      } catch (error) {
        if (error instanceof RepositoryConflictError) {
          markSyncConflict(input.path);
          throw new TRPCError({ code: "CONFLICT", message: "O documento foi alterado por outra sessão. Recarregue antes de salvar." });
        }
        markSyncFailed(error);
        throw error;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
