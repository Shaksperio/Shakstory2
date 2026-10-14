/** D1 de mentira: entende só as tabelas de conta; o resto fica registrado em `docs` para conferir o isolamento. */
export function fakeDb() {
  const users = new Map<string, any>();
  const usage = new Map<string, number>();
  const docs: Array<{ sql: string; args: unknown[] }> = [];
  const db: any = {
    users, usage, docs, stored: 0,
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        async first() {
          if (/FROM shak_users WHERE email/.test(sql)) return users.get(args[0] as string) ?? null;
          if (/SUM\(LENGTH/.test(sql)) return { n: (db as any).stored ?? 0 };
          if (/FROM shak_usage/.test(sql)) { const n = usage.get(args[0] + "|" + args[1]); return n === undefined ? null : { cowila: n }; }
          docs.push({ sql, args }); return null;
        },
        async all() {
          if (/FROM shak_users ORDER BY/.test(sql)) return { results: Array.from(users.values()) };
          docs.push({ sql, args }); return { results: [] };
        },
        async run() {
          if (/^CREATE/.test(sql)) return {};
          if (/INSERT OR IGNORE INTO shak_users/.test(sql)) { if (!users.has(args[0] as string)) users.set(args[0] as string, { email: args[0], created_at: args[1], plan: null, paid_until: null }); return {}; }
          if (/UPDATE shak_users SET plan = \?, paid_until = \?/.test(sql)) { Object.assign(users.get(args[2] as string), { plan: args[0], paid_until: args[1] }); return {}; }
          if (/UPDATE shak_users SET plan = NULL/.test(sql)) { Object.assign(users.get(args[1] as string), { plan: null, paid_until: null, created_at: args[0] }); return {}; }
          if (/INTO shak_usage/.test(sql)) { const k = args[0] + "|" + args[1]; usage.set(k, (usage.get(k) ?? 0) + 1); return {}; }
          docs.push({ sql, args }); return {};
        },
      });
      return { ...make([]), bind: (...args: unknown[]) => make(args) };
    },
  };
  return db;
}
