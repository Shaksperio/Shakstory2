import React from "react";
import { chapterProgress, type DailyProgress } from "@shared/project-backup";

export function ProjectProgressPanel({
  nodes,
  history = [],
}: {
  nodes: Array<{ id: string; title: string; kind: string; content: string }>;
  history?: DailyProgress[];
}) {
  const chapters = chapterProgress(nodes);
  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-card p-5">
      <p className="text-[10px] uppercase tracking-wider text-primary">
        Acompanhar a escrita
      </p>
      <h2 className="mt-2 font-serif text-2xl">Capítulos e ritmo diário.</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        A barra mostra a participação de cada elemento no manuscrito, sem
        definir uma meta automática.
      </p>
      <div className="mt-4 space-y-3">
        {chapters.map(chapter => (
          <div key={chapter.id}>
            <div className="flex justify-between gap-3 text-xs">
              <span>{chapter.title}</span>
              <span>
                {chapter.words.toLocaleString("pt-BR")} palavras ·{" "}
                {chapter.percent}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${chapter.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <h3 className="mt-6 text-sm font-medium">Últimos dias de escrita</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Variação de palavras nos rascunhos salvos, a partir desta atualização.
        Revisões sem mudança de contagem não alteram o registro.
      </p>
      {history.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="py-2">Dia</th>
                <th>Acrescentadas</th>
                <th>Removidas</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {history
                .slice(-7)
                .reverse()
                .map(day => (
                  <tr key={day.date} className="border-t border-border/60">
                    <td className="py-2">
                      {day.date.split("-").reverse().join("/")}
                    </td>
                    <td>{day.added}</td>
                    <td>{day.removed}</td>
                    <td>{day.added - day.removed}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Os registros aparecem quando você escreve e salva no Manuscrito.
        </p>
      )}
    </section>
  );
}
