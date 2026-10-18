import { Button } from "@/components/ui/button";
import type { MirrorApi } from "@/lib/mirror/useMirror";

const when = (at?: number) => (at ? new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ainda não");

export function DataSafetyPanel({ manualOffline, onToggleOffline, mirror, onConnect, onRestore }: { manualOffline: boolean; onToggleOffline: () => void; mirror: MirrorApi; onConnect: () => void; onRestore: () => void }) {
  return (
    <section className="mt-6 rounded-xl border border-border/70 bg-card p-4" aria-label="Segurança dos dados">
      <h2 className="font-serif text-xl">Segurança dos dados</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" aria-pressed={manualOffline} onClick={onToggleOffline}>{manualOffline ? "Voltar online" : "Trabalhar offline"}</Button>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{manualOffline ? "Suas alterações ficam neste aparelho e sincronizam quando você voltar." : "Se a internet cair, o Shakstory continua salvando neste aparelho e sincroniza depois."}</p>
      </div>
      <div className="mt-4 border-t border-border/60 pt-4">
        <p className="text-sm font-medium">Cópia de segurança na nuvem</p>
        {mirror.user ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">Ativa para {mirror.user.email}. Última cópia: {when(mirror.lastAt)}.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={mirror.busy} onClick={onRestore}>Restaurar da cópia</Button>
              <Button size="sm" variant="ghost" disabled={mirror.busy} onClick={() => void mirror.disconnect()}>Desconectar</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">Depois de cada salvamento, uma cópia de segurança é enviada à nuvem. Se o endereço principal sair do ar, você restaura daqui sem perder texto.</p>
            <Button className="mt-3" size="sm" disabled={mirror.busy} onClick={onConnect}>Conectar com o Google</Button>
          </>
        )}
        {mirror.error && <p role="alert" className="mt-2 text-sm text-destructive">{mirror.error}</p>}
      </div>
    </section>
  );
}
