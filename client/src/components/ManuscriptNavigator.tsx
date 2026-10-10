import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  publicationSections,
  MATTER_TEMPLATES,
  type MatterSection,
  type CopyrightData,
} from "@shared/editorial-workflow";
import { stableId } from "@shared/project-lifecycle";

type Node = { id: string; title: string; kind: string; content: string };
type Publication = {
  author: string;
  copyright?: CopyrightData;
  frontMatter?: MatterSection[];
  backMatter?: MatterSection[];
  includeToc?: boolean;
};
export function ManuscriptNavigator({
  nodes,
  activeId,
  publication,
  onPublication,
  onSelect,
  onMove,
  onRename,
  onDuplicate,
  onRemove,
  onPrepare,
  onReorder,
}: {
  nodes: Node[];
  activeId?: string;
  publication: Publication;
  onPublication: (p: Publication) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onPrepare: () => void;
  onReorder: (from: string, to: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const section = (side: "frontMatter" | "backMatter") => {
    const values =
      side === "frontMatter"
        ? publicationSections(publication)
        : (publication.backMatter ?? []);
    const update = (id: string, patch: Partial<MatterSection>) =>
      onPublication({
        ...publication,
        [side]: values.map(s => (s.id === id ? { ...s, ...patch } : s)),
      });
    return (
      <section className="manuscript-group">
        <button
          className="manuscript-group-heading"
          onClick={() =>
            setCollapsed({ ...collapsed, [side]: !collapsed[side] })
          }
        >
          <ChevronDown
            size={14}
            className={collapsed[side] ? "-rotate-90" : ""}
          />
          {side === "frontMatter" ? "Preliminares" : "Pós-textuais"}
          <span>{values.filter(s => s.enabled !== false).length}</span>
        </button>
        {!collapsed[side] && (
          <div className="manuscript-group-content">
            {values.length === 0 && (
              <p className="matter-empty">Nenhuma seção ainda.</p>
            )}
            {values.map((s, index) => (
              <div
                key={s.id}
                className={`matter-row ${s.enabled === false ? "matter-disabled" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Incluir ${s.title}`}
                    type="checkbox"
                    checked={s.enabled !== false}
                    onChange={e => update(s.id, { enabled: e.target.checked })}
                  />
                  <button
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() =>
                      s.id === "copyright"
                        ? onPrepare()
                        : setEditing(editing === s.id ? null : s.id)
                    }
                  >
                    {s.title}
                  </button>
                  <button
                    aria-label={`Mover seção ${s.title} para cima`}
                    disabled={!index}
                    onClick={() => {
                      const next = [...values];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      onPublication({ ...publication, [side]: next });
                    }}
                  >
                    <ChevronUp size={12} />
                  </button>
                </div>
                {editing === s.id && (
                  <textarea
                    aria-label={`Editar ${s.title}`}
                    className="mt-2 min-h-28 w-full rounded-md border bg-background p-2 text-sm text-foreground"
                    value={s.content}
                    onChange={e => update(s.id, { content: e.target.value })}
                  />
                )}
              </div>
            ))}
            {side === "frontMatter" && (
              <label className="matter-row flex gap-2">
                <input
                  type="checkbox"
                  checked={publication.includeToc !== false}
                  onChange={e =>
                    onPublication({
                      ...publication,
                      includeToc: e.target.checked,
                    })
                  }
                />
                Sumário automático
              </label>
            )}
            <select
              className="matter-add"
              value=""
              aria-label={`Nova seção ${side}`}
              onChange={e => {
                if (e.target.value)
                  onPublication({
                    ...publication,
                    [side]: [
                      ...values,
                      {
                        id: stableId("matter"),
                        title: e.target.value,
                        content: "",
                        enabled: true,
                      },
                    ],
                  });
              }}
            >
              <option value="">+ Adicionar seção</option>
              {MATTER_TEMPLATES[side]
                .filter(t => !values.some(s => s.title === t))
                .map(t => (
                  <option key={t}>{t}</option>
                ))}
            </select>
          </div>
        )}
      </section>
    );
  };
  let chapter = 0,
    part = 0;
  return (
    <nav aria-label="Estrutura editorial" className="manuscript-navigation">
      {section("frontMatter")}
      <section className="manuscript-group">
        <button
          className="manuscript-group-heading"
          onClick={() => setCollapsed({ ...collapsed, body: !collapsed.body })}
        >
          <ChevronDown
            size={14}
            className={collapsed.body ? "-rotate-90" : ""}
          />
          Corpo do livro
          <span>{nodes.filter(n => n.kind !== "part").length}</span>
        </button>
        {!collapsed.body &&
          nodes.map((n, index) => {
            const number = n.kind === "part" ? ++part : ++chapter;
            const title =
              n.title.replace(/^cap[ií]tulo\s+\d+\s*[—–:.-]?\s*/i, "") ||
              n.title;
            return (
              <div
                key={n.id}
                draggable
                onDragStart={() => setDragging(n.id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const source = nodes.findIndex(v => v.id === dragging);
                  if (source >= 0 && source !== index) {
                    onReorder(dragging!, n.id);
                  }
                  setDragging(null);
                }}
                className={`chapter-row ${activeId === n.id ? "is-active" : ""} ${n.kind === "part" ? "is-part" : ""}`}
              >
                <button
                  className="chapter-select"
                  aria-label={`${n.kind === "part" ? "Parte" : "Capítulo"} ${number} — ${title}`}
                  onClick={() => onSelect(n.id)}
                >
                  <span className="chapter-index">
                    {n.kind === "part" ? "P" + number : number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <GripVertical size={13} className="opacity-35" />
                </button>
                <div className="chapter-actions">
                  <button
                    aria-label={`Renomear ${n.title}`}
                    onClick={() => {
                      const title = window.prompt("Novo título", n.title);
                      if (title?.trim()) onRename(n.id, title);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    aria-label={`Mover ${n.title} para cima`}
                    disabled={!index}
                    onClick={() => onMove(n.id, "up")}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    aria-label={`Mover ${n.title} para baixo`}
                    disabled={index === nodes.length - 1}
                    onClick={() => onMove(n.id, "down")}
                  >
                    <ChevronDown size={12} />
                  </button>
                  <button
                    aria-label={`Duplicar ${n.title}`}
                    onClick={() => onDuplicate(n.id)}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    aria-label={`Remover ${n.title}`}
                    disabled={nodes.length <= 1}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remover “${n.title}” do manuscrito? Uma versão do conteúdo será preservada.`
                        )
                      )
                        onRemove(n.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
      </section>
      {section("backMatter")}
    </nav>
  );
}
