import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { IdbKV } from "@/lib/sync/kv";
import { useMirror } from "@/lib/mirror/useMirror";

const MARKER = "shakstory:contingency-email";
const remembered = () => { try { return localStorage.getItem(MARKER); } catch { return null; } };

/** Porta de entrada da origem de contingência: o editor só aparece depois do login com um e-mail autorizado. */
export function ContingencyGate({ children }: { children: React.ReactNode }) {
  const kv = useRef<IdbKV | null>(null);
  const mirror = useMirror(() => (kv.current ??= new IdbKV()));
  const email = mirror.user?.email;
  const allowed = !!email;

  useEffect(() => {
    try { if (allowed && email) localStorage.setItem(MARKER, email); } catch { /* sem armazenamento */ }
  }, [allowed, email]);

  // Sem rede para validar o login, só reabre para quem já entrou antes neste aparelho.
  if (allowed || (mirror.sdkFailed && !!remembered())) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Shakstory · contingência</p>
        <h1 className="mt-3 font-serif text-3xl">Entrar no Shakstory</h1>
        {!mirror.ready ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">Verificando seu acesso…</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">Entre com sua conta Google. Contas novas ganham 7 dias de teste grátis.</p>
            <Button className="mt-5 w-full" disabled={mirror.busy} onClick={() => void mirror.connect()}>Entrar com Google</Button>
            {mirror.sdkFailed && <p className="mt-3 text-xs text-muted-foreground">Sem conexão para validar o login. Conecte-se à internet e tente de novo.</p>}
            {mirror.error && <p role="alert" className="mt-3 text-sm text-destructive">{mirror.error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
