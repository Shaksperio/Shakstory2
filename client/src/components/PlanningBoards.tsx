import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Pin, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

export type BoardCardKind = "note" | "character" | "location" | "research" | "scene" | "world";
export type PlanningBoardCard = {
  id: string;
  title: string;
  body: string;
  kind: BoardCardKind;
  tags: string[];
  columnId: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
};
export type PlanningBoardColumn = { id: string; title: string };
export type PlanningBoard = {
  id: string;
  title: string;
  description: string;
  columns: PlanningBoardColumn[];
  cards: PlanningBoardCard[];
  createdAt: number;
  updatedAt: number;
};

const cardLabels: Record<BoardCardKind, string> = {
  note: "Nota",
  character: "Personagem",
  location: "Local",
  research: "Pesquisa",
  scene: "Cena",
  world: "Mundo",
};

const cardTemplates: Array<{ kind: BoardCardKind; label: string; title: string; body: string }> = [
  { kind: "character", label: "Personagem", title: "Novo personagem", body: "Desejo:\nMedo:\nContradição:\nMudança esperada:" },
  { kind: "location", label: "Local", title: "Novo local", body: "Atmosfera:\nDetalhes sensoriais:\nFunção dramática:" },
  { kind: "research", label: "Pesquisa", title: "Ponto de pesquisa", body: "Pergunta:\nFonte:\nO que precisa ser confirmado:" },
  { kind: "world", label: "Sistema de mundo", title: "Regra do mundo", body: "Regra:\nLimite:\nCusto:\nConsequência narrativa:" },
  { kind: "scene", label: "Cena", title: "Cena planejada", body: "Objetivo:\nConflito:\nVirada:\nConsequência:" },
];

const uid = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? prefix + "-" + random : prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
};

