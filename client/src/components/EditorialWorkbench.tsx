import React, { useState } from "react";
import { sanitizeRichContent } from "@shared/rich-text";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  MATTER_TEMPLATES,
  publicationSections,
  canRestoreRevision,
  type CopyrightData,
  type MatterSection,
  type ReviewData,
} from "@shared/editorial-workflow";
import { stableId } from "@shared/project-lifecycle";
import { importManuscript, type ImportPreview } from "@/lib/manuscript-import";

type Publication = {
  author: string;
  copyright?: CopyrightData;
  frontMatter?: MatterSection[];
  backMatter?: MatterSection[];
};
export function EditorialWorkbench({
  publication,
  review = {},
  node,
  nodes = [],
  onSelect,
  text,
  html,
  onPublication,
  onReview,
  onRestore,
}: {
  publication: Publication;
  review?: ReviewData;
  node?: { id: string; title: string } | null;
  nodes?: Array<{ id: string; title: string; kind?: string }>;
  onSelect?: (id: string) => void;
  text: string;
  html: string;
  onPublication: (value: Publication) => void;
  onReview: (value: ReviewData) => void;
  onRestore: (text: string, html: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("manuscript");
  const [comment, setComment] = useState("");
  const [quote, setQuote] = useState("");
  const [message, setMessage] = useState("");
  const copyright = publication.copyright ?? {};
  const changeCopyright = (patch: Partial<CopyrightData>) =>
    onPublication({ ...publication, copyright: { ...copyright, ...patch } });
  const sections = (side: "frontMatter" | "backMatter") =>
    side === "frontMatter"
      ? publicationSections(publication)
      : (publication[side] ?? []);
  const updateSection = (
    side: "frontMatter" | "backMatter",
    id: string,
    patch: Partial<MatterSection>
  ) =>
    onPublication({
      ...publication,
      [side]: sections(side).map(s => (s.id === id ? { ...s, ...patch } : s)),
    });
  return (
    <details open={open} className="mb-4 rounded-xl border bg-card p-4">
      <summary
        className="cursor-pointer font-semibold"
        onClick={e => {
          e.preventDefault();
          setOpen(!open);
        }}
      >
        Manuscrito, revisão e preferências
      </summary>
      {open && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["manuscript", "Estrutura do livro"],
              ["copyright", "Copyright e créditos"],
              ["review", "Revisão e histórico"],
              ["preferences", "Preferências de escrita"],
            ].map(([id, label]) => (
              <Button
                key={id}
                variant={tab === id ? "default" : "outline"}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {tab === "manuscript" && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {(["frontMatter", "body", "backMatter"] as const).map(side =>
                side === "body" ? (
                  <section key={side}>
                    <h3 className="font-semibold">Corpo do livro</h3>
                    {nodes.map(n => (
                      <Button
                        key={n.id}
                        variant={n.id === node?.id ? "secondary" : "ghost"}
                        className="my-1 w-full justify-start overflow-hidden"
                        onClick={() => onSelect?.(n.id)}
                      >
                        {n.kind === "part" ? "Parte: " : ""}
                        {n.title}
                      </Button>
                    ))}
                  </section>
                ) : (
                  <section key={side}>
                    <h3 className="font-semibold">
                      {side === "frontMatter"
                        ? "Preliminares — antes dos capítulos"
                        : "Pós-textuais — depois dos capítulos"}
                    </h3>
                    <select
                      aria-label={`Adicionar ${side === "frontMatter" ? "preliminar" : "pós-textual"}`}
                      className="my-2 w-full rounded border bg-background p-2"
                      value=""
                      onChange={e => {
                        if (!e.target.value) return;
                        onPublication({
                          ...publication,
                          [side]: [
                            ...sections(side),
                            {
                              id:
                                e.target.value === "Copyright"
                                  ? "copyright"
                                  : stableId("matter"),
                              title: e.target.value,
                              content: "",
                              enabled: true,
                            },
                          ],
                        });
                      }}
                    >
                      <option value="">Adicionar seção…</option>
                      {MATTER_TEMPLATES[side]
                        .filter(
                          title => !sections(side).some(s => s.title === title)
                        )
                        .map(title => (
                          <option key={title}>{title}</option>
                        ))}
                    </select>
                    {sections(side).map((s, index) => (
                      <div key={s.id} className="mb-3 rounded border p-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.enabled !== false}
                            onChange={e =>
                              updateSection(side, s.id, {
                                enabled: e.target.checked,
                              })
                            }
                          />
                          {s.title}
                        </label>
                        {(s.id !== "copyright" || !publication.copyright) && (
                          <Textarea
                            aria-label={`Conteúdo de ${s.title}`}
                            value={s.content}
                            onChange={e =>
                              updateSection(side, s.id, {
                                content: e.target.value,
                              })
                            }
                            className="mt-2"
                          />
                        )}
                        {s.id === "copyright" && publication.copyright && (
                          <p className="mt-2 whitespace-pre-wrap text-sm">
                            {s.content ||
                              "Configure os dados na aba Copyright e créditos."}
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() => {
                            const values = [...sections(side)];
                            [values[index - 1], values[index]] = [
                              values[index],
                              values[index - 1],
                            ];
                            onPublication({ ...publication, [side]: values });
                          }}
                        >
                          Mover para cima
                        </Button>
                      </div>
                    ))}
                  </section>
                )
              )}
            </div>
          )}
          {tab === "copyright" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["penName", "Nome do autor"],
                  ["edition", "Edição"],
                  ["year", "Ano de publicação"],
                  ["publisher", "Editora"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <Input
                    value={copyright[key] ?? ""}
                    onChange={e => changeCopyright({ [key]: e.target.value })}
                  />
                </label>
              ))}
              {(
                ["epub", "kindle", "paperback", "hardcover", "pdf"] as const
              ).map(format => (
                <label key={format}>
                  ISBN — {format}
                  <Input
                    value={copyright.isbns?.[format] ?? ""}
                    onChange={e =>
                      changeCopyright({
                        isbns: { ...copyright.isbns, [format]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
              <div>
                {(["rights", "fiction", "moral", "external"] as const).map(
                  (key, i) => (
                    <label key={key} className="block">
                      <input
                        type="checkbox"
                        checked={copyright.clauses?.[key] ?? false}
                        onChange={e =>
                          changeCopyright({
                            clauses: {
                              ...copyright.clauses,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />{" "}
                      {
                        [
                          "Direitos reservados",
                          "Obra de ficção",
                          "Declaração de autoria",
                          "Referências externas",
                        ][i]
                      }
                    </label>
                  )
                )}
              </div>
              <label className="sm:col-span-2">
                Texto adicional
                <Textarea
                  value={copyright.additional ?? ""}
                  onChange={e =>
                    changeCopyright({ additional: e.target.value })
                  }
                />
              </label>
              <div className="sm:col-span-2">
                <h3>Créditos</h3>
                {(copyright.contributors ?? []).map(person => (
                  <div key={person.id} className="my-2 flex gap-2">
                    <Input
                      aria-label="Nome do colaborador"
                      value={person.name}
                      onChange={e =>
                        changeCopyright({
                          contributors: copyright.contributors?.map(p =>
                            p.id === person.id
                              ? { ...p, name: e.target.value }
                              : p
                          ),
                        })
                      }
                    />
                    <Input
                      aria-label="Função do colaborador"
                      value={person.role}
                      onChange={e =>
                        changeCopyright({
                          contributors: copyright.contributors?.map(p =>
                            p.id === person.id
                              ? { ...p, role: e.target.value }
                              : p
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      onClick={() =>
                        changeCopyright({
                          contributors: copyright.contributors?.filter(
                            p => p.id !== person.id
                          ),
                        })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    changeCopyright({
                      contributors: [
                        ...(copyright.contributors ?? []),
                        { id: stableId("credit"), name: "", role: "" },
                      ],
                    })
                  }
                >
                  Adicionar crédito
                </Button>
              </div>
            </div>
          )}
          {tab === "review" && (
            <div className="mt-4 space-y-4">
              <label>
                <input
                  type="checkbox"
                  checked={review.tracking ?? false}
                  onChange={e =>
                    onReview({ ...review, tracking: e.target.checked })
                  }
                />{" "}
                Rastrear próximas alterações
              </label>
              <p className="text-sm">
                Revisão deste capítulo: {node?.title ?? "selecione um capítulo"}
              </p>
              <Input
                placeholder="Trecho comentado (opcional)"
                value={quote}
                onChange={e => setQuote(e.target.value)}
              />
              <Textarea
                aria-label="Novo comentário"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <Button
                disabled={!node || !comment.trim()}
                onClick={() => {
                  if (!node) return;
                  onReview({
                    ...review,
                    comments: [
                      {
                        id: stableId("comment"),
                        nodeId: node.id,
                        quote,
                        body: comment.trim(),
                        author: publication.author || "Autor",
                        createdAt: Date.now(),
                        resolved: false,
                      },
                      ...(review.comments ?? []),
                    ],
                  });
                  setComment("");
                  setQuote("");
                }}
              >
                Adicionar comentário
              </Button>
              {review.comments
                ?.filter(c => c.nodeId === node?.id)
                .map(c => (
                  <article key={c.id} className="rounded border p-3">
                    <blockquote>{c.quote}</blockquote>
                    <p>{c.body}</p>
                    <small>
                      {c.author} ·{" "}
                      {new Date(c.createdAt).toLocaleString("pt-BR")}
                    </small>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        onReview({
                          ...review,
                          comments: review.comments?.map(v =>
                            v.id === c.id ? { ...v, resolved: !v.resolved } : v
                          ),
                        })
                      }
                    >
                      {c.resolved
                        ? "Reabrir comentário"
                        : "Resolver comentário"}
                    </Button>
                  </article>
                ))}
              <Button
                variant="outline"
                disabled={!node}
                onClick={() => {
                  if (node)
                    onReview({
                      ...review,
                      versions: [
                        {
                          id: stableId("version"),
                          nodeId: node.id,
                          title: node.title,
                          text,
                          html,
                          createdAt: Date.now(),
                        },
                        ...(review.versions ?? []),
                      ],
                    });
                }}
              >
                Guardar versão do capítulo
              </Button>
              {review.changes
                ?.filter(c => c.nodeId === node?.id && c.status === "pending")
                .map(c => (
                  <article key={c.id} className="rounded border p-3">
                    <p>
                      Alteração ·{" "}
                      {new Date(c.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <del className="whitespace-pre-wrap">{c.before}</del>
                      <ins className="whitespace-pre-wrap">{c.after}</ins>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        onReview({
                          ...review,
                          changes: review.changes?.map(v =>
                            v.id === c.id ? { ...v, status: "accepted" } : v
                          ),
                        })
                      }
                    >
                      Aceitar
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!canRestoreRevision(text, html, c)}
                      onClick={() => {
                        onRestore(c.before, c.beforeHtml);
                        onReview({
                          ...review,
                          changes: review.changes?.map(v =>
                            v.id === c.id ? { ...v, status: "rejected" } : v
                          ),
                        });
                      }}
                    >
                      Rejeitar e restaurar
                    </Button>
                    {!canRestoreRevision(text, html, c) && (
                      <p className="text-xs">
                        Há edições posteriores. Guarde uma versão antes de
                        restaurar manualmente.
                      </p>
                    )}
                  </article>
                ))}
              {review.versions
                ?.filter(v => v.nodeId === node?.id)
                .map(v => (
                  <details key={v.id} className="rounded border p-3">
                    <summary>
                      Versão de {new Date(v.createdAt).toLocaleString("pt-BR")}
                    </summary>
                    <p className="whitespace-pre-wrap">{v.text}</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!node) return;
                        onReview({
                          ...review,
                          versions: [
                            {
                              id: stableId("version"),
                              nodeId: node.id,
                              title: node.title,
                              text,
                              html,
                              createdAt: Date.now(),
                            },
                            ...(review.versions ?? []),
                          ],
                        });
                        onRestore(v.text, v.html);
                        setMessage(
                          "Versão restaurada. O texto anterior foi guardado no histórico."
                        );
                      }}
                    >
                      Restaurar esta versão
                    </Button>
                  </details>
                ))}
              <p role="status">{message}</p>
            </div>
          )}
          {tab === "preferences" && <WritingPreferences />}
        </>
      )}
    </details>
  );
}
export function WritingPreferences({ hidden = false }: { hidden?: boolean }) {
  const [prefs, setPrefs] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("shakstory:writing-preferences") ?? "{}"
      );
    } catch {
      return {};
    }
  });
  const update = (patch: Record<string, number>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem("shakstory:writing-preferences", JSON.stringify(next));
    window.dispatchEvent(new Event("writing-preferences"));
  };
  React.useEffect(() => {
    const read = () => {
      try {
        setPrefs(
          JSON.parse(
            localStorage.getItem("shakstory:writing-preferences") ?? "{}"
          )
        );
      } catch {}
    };
    window.addEventListener("writing-preferences", read);
    return () => window.removeEventListener("writing-preferences", read);
  }, []);
  return (
    <div hidden={hidden} className="mt-4">
      <p>
        Estas opções ajustam apenas a escrita nesta máquina. O livro exportado
        usa o layout da preparação.
      </p>
      <label>
        Tamanho da fonte
        <input
          aria-label="Tamanho da fonte de escrita"
          type="range"
          min="14"
          max="28"
          value={prefs.fontSize ?? 18}
          onChange={e => update({ fontSize: Number(e.target.value) })}
        />
      </label>
      <label>
        Entrelinha
        <input
          aria-label="Entrelinha de escrita"
          type="range"
          min="1.2"
          max="2.4"
          step="0.1"
          value={prefs.lineHeight ?? 1.7}
          onChange={e => update({ lineHeight: Number(e.target.value) })}
        />
      </label>
      <style>{`[contenteditable="true"],textarea[placeholder*="história"]{font-size:${Math.min(28, Math.max(14, Number(prefs.fontSize) || 18))}px!important;line-height:${Math.min(2.4, Math.max(1.2, Number(prefs.lineHeight) || 1.7))}!important}`}</style>
    </div>
  );
}
export function ManuscriptImport({
  onImport,
}: {
  onImport: (title: string, preview: ImportPreview) => void;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="mb-4 rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        Importar manuscrito DOCX ou ODT
      </summary>
      <p className="my-2 text-sm">
        Até 25 MB. Confira capítulos, imagens e avisos antes de criar o livro.
      </p>
      <input
        aria-label="Arquivo do manuscrito"
        type="file"
        accept=".docx,.odt"
        disabled={busy}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError("");
          setPreview(null);
          try {
            setPreview(
              await importManuscript(await file.arrayBuffer(), file.name)
            );
            setTitle(file.name.replace(/\.(docx|odt)$/i, ""));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao importar");
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p role="status">Lendo manuscrito…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div>
          <Input
            aria-label="Título do livro importado"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <p>
            {preview.chapters.length} capítulos · {preview.imageCount} imagens
          </p>
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-sm">
              {w}
            </p>
          ))}
          {preview.chapters.map((c, i) => (
            <details key={i}>
              <summary>
                {c.title || `Capítulo ${i + 1}`} — {c.content.length} caracteres
              </summary>
              <div
                className="prose max-w-full overflow-hidden [&_img]:max-h-64 [&_img]:object-contain"
                dangerouslySetInnerHTML={{
                  __html: sanitizeRichContent(c.richContent),
                }}
              />
            </details>
          ))}
          <Button
            disabled={!title.trim() || !preview.chapters.length}
            onClick={() => {
              onImport(title.trim(), preview);
              setPreview(null);
            }}
          >
            Confirmar importação
          </Button>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Cancelar
          </Button>
        </div>
      )}
    </details>
  );
}
