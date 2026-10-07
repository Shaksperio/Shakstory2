import React from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, RotateCcw, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function AntivirusSecurityView() {
  const sessions = trpc.security.antivirus.sessions.useQuery();
  const utils = trpc.useUtils();
  const rotate = trpc.security.antivirus.rotate.useMutation({ onSuccess: () => void utils.security.antivirus.sessions.invalidate() });
  const revoke = trpc.security.antivirus.revoke.useMutation({ onSuccess: () => void utils.security.antivirus.sessions.invalidate() });

  return <section className="animate-in fade-in-0 duration-300">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Proteção do estúdio</p><h1 className="mt-2 font-serif text-4xl tracking-tight">Segurança antivírus</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Credenciais efêmeras por sessão e registro operacional para o proprietário. Segredos brutos nunca são exibidos.</p></div>
      <Button onClick={() => rotate.mutate()} disabled={rotate.isPending}><RotateCcw className="mr-2 h-4 w-4" />{rotate.isPending ? "Gerando…" : "Gerar nova credencial"}</Button>
    </div>
    {sessions.isError ? <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-900 dark:text-amber-100">{sessions.error.message}</div> : <div className="mt-8 space-y-3">{sessions.data?.length ? sessions.data.map(session => <article key={session.id} className="rounded-2xl border border-border/70 bg-card p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-mono text-sm">{session.tokenPrefix}••••••</p><p className="mt-1 text-xs text-muted-foreground">{session.projectBaseUrl} · criada em {new Date(session.createdAt).toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">{session.status === "active" ? "Ativa" : "Revogada"}{session.lastUsedAt ? ` · último uso ${new Date(session.lastUsedAt).toLocaleString("pt-BR")}` : ""}</p></div></div>{session.status === "active" && <Button variant="ghost" size="sm" onClick={() => revoke.mutate({ id: session.id })} disabled={revoke.isPending} aria-label={`Revogar credencial ${session.tokenPrefix}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Revogar</Button>}</div></article>) : <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-sm text-muted-foreground">Nenhuma sessão antivírus registrada ainda. Ela será criada automaticamente no próximo login.</div>}</div>}
  </section>;
}