export function createPlanningBoard(title = "Board principal"): PlanningBoard {
  const now = Date.now();
  return {
    id: uid("board"),
    title,
    description: "Organize ideias, pesquisa e elementos narrativos em cartões.",
    columns: [
      { id: uid("column"), title: "Ideias" },
      { id: uid("column"), title: "Em desenvolvimento" },
      { id: uid("column"), title: "Resolvido" },
    ],
    cards: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function PlanningBoards({ boards, onChange, onBack }: { boards: PlanningBoard[]; onChange: (boards: PlanningBoard[]) => void; onBack: () => void }) {
  const [activeBoardId, setActiveBoardId] = useState(boards[0]?.id ?? "");
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [cardTitle, setCardTitle] = useState("");
  const [cardBody, setCardBody] = useState("");
  const [cardKind, setCardKind] = useState<BoardCardKind>("note");
  const [cardTags, setCardTags] = useState("");
  const [cardColumnId, setCardColumnId] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const activeBoard = boards.find(board => board.id === activeBoardId) ?? boards[0] ?? null;
  const activeId = activeBoard?.id ?? "";
  const selectedColumnId = cardColumnId || activeBoard?.columns[0]?.id || "";

  const stats = useMemo(() => ({
    cards: activeBoard?.cards.length ?? 0,
    pinned: activeBoard?.cards.filter(card => card.pinned).length ?? 0,
    columns: activeBoard?.columns.length ?? 0,
  }), [activeBoard]);

  const updateBoard = (updater: (board: PlanningBoard) => PlanningBoard) => {
    if (!activeBoard) return;
    onChange(boards.map(board => board.id === activeBoard.id ? updater({ ...board, updatedAt: Date.now() }) : board));
  };

  const createBoard = () => {
    const title = newBoardTitle.trim() || "Novo board";
    const board = createPlanningBoard(title);
    onChange([...boards, board]);
    setActiveBoardId(board.id);
    setNewBoardTitle("");
  };

  const removeBoard = () => {
    if (!activeBoard || !window.confirm("Excluir este board e todos os cartões?")) return;
    const next = boards.filter(board => board.id !== activeBoard.id);
    onChange(next);
    setActiveBoardId(next[0]?.id ?? "");
  };

  const addColumn = () => {
    const title = newColumnTitle.trim();
    if (!activeBoard || !title) return;
    updateBoard(board => ({ ...board, columns: [...board.columns, { id: uid("column"), title }] }));
    setNewColumnTitle("");
  };

  const resetCardForm = () => {
    setCardTitle("");
    setCardBody("");
    setCardKind("note");
    setCardTags("");
    setCardColumnId("");
    setEditingCardId(null);
  };

  const saveCard = () => {
    if (!activeBoard || !cardTitle.trim() || !selectedColumnId) return;
    const now = Date.now();
    const nextCard: PlanningBoardCard = {
      id: editingCardId ?? uid("card"),
      title: cardTitle.trim(),
      body: cardBody.trim(),
      kind: cardKind,
      tags: cardTags.split(",").map(tag => tag.trim()).filter(Boolean),
      columnId: selectedColumnId,
      pinned: activeBoard.cards.find(card => card.id === editingCardId)?.pinned ?? false,
      createdAt: activeBoard.cards.find(card => card.id === editingCardId)?.createdAt ?? now,
      updatedAt: now,
    };
    updateBoard(board => ({
      ...board,
      cards: editingCardId ? board.cards.map(card => card.id === editingCardId ? nextCard : card) : [...board.cards, nextCard],
    }));
    resetCardForm();
  };

  const editCard = (card: PlanningBoardCard) => {
    setEditingCardId(card.id);
    setCardTitle(card.title);
    setCardBody(card.body);
    setCardKind(card.kind);
    setCardTags(card.tags.join(", "));
    setCardColumnId(card.columnId);
  };

  const removeCard = (id: string) => updateBoard(board => ({ ...board, cards: board.cards.filter(card => card.id !== id) }));
  const togglePin = (id: string) => updateBoard(board => ({ ...board, cards: board.cards.map(card => card.id === id ? { ...card, pinned: !card.pinned, updatedAt: Date.now() } : card) }));

  const moveCard = (card: PlanningBoardCard, direction: -1 | 1) => {
    if (!activeBoard) return;
    const index = activeBoard.columns.findIndex(column => column.id === card.columnId);
    const target = activeBoard.columns[index + direction];
    if (!target) return;
    updateBoard(board => ({ ...board, cards: board.cards.map(item => item.id === card.id ? { ...item, columnId: target.id, updatedAt: Date.now() } : item) }));
  };

  const applyTemplate = (template: (typeof cardTemplates)[number]) => {
    setCardKind(template.kind);
    setCardTitle(template.title);
    setCardBody(template.body);
    setEditingCardId(null);
  };

  if (!activeBoard) {
    return <div className="animate-in fade-in-0 duration-300">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Story Boards</p><h1 className="mt-2 font-serif text-4xl">Planeje visualmente.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Crie boards para outline, pesquisa, personagens, lugares, sistemas de mundo ou qualquer estrutura que ajude a escrever.</p></div>
        <Button variant="outline" onClick={onBack}>Voltar</Button>
      </div>
      <div className="mt-10 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8">
        <h2 className="font-serif text-2xl">Seu primeiro board começa vazio.</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Você escolhe a finalidade e pode criar quantos boards precisar.</p>
        <div className="mt-5 flex max-w-md gap-2"><Input value={newBoardTitle} onChange={event => setNewBoardTitle(event.target.value)} placeholder="Ex.: Arco do livro 1" onKeyDown={event => event.key === "Enter" && createBoard()} /><Button onClick={createBoard}><Plus className="mr-2 h-4 w-4" />Criar board</Button></div>
      </div>
    </div>;
  }

  return <div className="animate-in fade-in-0 duration-300">
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Story Boards</p>
        <h1 className="mt-2 font-serif text-4xl">Planejamento visual.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Cards persistentes para outline, pesquisa e construção de mundo. Mova cada ideia conforme ela amadurece.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <Button variant="outline" onClick={removeBoard}><Trash2 className="mr-2 h-4 w-4" />Excluir board</Button>
      </div>
    </div>

    <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 lg:flex-row lg:items-center">
      <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={activeId} onChange={event => setActiveBoardId(event.target.value)}>
        {boards.map(board => <option key={board.id} value={board.id}>{board.title}</option>)}
      </select>
      <div className="flex flex-1 gap-2"><Input value={newBoardTitle} onChange={event => setNewBoardTitle(event.target.value)} placeholder="Novo board" /><Button variant="outline" onClick={createBoard}><Plus className="mr-2 h-4 w-4" />Board</Button></div>
      <div className="flex gap-3 text-[11px] text-muted-foreground"><span>{stats.cards} cards</span><span>{stats.pinned} fixados</span><span>{stats.columns} colunas</span></div>
    </div>

    <div className="mt-5 overflow-x-auto pb-3">
      <div className="grid min-w-[900px] gap-4" style={{ gridTemplateColumns: "repeat(" + activeBoard.columns.length + ", minmax(280px, 1fr))" }}>
        {activeBoard.columns.map((column, columnIndex) => {
          const cards = activeBoard.cards.filter(card => card.columnId === column.id).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.createdAt - b.createdAt);
          return <section key={column.id} className="rounded-2xl border border-border/70 bg-muted/25 p-3">
            <div className="flex items-center justify-between px-1"><div><h2 className="text-sm font-semibold">{column.title}</h2><p className="mt-1 text-[10px] text-muted-foreground">{cards.length} card(s)</p></div><Badge variant="outline">{columnIndex + 1}</Badge></div>
            <div className="mt-3 space-y-3">
              {cards.map(card => <article key={card.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className="text-[9px]">{cardLabels[card.kind]}</Badge>{card.pinned && <Pin className="h-3 w-3 text-primary" />}</div><h3 className="mt-2 font-serif text-lg">{card.title}</h3></div>
                  <button aria-label="Fixar cartão" className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => togglePin(card.id)}><Pin className="h-3.5 w-3.5" /></button>
                </div>
                {card.body && <p className="mt-3 whitespace-pre-line text-xs leading-5 text-muted-foreground">{card.body}</p>}
                {card.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{card.tags.map(tag => <span key={tag} className="rounded-full bg-primary/10 px-2 py-1 text-[9px] text-primary">#{tag}</span>)}</div>}
                <div className="mt-4 flex items-center gap-1 border-t border-border/60 pt-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={columnIndex === 0} onClick={() => moveCard(card, -1)}><ChevronLeft className="mr-1 h-3 w-3" />Mover</Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={columnIndex === activeBoard.columns.length - 1} onClick={() => moveCard(card, 1)}>Mover<ChevronRight className="ml-1 h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[10px]" onClick={() => editCard(card)}>Editar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeCard(card.id)}><X className="h-3 w-3" /></Button>
                </div>
              </article>)}
              {cards.length === 0 && <div className="rounded-xl border border-dashed border-border p-5 text-center text-[11px] text-muted-foreground">Arraste a ideia para cá usando os botões Mover.</div>}
            </div>
          </section>;
        })}
      </div>
    </div>

    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Templates narrativos</p>
        <h2 className="mt-2 font-serif text-2xl">Comece com uma estrutura útil.</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Templates só preenchem o formulário; você continua no controle do conteúdo.</p>
        <div className="mt-4 flex flex-wrap gap-2">{cardTemplates.map(template => <Button key={template.kind} variant="outline" size="sm" onClick={() => applyTemplate(template)}>{template.label}</Button>)}</div>
        <div className="mt-6 border-t border-border/70 pt-4">
          <p className="text-xs font-medium">Adicionar coluna ao board</p>
          <div className="mt-2 flex gap-2"><Input value={newColumnTitle} onChange={event => setNewColumnTitle(event.target.value)} placeholder="Ex.: Revisar depois" onKeyDown={event => event.key === "Enter" && addColumn()} /><Button variant="outline" onClick={addColumn} disabled={!newColumnTitle.trim()}><Plus className="mr-2 h-4 w-4" />Coluna</Button></div>
        </div>
      </section>

      <aside className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">{editingCardId ? "Editar card" : "Novo card"}</p>
        <h2 className="mt-2 font-serif text-2xl">{editingCardId ? "Refine a ideia." : "Capture antes de esquecer."}</h2>
        <label className="mt-5 block text-xs font-medium text-muted-foreground">Tipo<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cardKind} onChange={event => setCardKind(event.target.value as BoardCardKind)}>{Object.entries(cardLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Input className="mt-3" value={cardTitle} onChange={event => setCardTitle(event.target.value)} placeholder="Título do card" />
        <Textarea className="mt-3 min-h-36" value={cardBody} onChange={event => setCardBody(event.target.value)} placeholder="Notas, pesquisa, perguntas ou estrutura..." />
        <Input className="mt-3" value={cardTags} onChange={event => setCardTags(event.target.value)} placeholder="Tags separadas por vírgula" />
        <label className="mt-3 block text-xs font-medium text-muted-foreground">Coluna<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedColumnId} onChange={event => setCardColumnId(event.target.value)}>{activeBoard.columns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
        <div className="mt-4 flex gap-2"><Button className="flex-1" onClick={saveCard} disabled={!cardTitle.trim()}>{editingCardId ? "Salvar card" : <><Plus className="mr-2 h-4 w-4" />Adicionar card</>}</Button>{editingCardId && <Button variant="ghost" onClick={resetCardForm}>Cancelar</Button>}</div>
      </aside>
    </div>
  </div>;
}
