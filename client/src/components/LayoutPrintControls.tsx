import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRINT_LIMITS } from "@shared/book-export";
import { THEME_NAME_MAX, applyLayout, deleteTheme, loadThemes, saveTheme, type LayoutTheme } from "@/lib/layout-themes";

type Props = { publication: Record<string, unknown>; update: (patch: Record<string, unknown>) => void };
const RESET = { typography: undefined, trimSize: undefined, customTrim: undefined, marginPreset: undefined, dropCap: undefined, headerText: undefined, footerText: undefined };

/** Cabeçalho corrente, sangria e lombada (produção gráfica) e temas de diagramação salvos neste navegador. */
export function LayoutPrintControls({ publication, update }: Props) {
  const [themes, setThemes] = useState<LayoutTheme[]>(() => loadThemes());
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const bleed = Number(publication.bleedMm ?? 0);
  const gutter = Number(publication.gutterMm ?? 0);

  const save = () => {
    const result = saveTheme(name, publication);
    setThemes(result.themes);
    if (result.ok) { setMessage(`Tema "${name.trim().slice(0, THEME_NAME_MAX)}" salvo.`); setName(""); return; }
    setMessage(result.reason === "name" ? "Dê um nome ao tema." : result.reason === "limit" ? "Limite de temas atingido. Exclua um para salvar outro." : "Não foi possível salvar o tema neste navegador.");
  };
  const apply = (theme: LayoutTheme) => { update({ ...RESET, ...applyLayout(theme) }); setMessage(`Tema "${theme.name}" aplicado. Texto, autor e capa não mudaram.`); };
  const remove = (theme: LayoutTheme) => { const result = deleteTheme(theme.id); setThemes(result.themes); setMessage(result.ok ? `Tema "${theme.name}" excluído.` : "Não foi possível excluir o tema."); };

  return (
    <section aria-label="Produção gráfica e temas" className="mt-4 rounded-xl border border-border p-3">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <input type="checkbox" checked={Boolean(publication.runningHeader)} onChange={event => update({ runningHeader: event.target.checked })} />
        Cabeçalho corrente (PDF e DOCX): autor nas páginas pares, capítulo nas ímpares
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">Sangria (gráfica)
          <select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={bleed} onChange={event => update({ bleedMm: Number(event.target.value) })}>
            <option value={0}>Sem sangria</option><option value={3}>3 mm</option><option value={5}>5 mm</option>
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">Lombada (mm)
          <input aria-label="Margem de lombada em milímetros" type="number" min={0} max={PRINT_LIMITS.maxGutterMm} step={0.5} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={gutter} onChange={event => update({ gutterMm: Number(event.target.value) })} />
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Vale só para o PDF. Com sangria, a página fica maior e o arquivo informa a área de corte. Para gráfica, exporte o miolo sem capa e confirme as medidas com ela.</p>

      <div className="mt-4 border-t border-border pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Temas salvos</p>
        <div className="mt-2 flex gap-2">
          <Input value={name} maxLength={THEME_NAME_MAX} onChange={event => setName(event.target.value)} placeholder="Nome do tema" aria-label="Nome do tema de diagramação" />
          <Button type="button" size="sm" variant="outline" onClick={save}>Salvar tema</Button>
        </div>
        {themes.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">Nenhum tema salvo. Um tema guarda formato, margens, tipografia, capitular, cabeçalho, rodapé, sangria e lombada deste livro.</p> : (
          <ul className="mt-2 space-y-1">
            {themes.map(theme => (
              <li key={theme.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{theme.name}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => apply(theme)} aria-label={`Aplicar tema ${theme.name}`}>Aplicar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(theme)} aria-label={`Excluir tema ${theme.name}`}>Excluir</Button>
              </li>
            ))}
          </ul>
        )}
        <p role="status" className="mt-2 min-h-4 text-[11px] text-muted-foreground">{message}</p>
      </div>
    </section>
  );
}

