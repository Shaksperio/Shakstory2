import React, { useState } from "react";
import { Button } from "./ui/button";
import { buildProjectBackup, parseProjectBackup } from "@shared/project-backup";

export function ProjectBackupPanel({
  book,
  onRestore,
}: {
  book: { id: string; title: string; nodes: Array<unknown> };
  onRestore: (book: ReturnType<typeof parseProjectBackup>) => void;
}) {
  const [pending, setPending] = useState<ReturnType<
    typeof parseProjectBackup
  > | null>(null);
  const [message, setMessage] = useState("");
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([buildProjectBackup(book)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shakstory-${book.id}-backup.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Backup gerado. Guarde o arquivo em um local seguro.");
  };
  const load = async (file: File | undefined) => {
    setPending(null);
    setMessage("");
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024)
        throw new Error("Backup acima do limite de 32 MiB.");
      setPending(parseProjectBackup(await file.text(), book.id));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o backup."
      );
    }
  };
  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-card p-5">
      <p className="text-[10px] uppercase tracking-wider text-primary">
        Backup portátil
      </p>
      <h2 className="mt-2 font-serif text-2xl">Guarde uma cópia completa.</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Texto, formatação, planejamento, créditos e histórico do livro são
        incluídos. Imagens externas continuam dependendo dos endereços
        originais.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={download}>
          Baixar backup do projeto
        </Button>
        <label className="text-xs">
          Abrir backup
          <input
            aria-label="Abrir backup do projeto"
            className="ml-2 max-w-full text-xs"
            type="file"
            accept=".json,application/json"
            onChange={event => {
              void load(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {pending && (
        <div className="mt-4 rounded-xl border border-primary/20 p-4">
          <p className="text-sm">
            Restaurar “{pending.title}”, com {pending.nodes.length} elementos?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A cópia atual será guardada em um snapshot antes da substituição.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                try {
                  onRestore(pending);
                  setPending(null);
                  setMessage(
                    "Backup restaurado; a cópia anterior está nos snapshots."
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "A restauração foi interrompida."
                  );
                }
              }}
            >
              Confirmar restauração do backup
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p className="mt-3 text-xs" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
