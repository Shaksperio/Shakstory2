import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidIsbn, lookupIsbn, normalizeIsbn, type IsbnInfo } from "@/lib/isbn";

export function IsbnLookup({ value, onChange, onApply }: { value: string; onChange: (value: string) => void; onApply: (info: IsbnInfo, overwrite: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<IsbnInfo | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  const search = async () => {
    const code = normalizeIsbn(value);
    setInfo(null);
    if (!isValidIsbn(code)) { setMessage("ISBN inválido. Confira os dígitos (10 ou 13)."); return; }
    setBusy(true); setMessage("Buscando…");
    const found = await lookupIsbn(code);
    setBusy(false);
    if (!found) { setMessage("Nenhum livro encontrado para este ISBN. Preencha os campos manualmente."); return; }
    setInfo(found); setMessage(null);
  };

  return (
    <div className="text-xs font-medium text-muted-foreground">
      <label className="block">ISBN
        <span className="mt-2 flex gap-2">
          <Input value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="978…" />
          <Button type="button" variant="outline" disabled={busy || !value.trim()} onClick={() => void search()}>Buscar dados</Button>
        </span>
      </label>
      {message && <p role="status" className="mt-2 text-[11px]">{message}</p>}
      {info && (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/40 p-3 text-foreground" data-testid="isbn-result">
          <div className="flex gap-3">
            {info.coverUrl && <img src={info.coverUrl} alt="" className="h-20 w-14 rounded object-cover" />}
            <div className="min-w-0 text-xs">
              <p className="font-serif text-sm font-semibold">{info.title}{info.subtitle ? `: ${info.subtitle}` : ""}</p>
              <p className="text-muted-foreground">{info.authors.join(", ") || "Autor não informado"}</p>
              <p className="text-muted-foreground">{[info.publisher, info.publishedDate, info.pages ? `${info.pages} p.` : null].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Fonte: {info.source}</p>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
            <input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} /> Substituir campos já preenchidos
          </label>
          <Button type="button" size="sm" className="mt-2" onClick={() => { onApply(info, overwrite); setInfo(null); setMessage("Dados aplicados. Revise os campos abaixo."); }}>Aplicar aos metadados</Button>
        </div>
      )}
    </div>
  );
}
