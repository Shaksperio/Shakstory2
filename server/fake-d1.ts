/** D1 de mentira: entende só as tabelas de conta; o resto fica registrado em `docs` para conferir o isolamento. */
export function fakeDb() {
  const users = new Map<string, any>();
  const usage = new Map<string, number>();
  const av: any[] = [];
  const docs: Array<{ sql: string; args: unknown[] }> = [];
  const db: any = {
    users, usage, docs, av, stored: 0,
    prepare(sql: string) {
      const make = (args: unknown[]) => ({
        async first() {
          if (/FROM shak_users WHERE email/.test(sql)) return users.get(args[0] as string) ?? null;
          if (/SUM\(LENGTH/.test(sql)) return { n: (db as any).stored ?? 0 };
          if (/FROM shak_usage/.test(sql)) { const n = usage.get(args[0] + "|" + args[1]); return n === undefined ? null : { cowila: n }; }
          docs.push({ sql, args }); return null;
        },
        async all() {
          if (/FROM shak_av_sessions WHERE email = \? AND status = 'active'/.test(sql)) return { results: av.filter(r => r.email === args[0] && r.status === "active").sort((a, b) => b.id - a.id).slice(0, 1) };
          if (/FROM shak_av_sessions WHERE email = \? ORDER/.test(sql)) return { results: av.filter(r => r.email === args[0]).sort((a, b) => b.id - a.id) };
          if (/SELECT id FROM shak_av_sessions/.test(sql)) return { results: av.filter(r => r.id === args[0] && r.email === args[1] && r.status === "active") };
          if (/FROM shak_users ORDER BY/.test(sql)) return { results: Array.from(users.values()) };
          docs.push({ sql, args }); return { results: [] };
        },
        async run() {
          if (/^CREATE/.test(sql)) return {};
          if (/INSERT INTO shak_av_sessions/.test(sql)) { av.push({ id: av.length + 1, email: args[0], token_hash: args[1], token_prefix: args[2], base_url: args[3], status: "active", created_at: args[4], last_used_at: args[5], revoked_at: null }); return {}; }
          if (/UPDATE shak_av_sessions SET last_used_at/.test(sql)) { Object.assign(av.find(r => r.id === args[2])!, { last_used_at: args[0], base_url: args[1] }); return {}; }
          if (/UPDATE shak_av_sessions SET status = 'revoked', revoked_at = \? WHERE email/.test(sql)) { av.filter(r => r.email === args[1] && r.status === "active").forEach(r => Object.assign(r, { status: "revoked", revoked_at: args[0] })); return {}; }
          if (/UPDATE shak_av_sessions SET status = 'revoked', revoked_at = \? WHERE id/.test(sql)) { av.filter(r => r.id === args[1] && r.email === args[2]).forEach(r => Object.assign(r, { status: "revoked", revoked_at: args[0] })); return {}; }
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
