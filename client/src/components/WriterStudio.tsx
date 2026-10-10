import { ProjectBackupPanel } from "./ProjectBackupPanel";
import { ProjectProgressPanel } from "./ProjectProgressPanel";
import { recordDailyProgress, type DailyProgress } from "@shared/project-backup";
import { TypewriterFrame } from "./TypewriterFrame";
import { ManuscriptNavigator } from "./ManuscriptNavigator";
import { reconcileManuscriptStructure } from "@shared/manuscript-structure";
import { selectionTextOffset } from "@shared/rich-structure";
import { EditorialWorkbench, ManuscriptImport, WritingPreferences } from "./EditorialWorkbench";
import { mergeTrackedRevision, publicationSections, type CopyrightData, type ReviewData } from "@shared/editorial-workflow";
import { safeLocalSet, saveLibraryBackup, readLibraryBackup } from "@/lib/library-backup";
import { prepareExportAssets } from "@/lib/export-assets";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { applySuggestionAtOffsets } from "@shared/literary";
import { migrateLegacyNodes, type BookHierarchy, type SemanticBook } from "@shared/book-model";
import { addChapter, addPart, createInitialNode, displayNodeTitle, duplicateNode, mergeNodes, moveNode, removeNode, renameNode, splitNode, updateNodeContent, stableId } from "@shared/project-lifecycle";
import { replaceSceneBlocks, scenesOf, sceneText } from "@shared/semantic-editor";
import { validateBook } from "@shared/validation";
import { sanitizeRichContent } from "@shared/rich-text";
import { recoverLibraryDocument } from "@shared/library-recovery";
import { buildDocx, buildEpub, buildPdf, buildPrintHtml, buildText, chaptersFromNodes, TYPOGRAPHY_PRESETS, type TypographyPreset } from "@shared/book-export";
import { AlertCircle, BookOpen, BookMarked, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock3, CloudOff, Download, FileText, History, Lightbulb, Loader2, Menu, PanelLeft, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Sparkles, Target, Trash2, UsersRound, WandSparkles, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { AntivirusSecurityView } from "./AntivirusSecurityView";
import { PlanningBoards, type PlanningBoard } from "./PlanningBoards";
import { appendContinuationHtml, appendContinuationText, continuationToHtml, type CoauthorAlternative } from "@shared/coauthor";
import { analyzeStyleDna } from "@shared/style-dna";

type View = "library" | "project" | "planning" | "editor" | "prepare" | "security";
type EditorialStatus = "planning" | "draft" | "editing" | "revision" | "completed";
type Node = { id: string; title: string; kind: "chapter" | "scene" | "part"; content: string; richContent?: string; updatedAt: number; status?: EditorialStatus };
type Character = { id: string; name: string; role: string; notes: string; tags?: string[]; status?: EditorialStatus };
type Location = { id: string; name: string; atmosphere: string; notes: string; tags?: string[]; status?: EditorialStatus };
type TimelineEvent = { id: string; title: string; date: string; description: string; tags?: string[]; status?: EditorialStatus };
type PlanningData = { characters: Character[]; locations: Location[]; timeline: TimelineEvent[]; boards?: PlanningBoard[] };
type StoryCard = { id: string; title: string; description: string; status?: EditorialStatus };
type StoryRelation = { id: string; from: string; to: string; fromId?: string; toId?: string; label: string; status?: EditorialStatus };
type StoryScene = { id: string; title: string; objective: string; conflict: string; objectiveId?: string; conflictId?: string; chapterId?: string; notes: string; status?: EditorialStatus };
type StoryData = { objectives: StoryCard[]; conflicts: StoryCard[]; relations: StoryRelation[]; notes: string[]; noteIds?: string[]; noteStatuses?: EditorialStatus[]; scenes: StoryScene[] };
type PlanningTab = "characters" | "locations" | "timeline" | "boards" | "story";
type PublicationData = { copyright?: CopyrightData; author: string; genre: string; category?: string; language: string; description: string; isbn?: string; publicationDate?: string; publicationYear?: string; coverImageUrl?: string; includeToc?: boolean; typography?: TypographyPreset; trimSize?: "a5" | "6x9" | "a4"; marginPreset?: "narrow" | "normal" | "wide"; dropCap?: boolean; headerText?: string; footerText?: string; frontMatter?: Array<{ id: string; title: string; content: string; enabled?: boolean }>; backMatter?: Array<{ id: string; title: string; content: string; enabled?: boolean }>; };
type Book = { writingProgress?: DailyProgress[]; archived?: boolean; review?: ReviewData; id: string; title: string; subtitle?: string; status: EditorialStatus; targetWordCount: number; dailyGoalWords?: number; deadline?: string; nodes: Node[]; updatedAt: number; startedAt?: number; lastOpenedAt?: number; editSeconds?: number; planning?: PlanningData; story?: StoryData; publication?: PublicationData; nextSteps?: string[]; semanticBook?: SemanticBook; hierarchy?: BookHierarchy };
type LibraryDocument = { version: 1; versionId?: string; books: Book[] };
type LiterarySuggestion = { category: string; severity: string; original: string; suggestion: string; explanation: string; confidence: number; start: number; end: number };
type LiteraryResult = { summary: string; strengths: string[]; suggestions: LiterarySuggestion[]; narrativeNotes: string[]; model: string; availableModels: string[] };
type CoauthorResult = { alternatives: CoauthorAlternative[]; canonWarnings: string[]; model: string; context: { canonFacts: number; memoryMessages: number; requestedWords: number } };
type CoauthorExpansionResult = { text: string; canonWarnings: string[]; model: string; context: { canonFacts: number; memoryMessages: number } };
type CoauthorGenerateOptions = { intent: string };
type ContinuityResult = {
  report: string;
  canonWarnings: string[];
  model: string;
  context: {
    canonFacts: number;
    memoryMessages: number;
    bookCanonFacts: number;
    seriesCanonFacts: number;
    universeCanonFacts: number;
    planningEntities: number;
    storyEntities: number;
  };
};
type ContinuityRadarProps = {
  result: ContinuityResult | null;
  loading: boolean;
  error: string | null;
  onCheck: () => void;
  onClear: () => void;
};
type LiteraryAssistantProps = { focus: "language" | "grammar" | "parts_of_speech" | "lexicon" | "narrative" | "voice" | "style" | "full"; setFocus: (focus: LiteraryAssistantProps["focus"]) => void; result: LiteraryResult | null; models: Array<{ id: string }>; isLoading: boolean; error: string | null; onAnalyze: () => void; onApply: (start: number, end: number, original: string, suggestion: string) => void; coauthorResult: CoauthorResult | null; coauthorLoading: boolean; coauthorError: string | null; coauthorExpansion: CoauthorExpansionResult | null; coauthorExpansionLoading: boolean; coauthorExpansionError: string | null; onGenerate: (options: CoauthorGenerateOptions) => void; onChoose: (alternative: CoauthorAlternative, intent: string) => void; onApplyExpansion: (text: string) => void; onBackToSamples: () => void; onReject: () => void; canUndoCoauthor: boolean; onUndoCoauthor: () => void };

type SyncState = { mode: "cloudflare-d1" | "github" | "json"; status: "idle" | "syncing" | "synced" | "conflict" | "error"; lastSyncAt: number | null; lastWebhookAt: number | null; lastWebhookEvent: string | null; lastConflictPath: string | null; lastError: string | null };

const emptyLibrary: LibraryDocument = { version: 1, books: [] };
const countWords = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;
const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const formatDate = (value: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(value);
const statusLabels: Record<EditorialStatus, string> = { planning: "Planejamento", draft: "Rascunho", editing: "Em edição", revision: "Em revisão", completed: "Concluído" };
const statusLabel = (value?: EditorialStatus) => statusLabels[value ?? "draft"];
const countCharacters = (book: Book) => book.nodes.reduce((sum, node) => sum + node.content.length, 0);
const countPages = (book: Book) => Math.max(1, Math.ceil(countCharacters(book) / 1800));
const wordsOf = (book: Book) => book.nodes.reduce((sum, node) => sum + countWords(node.content), 0);
const coverHue = (title: string) => Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
const viewLabels: Record<View, string> = { library: "Biblioteca", project: "Visão geral", editor: "Escrita", planning: "Planejar história", prepare: "Preparar edição", security: "Segurança" };
const styleSampleForBook = (book: Book, activeNodeId?: string | null, activeDraft?: string) => book.nodes.map(node => node.id === activeNodeId && activeDraft !== undefined ? activeDraft : node.content).join("\n\n").slice(-24000);
const formatDuration = (seconds = 0) => { const minutes = Math.max(0, Math.round(seconds / 60)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`; };
const hierarchyId = (prefix: "universe" | "series", value: string) => {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug ? `${prefix}-${slug}` : undefined;
};
const buildBookHierarchy = (bookId: string, universeValue: string, seriesValue: string): BookHierarchy | undefined => {
  const universeName = universeValue.trim();
  const seriesName = seriesValue.trim();
  if (!universeName && !seriesName) return undefined;
  return {
    bookId,
    ...(universeName ? { universeId: hierarchyId("universe", universeName), universeName } : {}),
    ...(seriesName ? { seriesId: hierarchyId("series", seriesName), seriesName } : {}),
  };
};
const normalizeStory = (story: StoryData): StoryData => ({ ...story, noteIds: story.noteIds?.length === story.notes.length ? story.noteIds : story.notes.map((_, index) => story.noteIds?.[index] ?? `legacy-note-${index + 1}`), noteStatuses: story.notes.map((_, index) => story.noteStatuses?.[index] ?? "draft") });
const hydrateSemanticBook = (book: Book): Book => book.semanticBook ? book : { ...book, semanticBook: migrateLegacyNodes({ id: book.id, title: book.title, nodes: book.nodes.map(node => ({ ...node, kind: node.kind as "part" | "chapter" | "scene" })) }) };

export default function WriterStudio() {
  const themeContext = useTheme();
  const [fallbackTheme, setFallbackTheme] = useState<"light" | "dark">("light");
  const theme = themeContext.switchable ? themeContext.theme : fallbackTheme;
  const toggleTheme = themeContext.toggleTheme ?? (() => setFallbackTheme(previous => previous === "light" ? "dark" : "light"));
  const [view, setView] = useState<View>("library");
  const libraryQuery = trpc.data.get.useQuery({ path: "library.json" });
  const statusQuery = trpc.data.status.useQuery(undefined, { refetchInterval: 15000 });
  const modelQuery = trpc.literaryAssist.models.useQuery(undefined, { enabled: view === "editor" });
  const utils = trpc.useUtils();
  const literaryMutation = trpc.literaryAssist.analyze.useMutation({ onSuccess: data => setAssistResult(data) });
  const coauthorMutation = trpc.literaryAssist.coauthor.useMutation({ onSuccess: data => { setCoauthorResult(data); setCoauthorExpansion(null); } });
  const expandCoauthorMutation = trpc.literaryAssist.expandCoauthor.useMutation({ onSuccess: data => setCoauthorExpansion(data) });
  const continuityMutation = trpc.literaryAssist.continuity.useMutation({ onSuccess: data => setContinuityResult(data) });
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [sha, setSha] = useState<string | undefined>();
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [query, setQuery] = useState("");
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookUniverseName, setNewBookUniverseName] = useState("");
  const [newBookSeriesName, setNewBookSeriesName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookDialog, setBookDialog] = useState<"edit" | "reset" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assistFocus, setAssistFocus] = useState<"language" | "grammar" | "parts_of_speech" | "lexicon" | "narrative" | "voice" | "style" | "full">("full");
  const [assistResult, setAssistResult] = useState<LiteraryResult | null>(null);
  const [coauthorResult, setCoauthorResult] = useState<CoauthorResult | null>(null);
  const [coauthorExpansion, setCoauthorExpansion] = useState<CoauthorExpansionResult | null>(null);
  const [continuityResult, setContinuityResult] = useState<ContinuityResult | null>(null);
  const [coauthorUndo, setCoauthorUndo] = useState<{ nodeId: string; text: string; html: string } | null>(null);
  const restoredWorkspace = React.useRef(false);
  const hydratedLibrary = React.useRef<{ hasRun: boolean; sha?: string }>({ hasRun: false });

  const activeBook = useMemo(() => library.books.find(book => book.id === activeBookId) ?? null, [library.books, activeBookId]);
  const activeNode = useMemo(() => activeBook?.nodes.find(node => node.id === activeNodeId) ?? activeBook?.nodes[0] ?? null, [activeBook, activeNodeId]);
  const totalWords = useMemo(() => library.books.reduce((sum, book) => sum + book.nodes.reduce((nodeSum, node) => nodeSum + countWords(node.content), 0), 0), [library.books]);

  useEffect(() => {
    if (activeBookId || library.books.length === 0) return;
    const preferred = [...library.books].sort((left, right) =>
      (right.lastOpenedAt ?? right.updatedAt) - (left.lastOpenedAt ?? left.updatedAt)
    )[0];
    if (!preferred) return;
    setActiveBookId(preferred.id);
    safeLocalSet("shakstory:active-book", preferred.id);
    const firstNodeId = preferred.nodes[0]?.id ?? null;
    setActiveNodeId(firstNodeId);
    if (firstNodeId) safeLocalSet("shakstory:active-node", firstNodeId);
  }, [activeBookId, library.books]);

  useEffect(() => {
    if (libraryQuery.isLoading) return;
    const querySha = libraryQuery.data?.sha;
    if (hydratedLibrary.current.hasRun && hydratedLibrary.current.sha === querySha) return;
    hydratedLibrary.current = { hasRun: true, sha: querySha };
    if(!(libraryQuery.data?.data as LibraryDocument|undefined)?.books?.length) void readLibraryBackup<LibraryDocument>().then(backup=>{if(backup?.books?.length)setLibrary(current=>{const latest=(doc:LibraryDocument)=>Math.max(0,...doc.books.map(b=>b.updatedAt));return latest(backup)>latest(current)?backup:current;});}).catch(()=>{});
    const savedDraft = localStorage.getItem("shakstory:library");
    let localBackup: LibraryDocument | null = null;
    if (savedDraft) { try { localBackup = JSON.parse(savedDraft) as LibraryDocument; } catch { localStorage.removeItem("shakstory:library"); } }
    if (libraryQuery.data?.data) {
      const remote = libraryQuery.data.data as LibraryDocument;
      const restored = recoverLibraryDocument(remote, localBackup) as LibraryDocument;
      const identified = restored.versionId ? restored : { ...restored, versionId: stableId("version") };
      setLibrary(identified);
      setSha(libraryQuery.data.sha);
      saveQueue.current.sha=libraryQuery.data.sha;saveQueue.current.blocked=false;
      const savedBookId = localStorage.getItem("shakstory:active-book");
      const savedNodeId = localStorage.getItem("shakstory:active-node");
      if (savedBookId && restored.books.some(book => book.id === savedBookId)) { setActiveBookId(savedBookId); const restoredBook = restored.books.find(book => book.id === savedBookId); setActiveNodeId(restoredBook?.nodes.some(node => node.id === savedNodeId) ? savedNodeId : restoredBook?.nodes[0]?.id ?? null); if (!restoredWorkspace.current) { setView(savedNodeId && restoredBook?.nodes.some(node => node.id === savedNodeId) ? "editor" : "project"); restoredWorkspace.current = true; } }
      setLocalOnly(false);
      return;
    }
    if (localBackup) setLibrary(localBackup);
  }, [libraryQuery.data, libraryQuery.isLoading]);

  useEffect(() => {
    if (!activeNode) return;
    setAssistResult(null);
    setCoauthorResult(null);
    setCoauthorExpansion(null);
    setContinuityResult(null);
    setCoauthorUndo(null);
    const localDraft = localStorage.getItem(`shakstory:node:${activeNode.id}`);
    const localRichDraft = localStorage.getItem(`shakstory:node:${activeNode.id}:html`);
    setDraft(localDraft ?? activeNode.content);
    setDraftHtml(localRichDraft ?? activeNode.richContent ?? "");
  }, [activeNode?.id]);

  useEffect(() => {
    if (!activeNode || (draft === activeNode.content && draftHtml === (activeNode.richContent ?? ""))) return;
    const timer = window.setTimeout(() => {
      const nextLibrary = { ...library, books: library.books.map(materializeDraft) };
      safeLocalSet(`shakstory:node:${activeNode.id}`, draft);
      safeLocalSet(`shakstory:node:${activeNode.id}:html`, draftHtml);
      setLibrary(nextLibrary);
      skipTracking.current = false;
      saveLibrary(nextLibrary);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [draft, draftHtml, activeNode?.id, library]);

  const saveQueue = useRef<{busy:boolean;pending?:LibraryDocument;inflight?:LibraryDocument;sha?:string;blocked?:boolean}>({busy:false});
  const saveMutation = trpc.data.put.useMutation({
    onSuccess: result => {
      setSha(result.sha);
      saveQueue.current.busy=false;saveQueue.current.inflight=undefined;saveQueue.current.sha=result.sha;
      if(saveQueue.current.pending) flushSave();
      setLocalOnly(false);
      setConflict(false);
      setNotice("Salvo no D1");
      void utils.data.status.invalidate();
      window.setTimeout(() => setNotice(null), 2200);
    },
    onError: error => {
      saveQueue.current.busy=false;saveQueue.current.pending??=saveQueue.current.inflight;saveQueue.current.inflight=undefined;
      if (error.data?.code === "CONFLICT") {saveQueue.current.blocked=true;setConflict(true);}
      else setLocalOnly(true);
    },
  });

  const flushSave = () => {
    const queue=saveQueue.current;if(queue.busy||queue.blocked||!queue.pending||!navigator.onLine)return;
    const next=queue.pending;queue.pending=undefined;queue.inflight=next;queue.busy=true;
    saveMutation.mutate({path:"library.json",data:next as unknown as Record<string,unknown>,expectedSha:queue.sha??sha});
  };
  const saveLibrary = (nextLibrary: LibraryDocument) => {
    const persistedLibrary = { ...nextLibrary, versionId: nextLibrary.versionId ?? stableId("version"), books: nextLibrary.books.map(hydrateSemanticBook) };
    safeLocalSet("shakstory:library", JSON.stringify(persistedLibrary));
    void saveLibraryBackup(persistedLibrary).catch(()=>{if(!navigator.onLine)setNotice("Não foi possível guardar a cópia offline. Mantenha esta página aberta até sincronizar.");});
    setLibrary(persistedLibrary);
    saveQueue.current.pending=persistedLibrary;
    if (!navigator.onLine) { setLocalOnly(true); return; }
    flushSave();
  };

  useEffect(()=>{const resume=()=>flushSave();window.addEventListener("online",resume);return()=>window.removeEventListener("online",resume);},[]);
  const skipTracking = useRef(false);
  const materializeDraft = (book: Book): Book => {
    if (book.id !== activeBookId || !activeNode || (draft === activeNode.content && draftHtml === (activeNode.richContent ?? ""))) return book;
    const nodes = book.nodes.map(node => node.id === activeNode.id ? { ...node, content: draft, richContent: draftHtml || undefined, updatedAt: Date.now() } : node);
    return {
      ...book, nodes, updatedAt: Date.now(),
      writingProgress: recordDailyProgress(book.writingProgress, activeNode.content, draft),
      semanticBook: reconcileManuscriptStructure({ id: book.id, title: book.title, nodes }, book.semanticBook),
      review: book.review?.tracking && !skipTracking.current ? { ...book.review, changes: mergeTrackedRevision(book.review.changes ?? [], { id: stableId("revision"), nodeId: activeNode.id, before: activeNode.content, after: draft, beforeHtml: activeNode.richContent ?? "", afterHtml: draftHtml, createdAt: Date.now(), status: "pending" }) } : book.review,
    };
  };
  const refreshDraftForNodes = (nodes: Node[]) => {
    const node = nodes.find(node => node.id === activeNode?.id) ?? nodes.find(node => node.kind !== "part") ?? nodes[0];
    if (!node) return;
    setActiveNodeId(node.id); setDraft(node.content); setDraftHtml(node.richContent ?? "");
    safeLocalSet(`shakstory:node:${node.id}`, node.content); safeLocalSet(`shakstory:node:${node.id}:html`, node.richContent ?? "");
  };
  const updateBook = (patch: Partial<Book>) => {
    if (!activeBookId) return;
    let replacementNodes: Node[] | undefined;
    const nextLibrary = { ...library, books: library.books.map(book => {
      if (book.id !== activeBookId) return book;
      const edited = materializeDraft(book);
      const restoring = Boolean(patch.id && patch.nodes);
      const nodes = patch.nodes?.map(node => {
        const original = book.nodes.find(value => value.id === node.id);
        const working = edited.nodes.find(value => value.id === node.id);
        return !restoring && original && working && node.content === original.content && node.richContent === original.richContent ? { ...node, content: working.content, richContent: working.richContent } : node;
      }) ?? edited.nodes;
      if (patch.nodes) replacementNodes = nodes;
      const review = patch.review ? { ...patch.review, changes: edited !== book && patch.review.changes === book.review?.changes ? edited.review?.changes : patch.review.changes } : edited.review;
      return { ...edited, ...patch, nodes, review, semanticBook: reconcileManuscriptStructure({ id: book.id, title: patch.title ?? book.title, nodes }, patch.semanticBook ?? edited.semanticBook), updatedAt: Date.now() };
    }) };
    if (replacementNodes) refreshDraftForNodes(replacementNodes);
    setLibrary(nextLibrary); saveLibrary(nextLibrary);
  };
  const selectManuscriptNode = (id: string) => { updateBook({}); setActiveNodeId(id); };
  const commitStructure = (transform: (nodes: Node[]) => Node[], merge?: { from: string; to: string }) => {
    if (!activeBook) return false;
    const working = materializeDraft(activeBook);
    const nodes = transform(working.nodes);
    if (nodes === working.nodes) return false;
    const changed = working.nodes.filter(node => node.kind !== "part" && (!nodes.some(next => next.id === node.id) || nodes.some(next => next.id === node.id && (next.content !== node.content || next.richContent !== node.richContent))));
    let review = working.review;
    if (changed.length) review = { ...review, versions: [...changed.map(node => ({ id: stableId("version"), nodeId: merge && node.id === merge.from ? merge.to : node.id, title: node.title, text: node.content, html: node.richContent ?? "", createdAt: Date.now() })), ...(review?.versions ?? [])] };
    if (merge && review) review = { ...review, comments: review.comments?.map(value => value.nodeId === merge.from ? { ...value, nodeId: merge.to } : value), versions: review.versions?.map(value => value.nodeId === merge.from ? { ...value, nodeId: merge.to } : value), changes: review.changes?.map(value => value.nodeId === merge.from ? { ...value, nodeId: merge.to } : value) };
    if (review?.tracking) {
      let changes = review.changes ?? [];
      for (const before of changed) {
        const after = nodes.find(node => node.id === before.id);
        if (after) changes = mergeTrackedRevision(changes, { id: stableId("revision"), nodeId: before.id, before: before.content, after: after.content, beforeHtml: before.richContent ?? "", afterHtml: after.richContent ?? "", createdAt: Date.now(), status: "pending" });
      }
      review = { ...review, changes };
    }
    const book = { ...working, nodes, review, semanticBook: reconcileManuscriptStructure({ id: working.id, title: working.title, nodes }, working.semanticBook), updatedAt: Date.now() };
    const nextLibrary = { ...library, books: library.books.map(value => value.id === book.id ? book : value) };
    refreshDraftForNodes(nodes); setAssistResult(null); setCoauthorUndo(null); setLibrary(nextLibrary); saveLibrary(nextLibrary);
    return true;
  };
  const splitActiveNode = (cursorOffset?: number) => {
    if (!activeNode || activeNode.kind === "part") return;
    const offset = cursorOffset ?? Math.floor(draft.length / 2);
    if (!commitStructure(nodes => splitNode(nodes, activeNode.id, offset, Date.now()))) setNotice("Não foi possível dividir aqui. Escolha uma posição interna ao texto; confira se a formatação corresponde ao conteúdo.");
  };
  const mergeActiveNode = () => {
    if (!activeBook || !activeNode || activeNode.kind === "part") return;
    const next = activeBook.nodes[activeBook.nodes.findIndex(node => node.id === activeNode.id) + 1];
    if (next && next.kind !== "part") commitStructure(nodes => mergeNodes(nodes, activeNode.id, next.id, Date.now()), { from: next.id, to: activeNode.id });
  };

  const createBook = () => {
    const title = newBookTitle.trim();
    if (!title) return;
    const now = Date.now();
    const bookId = stableId("book");
    const hierarchy = buildBookHierarchy(bookId, newBookUniverseName, newBookSeriesName);
    const book: Book = hydrateSemanticBook({ id: bookId, title, status: "planning", targetWordCount: 50000, startedAt: now, lastOpenedAt: now, editSeconds: 0, updatedAt: now, nodes: [createInitialNode(now)], publication: { author: "", genre: "", category: "", language: "Português", description: "", isbn: "", publicationDate: "", includeToc: true, typography: "classic" }, hierarchy });
    const nextLibrary = { ...library, books: [book, ...library.books] };
    setLibrary(nextLibrary);
    restoredWorkspace.current = true;
    setActiveBookId(book.id);
    safeLocalSet("shakstory:active-book", book.id);
    setActiveNodeId(book.nodes[0].id);
    safeLocalSet("shakstory:active-node", book.nodes[0].id);
    setNewBookTitle("");
    setNewBookUniverseName("");
    setNewBookSeriesName("");
    setNewBookOpen(false);
    setView("project");
    saveLibrary(nextLibrary);
  };

  const updateDraft = (value: string, html?: string) => {
    setAssistResult(null);
    setDraft(value);
    setDraftHtml(html ?? continuationToHtml(value));
    if (activeNode) { safeLocalSet(`shakstory:node:${activeNode.id}`, value); safeLocalSet(`shakstory:node:${activeNode.id}:html`, html ?? continuationToHtml(value)); }
  };

  const applyCoauthorExpansion = (expandedText: string) => {
    if (!activeNode || !expandedText.trim()) return;
    setCoauthorUndo({ nodeId: activeNode.id, text: draft, html: draftHtml });
    const baseHtml = draftHtml || continuationToHtml(draft);
    updateDraft(
      appendContinuationText(draft, expandedText),
      appendContinuationHtml(baseHtml, expandedText),
    );
    setCoauthorResult(null);
    setCoauthorExpansion(null);
    setNotice("Continuação expandida aplicada · desfazer disponível");
    window.setTimeout(() => setNotice(null), 2600);
  };

  const undoCoauthorApplication = () => {
    if (!activeNode || !coauthorUndo || coauthorUndo.nodeId !== activeNode.id) return;
    updateDraft(coauthorUndo.text, coauthorUndo.html);
    setCoauthorUndo(null);
    setNotice("Continuação da Cowila desfeita");
    window.setTimeout(() => setNotice(null), 2200);
  };

  const chooseBook = (book: Book) => {
    restoredWorkspace.current = true;
    const lastOpenedAt = Date.now();
    setActiveBookId(book.id);
    safeLocalSet("shakstory:active-book", book.id);
    setActiveNodeId(book.nodes[0]?.id ?? null);
    if (book.nodes[0]) safeLocalSet("shakstory:active-node", book.nodes[0].id);
    setLibrary(current => ({ ...current, books: current.books.map(entry => entry.id === book.id ? { ...entry, lastOpenedAt, updatedAt: lastOpenedAt } : entry) }));
    setView("project");
  };

  useEffect(() => { if (activeBookId) safeLocalSet("shakstory:active-book", activeBookId); if (activeNodeId) safeLocalSet("shakstory:active-node", activeNodeId); }, [activeBookId, activeNodeId]);

  useEffect(() => {
    if (view !== "editor" || !activeBookId) return;
    let lastPersistedAt = Date.now();
    const persistEditingTime = () => {
      const now = Date.now();
      const elapsed = Math.max(1, Math.round((now - lastPersistedAt) / 1000));
      lastPersistedAt = now;
      setLibrary(current => {
        const next = { ...current, books: current.books.map(book => book.id === activeBookId ? { ...book, editSeconds: (book.editSeconds ?? 0) + elapsed, updatedAt: Date.now() } : book) };
        safeLocalSet("shakstory:library", JSON.stringify(next));
        return next;
      });
    };
    const timer = window.setInterval(persistEditingTime, 60000);
    return () => { window.clearInterval(timer); persistEditingTime(); };
  }, [view, activeBookId]);

  const updateNodeList = (transform: (nodes: Node[]) => Node[]) => { commitStructure(transform); };

  const deleteActiveBook = () => {
    if (!activeBookId) return;
    const nextLibrary = { ...library, books: library.books.filter(book => book.id !== activeBookId) };
    setLibrary(nextLibrary);
    setActiveBookId(null);
    setActiveNodeId(null);
    localStorage.removeItem("shakstory:active-book");
    localStorage.removeItem("shakstory:active-node");
    setBookDialog(null);
    setView("library");
    saveLibrary(nextLibrary);
  };

  const resetActiveBook = () => {
    if (!activeBookId) return;
    const current = library.books.find(book => book.id === activeBookId);
    if (!current) return;
    const now = Date.now();
    const resetNodes = [createInitialNode(now)];
    const resetBook = { ...current, nodes: resetNodes, semanticBook: migrateLegacyNodes({ id: current.id, title: current.title, nodes: resetNodes.map(node => ({ ...node, kind: node.kind as "part" | "chapter" | "scene" })) }), planning: { characters: [], locations: [], timeline: [] }, story: { objectives: [], conflicts: [], relations: [], notes: [], noteIds: [], noteStatuses: [], scenes: [] }, status: "planning" as EditorialStatus, updatedAt: now, lastOpenedAt: now, editSeconds: 0 };
    const nextLibrary = { ...library, books: library.books.map(book => book.id === activeBookId ? resetBook : book) };
    setLibrary(nextLibrary);
    setActiveNodeId(resetBook.nodes[0].id);
    safeLocalSet("shakstory:active-node", resetBook.nodes[0].id);
    setBookDialog(null);
    setView("project");
    saveLibrary(nextLibrary);
  };

  const quickExport = async (book: Book, format: "pdf" | "epub" | "docx" | "txt" | "html") => {
    const publication = book.publication ?? { author: "", genre: "", language: "Português", description: "", includeToc: true, typography: "classic" as TypographyPreset };
    try {
    const exportBook = await prepareExportAssets({ bookId: book.id, copyright: publication.copyright, publicationYear: publication.publicationYear, title: book.title, subtitle: book.subtitle, author: publication.author, language: publication.language, description: publication.description, category: publication.category, isbn: publication.copyright?.isbns?.[format === "epub" ? "epub" : format === "pdf" ? "pdf" : "paperback"] || publication.isbn, publicationDate: publication.publicationDate, frontMatter:publicationSections({...publication,bookId:book.id}),backMatter:publication.backMatter,trimSize:publication.trimSize,marginPreset:publication.marginPreset,headerText:publication.headerText,footerText:publication.footerText,layout: "classic" as const, typography: publication.typography ?? "classic", coverImageUrl: publication.coverImageUrl, includeToc: publication.includeToc !== false, chapters: chaptersFromNodes(book.nodes) });
    const downloadBlob = (blob: Blob, extension: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${book.title}.${extension}`; anchor.click(); URL.revokeObjectURL(url); };
    if (format === "pdf") downloadBlob(buildPdf(exportBook), "pdf");
    if (format === "epub") downloadBlob(await buildEpub(exportBook), "epub");
    if (format === "docx") downloadBlob(await buildDocx(await prepareExportAssets(exportBook)), "docx");
    if (format === "html") downloadBlob(new Blob([buildPrintHtml(exportBook)], { type: "text/html" }), "html");
    if (format === "txt") downloadBlob(new Blob([buildText(exportBook)], { type: "text/plain;charset=utf-8" }), "txt");
    setNotice(`${format.toUpperCase()} pronto`);
    window.setTimeout(() => setNotice(null), 2200);
    } catch(error) {setNotice(error instanceof Error ? error.message : "Não foi possível exportar o livro.");}
  };

  const updatePlanning = (planning: PlanningData & { story?: StoryData }) => {
    if (!activeBookId) return;
    const { story, ...planningOnly } = planning;
    const nextLibrary = { ...library, books: library.books.map(book => book.id === activeBookId ? { ...book, planning: planningOnly, ...(story ? { story, semanticBook: book.semanticBook ? { ...book.semanticBook, plannedScenes: story.scenes } : book.semanticBook } : {}), updatedAt: Date.now() } : book) };
    setLibrary(nextLibrary);
    saveLibrary(nextLibrary);
  };

  const navigate = (nextView: View) => {
    if(activeNode && (draft!==activeNode.content || draftHtml!==(activeNode.richContent??"")))updateBook({});
    if (nextView === "library" || nextView === "security") {
      setView(nextView);
      return;
    }

    const selectedBook = activeBook ?? [...library.books].sort((left, right) =>
      (right.lastOpenedAt ?? right.updatedAt) - (left.lastOpenedAt ?? left.updatedAt)
    )[0] ?? null;

    if (!selectedBook) {
      setView("library");
      setNewBookOpen(true);
      setNotice("Crie um livro para acessar esta área.");
      window.setTimeout(() => setNotice(null), 2400);
      return;
    }

    if (activeBookId !== selectedBook.id) {
      setActiveBookId(selectedBook.id);
      safeLocalSet("shakstory:active-book", selectedBook.id);
      const nodeId = selectedBook.nodes.some(node => node.id === activeNodeId)
        ? activeNodeId
        : selectedBook.nodes[0]?.id ?? null;
      setActiveNodeId(nodeId);
      if (nodeId) safeLocalSet("shakstory:active-node", nodeId);
    }

    if (nextView === "editor" && (selectedBook.status === "planning" || selectedBook.status === "draft")) {
      if(selectedBook.id === activeBookId) updateBook({status:"editing"});
      else {
      const nextLibrary = {
        ...library,
        books: library.books.map(book =>
          book.id === selectedBook.id
            ? { ...book, status: "editing" as EditorialStatus, updatedAt: Date.now() }
            : book
        ),
      };
      setLibrary(nextLibrary);
      safeLocalSet("shakstory:library", JSON.stringify(nextLibrary));
      }
    }

    setView(nextView);
  };

  const syncLabel = statusQuery.data?.status === "syncing" || saveMutation.isPending ? "Sincronizando" : localOnly ? "Somente local" : statusQuery.data?.status === "conflict" || conflict ? "Conflito" : statusQuery.data?.status === "synced" ? "Sincronizado" : "Pronto para salvar";

  const filteredBooks = library.books.filter(book => !query.trim() || book.title.toLowerCase().includes(query.toLowerCase()) || book.nodes.some(node => node.content.toLowerCase().includes(query.toLowerCase())));


  return <div className="sk-app min-h-screen bg-background text-foreground">
    <aside className="sk-sidebar"><div className="sk-brand"><div className="sk-brand-mark"><BookOpen className="h-4 w-4" aria-hidden="true" /></div><div><p className="font-serif text-xl leading-none">Shakstory</p><p className="mt-1 text-[10px] uppercase tracking-[0.18em] opacity-60">Estúdio do autor</p></div></div>{activeBook && view !== "library" && <div className="sk-bookcard"><BookCover book={activeBook} className="sk-cover-mini" /><div className="min-w-0 flex-1"><p className="truncate font-serif text-sm">{activeBook.title}</p><p className="mt-0.5 text-[11px] opacity-60">{formatNumber(wordsOf(activeBook))} palavras · {statusLabel(activeBook.status)}</p><div className="sk-bookcard-bar"><span style={{ width: `${Math.min(100, Math.round(wordsOf(activeBook) / Math.max(1, activeBook.targetWordCount) * 100))}%` }} /></div></div></div>}<nav aria-label="Navegação principal" className="sk-nav"><RailButton active={view === "library"} icon={BookOpen} label="Biblioteca" onClick={() => setView("library")} /><span className="sk-nav-label">Seu livro</span><RailButton active={view === "project"} icon={Target} label="Projeto" onClick={() => navigate("project")} /><RailButton active={view === "editor"} icon={FileText} label="Manuscrito" onClick={() => navigate("editor")} /><RailButton active={view === "planning"} icon={UsersRound} label="Planejar" onClick={() => navigate("planning")} /><RailButton active={view === "prepare"} icon={Sparkles} label="Preparar" onClick={() => navigate("prepare")} /><span className="sk-nav-label">Proteção</span><RailButton active={view === "security"} icon={ShieldCheck} label="Segurança" onClick={() => navigate("security")} /></nav></aside>
    <div className="sk-main"><header className="sk-topbar sticky top-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur"><div className="flex items-center gap-3 px-4 py-3 sm:px-6"><Button className="lg:hidden" variant="ghost" size="icon" aria-label="Abrir menu de navegação" onClick={() => setMenuOpen(current => !current)}><Menu className="h-4 w-4" /></Button><div className="flex items-center gap-2 lg:hidden"><div className="sk-brand-mark sk-brand-mark-sm"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" /></div><span className="font-serif text-lg leading-none">Shakstory</span></div><div aria-label="Você está em" className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:flex"><span>Biblioteca</span>{view !== "library" && <><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /><span className="truncate font-medium text-foreground">{viewLabels[view]}</span></>}</div><div className="ml-auto flex items-center gap-2"><span className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs sm:inline-flex ${localOnly || conflict ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"}`}><SyncIcon localOnly={localOnly} conflict={conflict} />{syncLabel}</span><Button variant="ghost" size="sm" onClick={() => toggleTheme?.()} aria-label="Alternar tema">{theme === "dark" ? "Tema clássico" : "Tema escuro"}</Button><Button variant="ghost" size="icon" aria-label="Buscar" onClick={() => { if (view !== "library") setView("library"); window.setTimeout(() => document.getElementById("library-search")?.focus(), 80); }}><Search className="h-4 w-4" /></Button></div></div></header>
    {menuOpen && <div className="fixed inset-0 z-20 bg-black/10" onClick={() => setMenuOpen(false)}><aside className="absolute left-3 top-16 w-64 rounded-2xl border border-border bg-card p-3 shadow-xl" role="dialog" aria-label="Menu de navegação" onClick={event => event.stopPropagation()}><div className="mb-2 flex items-center justify-between px-2"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Navegação</p><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X className="h-4 w-4" /></Button></div><div className="grid gap-1"><NavButton active={view === "library"} icon={BookOpen} label="Biblioteca" onClick={() => { setView("library"); setMenuOpen(false); }} /><NavButton active={view === "project"} icon={Target} label="Projeto" onClick={() => { navigate("project"); setMenuOpen(false); }} /><NavButton active={view === "editor"} icon={FileText} label="Manuscrito" onClick={() => { navigate("editor"); setMenuOpen(false); }} /><NavButton active={view === "planning"} icon={UsersRound} label="Planejar" onClick={() => { navigate("planning"); setMenuOpen(false); }} /><NavButton active={view === "prepare"} icon={Sparkles} label="Preparar" onClick={() => { navigate("prepare"); setMenuOpen(false); }} /><NavButton active={view === "security"} icon={ShieldCheck} label="Segurança" onClick={() => { setView("security"); setMenuOpen(false); }} /></div></aside></div>}
    {conflict && <div className="border-b border-amber-500/25 bg-amber-500/10"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 text-sm text-amber-900 dark:text-amber-100"><span>Outra sessão alterou o documento antes deste salvamento. Recarregue antes de substituir o conteúdo.</span><Button size="sm" variant="outline" onClick={() => { setConflict(false); void libraryQuery.refetch(); }}>Recarregar</Button></div></div>}
    <main className="shakstory-workspace mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10 lg:pb-14"><WritingPreferences hidden/>{view === "library" && <ManuscriptImport onImport={(title, preview) => { const now=Date.now(); const book=hydrateSemanticBook({id:stableId("book"),title,status:"draft",targetWordCount:50000,updatedAt:now,nodes:preview.chapters.map((chapter,index)=>({id:stableId("chapter"),title:chapter.title||`Capítulo ${index+1}`,kind:"chapter",content:chapter.content,richContent:sanitizeRichContent(chapter.richContent),updatedAt:now}))}); const next={...library,books:[book,...library.books]};setLibrary(next);saveLibrary(next); }} />}{(view === "editor" || view === "prepare") && activeBook && <EditorialWorkbench key={view} initiallyOpen={view==="prepare"} initialTab={view==="prepare"?"copyright":"review"} publication={{...(activeBook.publication ?? {author:"",genre:"",language:"pt-BR",description:""}),bookId:activeBook.id}} review={activeBook.review} node={activeNode} nodes={activeBook.nodes} onSelect={selectManuscriptNode} text={draft} html={draftHtml} onPublication={publication=>updateBook({publication:{...activeBook.publication,...publication} as PublicationData})} onReview={review=>updateBook({review})} onRestore={(text,html)=>{skipTracking.current=draft!==text || draftHtml!==html;updateDraft(text,html);}} />}{view === "library" && <LibraryView books={filteredBooks} totalWords={totalWords} query={query} onQuery={setQuery} onOpen={chooseBook} onNew={() => setNewBookOpen(true)} onEdit={book => { setActiveBookId(book.id); setBookDialog("edit"); }} onReset={book => { setActiveBookId(book.id); setBookDialog("reset"); }} onDelete={book => { setActiveBookId(book.id); setBookDialog("delete"); }} onExport={quickExport} />}{view === "project" && activeBook && <ProjectView book={materializeDraft(activeBook)} onNavigate={navigate} onUpdate={updateBook} />}{view === "editor" && activeBook && <EditorView book={activeBook} nodes={activeBook.nodes} activeNode={activeNode} draft={draft} richContent={draftHtml} onDraftChange={updateDraft} onRichDraftChange={(value, html) => updateDraft(value, html)} onSelectNode={selectManuscriptNode} onBack={() => setView("library")} onSave={() => updateBook({})} onUpdateBook={updateBook} onOpenPlanning={() => navigate("planning")} onOpenPrepare={() => navigate("prepare")} onAddChapter={() => updateNodeList(nodes => addChapter(nodes, Date.now()))} onAddPart={() => updateNodeList(nodes => addPart(nodes, Date.now()))} onRenameNode={(id, title) => updateNodeList(nodes => renameNode(nodes, id, title, Date.now()))} onDuplicateNode={id => updateNodeList(nodes => duplicateNode(nodes, id, Date.now()))} onMoveNode={(id, direction) => updateNodeList(nodes => moveNode(nodes, id, direction))} onRemoveNode={id => updateNodeList(nodes => removeNode(nodes, id))} onSplitNode={splitActiveNode} onMergeNode={mergeActiveNode} onPromotePlannedScene={scene => updateNodeList(nodes => nodes.some(node => node.id === scene.id) ? nodes : [...nodes, { id: scene.id, title: scene.title, kind: "scene", content: "", updatedAt: Date.now() }])} saving={saveMutation.isPending} notice={notice} assistant={{ focus: assistFocus, setFocus: setAssistFocus, result: assistResult, models: modelQuery.data?.models ?? [], isLoading: literaryMutation.isPending, error: literaryMutation.error?.message ?? null, onAnalyze: () => { if (activeNode && draft.trim()) literaryMutation.mutate({ text: draft, focus: assistFocus, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, role: assistFocus === "narrative" ? "developmental_editor" : assistFocus === "grammar" || assistFocus === "language" || assistFocus === "parts_of_speech" ? "copy_editor" : "line_editor", task: "analyze", bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, planning: activeBook.planning, story: activeBook.story, styleSample: styleSampleForBook(activeBook, activeNode.id, draft) }); }, onApply: (start, end, original, suggestion) => { if (!original || !suggestion || draft.slice(start, end) !== original) return; updateDraft(applySuggestionAtOffsets(draft, start, end, original, suggestion)); }, coauthorResult, coauthorLoading: coauthorMutation.isPending, coauthorError: coauthorMutation.error?.message ?? null, coauthorExpansion, coauthorExpansionLoading: expandCoauthorMutation.isPending, coauthorExpansionError: expandCoauthorMutation.error?.message ?? null, onGenerate: options => { if (!activeNode) return; setCoauthorExpansion(null); coauthorMutation.mutate({ bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, text: draft, intent: options.intent, targetWords: 180, alternativeCount: 3, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, planning: activeBook.planning, story: activeBook.story, styleSample: styleSampleForBook(activeBook, activeNode.id, draft) }); }, onChoose: (alternative, intent) => { if (!activeNode) return; setCoauthorExpansion(null); expandCoauthorMutation.mutate({ bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, text: draft, selectedAlternative: alternative, intent, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, planning: activeBook.planning, story: activeBook.story, styleSample: styleSampleForBook(activeBook, activeNode.id, draft) }); }, onApplyExpansion: applyCoauthorExpansion, onBackToSamples: () => setCoauthorExpansion(null), onReject: () => { setCoauthorResult(null); setCoauthorExpansion(null); }, canUndoCoauthor: Boolean(activeNode && coauthorUndo?.nodeId === activeNode.id), onUndoCoauthor: undoCoauthorApplication }} continuity={{ result: continuityResult, loading: continuityMutation.isPending, error: continuityMutation.error?.message ?? null, onCheck: () => { if (!activeNode) return; continuityMutation.mutate({ bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, text: draft, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, planning: activeBook.planning, story: activeBook.story }); }, onClear: () => setContinuityResult(null) }} />}{view === "planning" && activeBook && <PlanningView book={activeBook} onUpdate={updatePlanning} />}{view === "prepare" && activeBook && <PreparationView book={activeBook} onUpdate={updateBook} />}{view === "security" && <AntivirusSecurityView />}</main></div>
    {newBookOpen && <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="new-book-title"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Novo projeto</p><h2 id="new-book-title" className="mt-2 font-serif text-3xl">Comece a história.</h2></div><Button size="icon" variant="ghost" onClick={() => setNewBookOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></Button></div><p className="mt-3 text-sm leading-6 text-muted-foreground">O primeiro capítulo será criado automaticamente. Você pode completar os metadados quando quiser.</p><label className="mt-6 block text-xs font-medium text-muted-foreground">Título<Input className="mt-2" autoFocus value={newBookTitle} onChange={event => setNewBookTitle(event.target.value)} onKeyDown={event => event.key === "Enter" && createBook()} placeholder="O nome do seu livro" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Universo<Input className="mt-2" value={newBookUniverseName} onChange={event => setNewBookUniverseName(event.target.value)} placeholder="Opcional" /></label><label className="text-xs font-medium text-muted-foreground">Série<Input className="mt-2" value={newBookSeriesName} onChange={event => setNewBookSeriesName(event.target.value)} placeholder="Opcional" /></label></div><p className="mt-2 text-[11px] leading-4 text-muted-foreground">Livros com os mesmos nomes de Universo e Série compartilham a mesma identidade narrativa.</p><Button className="mt-5 w-full" onClick={createBook} disabled={!newBookTitle.trim()}><Plus className="mr-2 h-4 w-4" />Criar livro</Button></div></div>}
    {bookDialog && activeBook && <BookDialog mode={bookDialog} book={activeBook} onClose={() => setBookDialog(null)} onSave={patch => { updateBook(patch); setBookDialog(null); }} onReset={resetActiveBook} onDelete={deleteActiveBook} />}
  </div>;
}

function RailButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof BookOpen; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`sk-nav-item${active ? " is-active" : ""}`}><Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>{label}</span></button>; }
function BookCover({ book, className = "" }: { book: Book; className?: string }) { const hue = coverHue(book.title); return <div className={`sk-cover ${className}`} style={{ background: `linear-gradient(150deg, hsl(${hue} 42% 42%), hsl(${(hue + 40) % 360} 45% 24%))` }}>{book.publication?.coverImageUrl ? <img src={book.publication.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="font-serif italic">{book.title.charAt(0).toUpperCase()}</span>}</div>; }
function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof BookOpen; label: string; onClick: () => void }) { return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>; }
function SyncIcon({ localOnly, conflict }: { localOnly: boolean; conflict: boolean }) { return conflict || localOnly ? <CloudOff className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />; }

function LibraryView({ books, totalWords, query, onQuery, onOpen, onNew, onEdit, onReset, onDelete, onExport }: { books: Book[]; totalWords: number; query: string; onQuery: (value: string) => void; onOpen: (book: Book) => void; onNew: () => void; onEdit: (book: Book) => void; onReset: (book: Book) => void; onDelete: (book: Book) => void; onExport: (book: Book, format: "pdf" | "epub" | "docx" | "txt" | "html") => void }) {
  const [archive, setArchive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<EditorialStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "progress">("updated");
  const visibleBooks = [...books].filter(book => Boolean(book.archived) === archive).filter(book => statusFilter === "all" || book.status === statusFilter).sort((left, right) => sortBy === "title" ? left.title.localeCompare(right.title, "pt-BR") : sortBy === "progress" ? (countWords(right.nodes.map(node => node.content).join("\n")) / Math.max(1, right.targetWordCount)) - (countWords(left.nodes.map(node => node.content).join("\n")) / Math.max(1, left.targetWordCount)) : right.updatedAt - left.updatedAt);
  const lastBook = [...books].filter(book => !book.archived).sort((left, right) => (right.lastOpenedAt ?? right.updatedAt) - (left.lastOpenedAt ?? left.updatedAt))[0];
  const lastWords = lastBook ? wordsOf(lastBook) : 0;
  const lastProgress = lastBook ? Math.min(100, Math.round(lastWords / Math.max(1, lastBook.targetWordCount) * 100)) : 0;
  return <div className="library-view animate-in fade-in-0 duration-300"><div className="library-intro flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Seu espaço de criação</p><h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">Minha biblioteca</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Os últimos livros ficam aqui, com o estado editorial e os dados necessários para retomar ou preparar uma publicação.</p></div><Button onClick={onNew} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Novo livro</Button></div>{lastBook && !archive && <section aria-label="Retomar escrita" className="sk-hero mt-8"><BookCover book={lastBook} className="sk-cover-lg" /><div className="min-w-0 flex-1"><p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">Último livro aberto</p><h2 className="mt-2 truncate font-serif text-3xl">{lastBook.title}</h2><p className="mt-1 text-sm opacity-70">{formatNumber(lastWords)} de {formatNumber(lastBook.targetWordCount)} palavras · {formatDate(lastBook.lastOpenedAt ?? lastBook.updatedAt)}</p><div className="sk-hero-bar mt-4"><span style={{ width: `${lastProgress}%` }} /></div><div className="mt-5 flex flex-wrap items-center gap-3"><Button aria-label={`Retomar ${lastBook.title}`} className="sk-hero-cta" onClick={() => onOpen(lastBook)}>Retomar de onde parou<ChevronRight className="ml-1.5 h-4 w-4" /></Button><span className="text-xs opacity-70">{lastProgress}% da meta</span></div></div></section>}<div className="mt-8 grid gap-3 sm:grid-cols-3"><Stat label="Projetos" value={String(books.length)} icon={BookOpen} /><Stat label="Palavras escritas" value={formatNumber(totalWords)} icon={FileText} /><Stat label="Foco desta sessão" value="Sem pressão" icon={Target} /></div><div className="mt-9 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-serif text-2xl">{archive ? "Livros arquivados" : "Projetos recentes"}</h2><Button variant="ghost" onClick={()=>setArchive(!archive)}>{archive ? "Ver biblioteca" : "Ver arquivo"}</Button></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="library-search" value={query} onChange={event => onQuery(event.target.value)} className="h-9 pl-9 text-xs" placeholder="Buscar na biblioteca" /></div><select aria-label="Filtrar por status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as EditorialStatus | "all")} className="h-9 rounded-md border border-input bg-background px-2 text-xs"><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Ordenar biblioteca" value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} className="h-9 rounded-md border border-input bg-background px-2 text-xs"><option value="updated">Mais recentes</option><option value="title">Título</option><option value="progress">Progresso</option></select></div></div>{visibleBooks.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 sm:p-12"><Sparkles className="h-5 w-5 text-primary" /><h3 className="mt-4 font-serif text-3xl">A primeira página está esperando.</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Crie um projeto e comece pelo lugar que a sua história pede.</p><Button onClick={onNew} variant="outline" className="mt-6 rounded-xl">Criar meu primeiro livro</Button></div> : <div className="mt-4 grid gap-4 xl:grid-cols-2">{visibleBooks.map(book => <BookCard key={book.id} book={book} onOpen={() => onOpen(book)} onEdit={() => onEdit(book)} onReset={() => onReset(book)} onDelete={() => onDelete(book)} onExport={format => onExport(book, format)} />)}</div>}</div>;
}
function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BookOpen }) { return <div className="rounded-xl border border-border/70 bg-card p-4"><Icon className="h-4 w-4 text-primary" /><p className="mt-5 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-serif text-2xl">{value}</p></div>; }
function BookCard({ book, onOpen, onEdit, onReset, onDelete, onExport }: { book: Book; onOpen: () => void; onEdit: () => void; onReset: () => void; onDelete: () => void; onExport: (format: "pdf" | "epub" | "docx" | "txt" | "html") => void }) { const words = book.nodes.reduce((sum, node) => sum + countWords(node.content), 0); const chapters = book.nodes.filter(node => node.kind === "chapter").length; const progress = Math.min(100, Math.round((words / Math.max(1, book.targetWordCount)) * 100)); return <article className="library-book-card rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"><div className="flex gap-4"><button onClick={onOpen} aria-label={`Continuar ${book.title}`} className="group flex min-w-0 flex-1 gap-4 text-left"><div className="library-cover grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/90 to-primary/50 text-primary-foreground">{book.publication?.coverImageUrl ? <img src={book.publication.coverImageUrl} alt={`Capa de ${book.title}`} className="h-full w-full object-cover"/> : <span className="font-serif text-4xl italic">{book.title.charAt(0).toUpperCase()}</span>}</div><div className="min-w-0 flex-1 py-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-serif text-xl">{book.title}</h3><p className="mt-1 text-xs text-primary">{statusLabel(book.status)}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" /></div><p className="mt-2 truncate text-xs text-muted-foreground">{book.publication?.author || "Autor ainda não informado"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">ISBN {book.publication?.isbn || "não informado"}</p></div></button></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground sm:grid-cols-4"><span><strong className="block text-foreground">{countPages(book)}</strong>páginas</span><span><strong className="block text-foreground">{chapters}</strong>capítulos</span><span><strong className="block text-foreground">{formatNumber(countCharacters(book))}</strong>caracteres</span><span><strong className="block text-foreground">{formatDuration(book.editSeconds)}</strong>edição</span></div><div className="mt-3 flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>{formatNumber(words)} palavras</span><span>{progress}%</span></div><Progress value={progress} className="h-1.5" /></div><span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(book.lastOpenedAt ?? book.updatedAt)}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar livro</Button><Button size="sm" onClick={onOpen}>Continuar</Button><Button size="sm" variant="ghost" onClick={onReset} aria-label={`Zerar ${book.title}`}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Zerar</Button><Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Excluir ${book.title}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir</Button><select aria-label={`Exportar ${book.title}`} className="h-9 rounded-md border border-input bg-background px-2 text-xs" defaultValue="" onChange={event => { const format = event.target.value as "pdf" | "epub" | "docx" | "txt" | "html"; if (format) onExport(format); event.currentTarget.value = ""; }}><option value="">Exportar…</option><option value="pdf">PDF</option><option value="epub">EPUB</option><option value="docx">DOCX</option><option value="txt">TXT</option><option value="html">HTML / ebook</option></select></div></article>; }

function BookDialog({ mode, book, onClose, onSave, onReset, onDelete }: { mode: "edit" | "reset" | "delete"; book: Book; onClose: () => void; onSave: (patch: Partial<Book>) => void; onReset: () => void; onDelete: () => void }) {
  const [archived,setArchived]=useState(book.archived??false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.publication?.author ?? "");
  const [isbn, setIsbn] = useState(book.publication?.isbn ?? "");
  const [universeName, setUniverseName] = useState(book.hierarchy?.universeName ?? "");
  const [seriesName, setSeriesName] = useState(book.hierarchy?.seriesName ?? "");
  const [status, setStatus] = useState<EditorialStatus>(book.status);
  const [targetWordCount, setTargetWordCount] = useState(String(book.targetWordCount));
  const dialogTitle = mode === "edit" ? "Editar livro" : mode === "reset" ? "Zerar história?" : "Excluir livro?";
  if (mode !== "edit") return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="book-action-title"><h2 id="book-action-title" className="font-serif text-3xl">{dialogTitle}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "reset" ? "Todos os capítulos, personagens, locais, eventos e notas deste livro serão substituídos por uma estrutura vazia. Essa ação exige confirmação e preserva o UUID do livro." : "O livro será removido da biblioteca e do documento editorial. Essa ação não pode ser desfeita."}</p><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="destructive" onClick={mode === "reset" ? onReset : onDelete}>{mode === "reset" ? "Confirmar zerar" : "Confirmar exclusão"}</Button></div></div></div>;
  const publication = book.publication ?? { author: "", genre: "", language: "Português", description: "" };
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/40 p-5 backdrop-blur-sm"><div className="my-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="book-action-title"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Metadados editoriais</p><h2 id="book-action-title" className="mt-2 font-serif text-3xl">{dialogTitle}</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X className="h-4 w-4" /></Button></div><label className="mt-4 flex gap-2"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Arquivar livro</label><label className="mt-6 block text-xs font-medium text-muted-foreground">Título<Input className="mt-2" value={title} onChange={event => setTitle(event.target.value)} /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Autor<Input className="mt-2" value={author} onChange={event => setAuthor(event.target.value)} placeholder="Nome do autor" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Universo<Input className="mt-2" value={universeName} onChange={event => setUniverseName(event.target.value)} placeholder="Opcional" /></label><label className="text-xs font-medium text-muted-foreground">Série<Input className="mt-2" value={seriesName} onChange={event => setSeriesName(event.target.value)} placeholder="Opcional" /></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">ISBN<Input className="mt-2" value={isbn} onChange={event => setIsbn(event.target.value)} placeholder="978…" /></label><label className="text-xs font-medium text-muted-foreground">Meta de palavras<Input className="mt-2" type="number" min="0" value={targetWordCount} onChange={event => setTargetWordCount(event.target.value)} /></label></div><label className="mt-4 block text-xs font-medium text-muted-foreground">Status editorial<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value as EditorialStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave({ archived, title: title.trim() || book.title, status, targetWordCount: Math.max(0, Number(targetWordCount) || 0), publication: { ...publication, author: author.trim(), isbn: isbn.trim() }, hierarchy: buildBookHierarchy(book.id, universeName, seriesName) })}>Salvar alterações</Button></div></div></div>;
}

function EditorView({ book, nodes, activeNode, draft, richContent, onDraftChange, onRichDraftChange, onSelectNode, onBack, onSave, onUpdateBook, onOpenPlanning, onOpenPrepare, onAddChapter, onAddPart, onRenameNode, onDuplicateNode, onMoveNode, onRemoveNode, onSplitNode, onMergeNode, onPromotePlannedScene, saving, notice, assistant, continuity }: { book: Book; nodes: Node[]; activeNode: Node | null; draft: string; richContent: string; onDraftChange: (value: string) => void; onRichDraftChange: (value: string, html: string) => void; onSelectNode: (id: string) => void; onBack: () => void; onSave: () => void; onUpdateBook: (patch: Partial<Book>) => void; onOpenPlanning: () => void; onOpenPrepare: () => void; onAddChapter: () => void; onAddPart: () => void; onRenameNode: (id: string, title: string) => void; onDuplicateNode: (id: string) => void; onMoveNode: (id: string, direction: "up" | "down") => void; onRemoveNode: (id: string) => void; onSplitNode: (offset?: number) => void; onMergeNode: () => void; onPromotePlannedScene: (scene: NonNullable<SemanticBook["plannedScenes"]>[number]) => void; saving: boolean; notice: string | null; assistant: LiteraryAssistantProps; continuity: ContinuityRadarProps }) {
  const [mobilePanel,setMobilePanel]=useState("writing");
  const [plainTextMode, setPlainTextMode] = useState(false);
  const [typewriterMode,setTypewriterMode]=useState(()=>localStorage.getItem("shakstory:typewriter-mode")==="true");
  const toggleTypewriter=()=>{const next=!typewriterMode;setTypewriterMode(next);setPlainTextMode(false);setMobilePanel("writing");safeLocalSet("shakstory:typewriter-mode",String(next));};
  const [distractionFree, setDistractionFree] = useState(false);
  const [findReplace, setFindReplace] = useState(false);
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"assistant" | "context" | "goals">("assistant");
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const sessionStart = React.useRef(Date.now());
  const sessionWordBaseline = React.useRef(countWords(draft));
  const richEditorRef = useRef<HTMLDivElement>(null);
  const splitCursor = useRef<number | undefined>(undefined);
  useEffect(() => { splitCursor.current = undefined; }, [activeNode?.id]);
  const rememberSplitCursor = () => {
    const element = richEditorRef.current; const selection = window.getSelection();
    if (!element || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) return;
    const prefix = document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(range.startContainer, range.startOffset);
    splitCursor.current = selectionTextOffset(draft, prefix.cloneContents().textContent ?? "");
  };
  const richEditorNodeRef = useRef<string | null>(null);
  const lastRichInputHtmlRef = useRef<string | null>(null);
  const lastRichInputTextRef = useRef<string | null>(null);

  useEffect(() => {
    sessionWordBaseline.current = countWords(draft);
    sessionStart.current = Date.now();
    setSessionNow(Date.now());
  }, [activeNode?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setSessionNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); }
      if (mod && event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); setDistractionFree(value => !value); }
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); setFindReplace(value => !value); }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onSave]);

  const manuscriptWords = nodes.reduce((sum, node) => sum + countWords(node.content), 0) - countWords(activeNode?.content ?? "") + countWords(draft);
  const targetWords = Math.max(0, book.targetWordCount || 0);
  const progress = targetWords ? Math.min(100, Math.round((manuscriptWords / targetWords) * 100)) : 0;
  const wordsThisSession = Math.max(0, countWords(draft) - sessionWordBaseline.current);
  const sessionMinutes = Math.max(1, Math.round((sessionNow - sessionStart.current) / 60000));
  const estimatedPages = Math.max(1, Math.ceil(manuscriptWords / 275));
  const readingMinutes = Math.max(1, Math.ceil(countWords(draft) / 220));
  const dailyGoal = Math.max(0, book.dailyGoalWords ?? 0);
  const styleDna = analyzeStyleDna(styleSampleForBook(book, activeNode?.id, draft));
  const replaceAll = () => { if (findTerm) onDraftChange(draft.split(findTerm).join(replaceTerm)); };
  const formatSelection = (command: string, value?: string) => { document.execCommand(command, false, value); };
  const toolbarButton = (label: string, command: string, value?: string) => <button type="button" aria-label={label} title={label} className="rounded px-2 py-1 hover:bg-secondary" onMouseDown={event => { event.preventDefault(); formatSelection(command, value); }}>{label}</button>;
  const editorToolbar = <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-card p-2 text-xs" aria-label="Barra de ferramentas de formatação">{toolbarButton("Negrito", "bold")}<button type="button" aria-label="Itálico" title="Itálico" className="rounded px-2 py-1 italic hover:bg-secondary" onMouseDown={event => { event.preventDefault(); formatSelection("italic"); }}>I</button><button type="button" aria-label="Sublinhado" title="Sublinhado" className="rounded px-2 py-1 underline hover:bg-secondary" onMouseDown={event => { event.preventDefault(); formatSelection("underline"); }}>U</button>{[1, 2, 3, 4, 5, 6].map(level => <React.Fragment key={level}>{toolbarButton(`Título H${level}`, "formatBlock", `<h${level}>`)}</React.Fragment>)}{toolbarButton("Citação", "formatBlock", "<blockquote>")}{toolbarButton("Lista com marcadores", "insertUnorderedList")}{toolbarButton("Lista numerada", "insertOrderedList")}{toolbarButton("Alinhar à esquerda", "justifyLeft")}{toolbarButton("Centralizar", "justifyCenter")}{toolbarButton("Alinhar à direita", "justifyRight")}{toolbarButton("Inserir separador", "insertHorizontalRule")}{toolbarButton("Limpar formatação", "removeFormat")}<button type="button" aria-label="Desfazer" title="Desfazer" className="rounded px-2 py-1 hover:bg-secondary" onMouseDown={event => { event.preventDefault(); formatSelection("undo"); }}>Desfazer</button><button type="button" aria-label="Refazer" title="Refazer" className="rounded px-2 py-1 hover:bg-secondary" onMouseDown={event => { event.preventDefault(); formatSelection("redo"); }}>Refazer</button><button type="button" aria-label="Localizar" title="Localizar" className="rounded px-2 py-1 hover:bg-secondary" onClick={() => setFindReplace(value => !value)}>Localizar</button><button type="button" aria-label="Inserir link" title="Inserir link" className="rounded px-2 py-1 hover:bg-secondary" onMouseDown={event => { event.preventDefault(); const url = window.prompt("URL do link"); if (url) formatSelection("createLink", url); }}>Link</button><button type="button" aria-label="Inserir imagem" title="Inserir imagem" className="rounded px-2 py-1 hover:bg-secondary" onMouseDown={event => { event.preventDefault(); const url = window.prompt("URL da imagem"); if (url) formatSelection("insertImage", url); }}>Imagem</button></div>;
  const semanticScenes = activeNode && book.semanticBook ? activeNode.kind === "scene" ? book.semanticBook.parts.flatMap(part => part.chapters).flatMap(chapter => chapter.scenes).filter(scene => scene.id === activeNode.id) : scenesOf(book.semanticBook, activeNode.id) : [];
  const semanticScene = semanticScenes[0];
  const blocks = semanticScene && sceneText(semanticScene) === draft ? semanticScene.blocks.map(block => block.text) : draft.split(/\n{2,}/).filter(Boolean);
  const escapeHtml = (value: string) => value.replace(/[&<>\"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] ?? character));
  const editorHtml = richContent || blocks.map(block => `<p>${escapeHtml(block)}</p>`).join("");

  useEffect(() => {
    if (plainTextMode) return;
    const element = richEditorRef.current;
    if (!element) return;

    const nodeChanged = richEditorNodeRef.current !== (activeNode?.id ?? null);
    const externalHtmlChanged = lastRichInputHtmlRef.current !== null && richContent !== lastRichInputHtmlRef.current;
    const externalTextChanged = lastRichInputTextRef.current !== null && draft !== lastRichInputTextRef.current;
    const elementIsEmpty = !element.innerHTML.trim();

    if (nodeChanged || externalHtmlChanged || externalTextChanged || elementIsEmpty) {
      if (element.innerHTML !== editorHtml) element.innerHTML = editorHtml;
    }

    richEditorNodeRef.current = activeNode?.id ?? null;
    lastRichInputHtmlRef.current = richContent;
    lastRichInputTextRef.current = draft;
  }, [activeNode?.id, draft, editorHtml, plainTextMode, richContent]);
  return <div className={`editorial-studio -mx-4 mt-4 flex min-h-[calc(100vh-5rem)] flex-col sm:-mx-5 sm:min-h-[calc(100vh-7rem)] ${distractionFree ? "bg-background" : ""}`}><div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-5 py-3"><Button variant="ghost" size="sm" onClick={onBack}>Biblioteca</Button><ChevronRight className="h-3 w-3 text-muted-foreground" /><span className="truncate text-sm font-medium">{book.title}</span><div className="ml-auto flex flex-wrap items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">{formatNumber(manuscriptWords)} palavras · {estimatedPages} pág. · {progress}% da meta</span><Button onClick={onSave} variant="outline" size="sm" disabled={saving}><Save className="mr-2 h-3.5 w-3.5" />{notice || (saving ? "Salvando" : "Salvar")}</Button><Button onClick={toggleTypewriter} variant={typewriterMode?"default":"outline"} size="sm" aria-pressed={typewriterMode}>Máquina de escrever</Button><Button onClick={() => setDistractionFree(value => !value)} variant="ghost" size="sm">{distractionFree ? "Sair do foco" : "Modo sem distração"}</Button></div></div><div className="h-1 border-b border-border/50 bg-muted/40"><div className="h-full bg-primary transition-all" style={{ width: String(progress) + "%" }} /></div>{!typewriterMode && <div className="flex gap-2 border-b p-2 lg:hidden">{[["manuscript","Capítulos"],["writing","Escrever"],["tools","Ferramentas"]].map(([id,label])=><Button key={id} size="sm" variant={mobilePanel===id?"default":"outline"} onClick={()=>setMobilePanel(id)}>{label}</Button>)}</div>}<div className={typewriterMode?"grid flex-1 grid-cols-1":"grid flex-1 lg:grid-cols-[260px_minmax(0,1fr)_340px]"}><aside className={`editorial-sidebar border-b border-border/70 bg-secondary/30 p-3 lg:border-b-0 lg:border-r ${distractionFree || typewriterMode ? "hidden" : mobilePanel === "manuscript" ? "" : "hidden lg:block"}`}><div className="mb-3 px-2"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Manuscrito</p><p className="mt-1 text-[10px] text-muted-foreground">{formatNumber(manuscriptWords)} palavras · {nodes.length} itens</p></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddPart} aria-label="Adicionar parte" title="Adicionar parte"><span className="text-[10px] font-semibold">P</span></Button><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddChapter} aria-label="Adicionar capítulo" title="Adicionar capítulo"><Plus className="h-3.5 w-3.5" /></Button></div></div><Progress value={progress} className="mt-3 h-1.5" /></div><ManuscriptNavigator nodes={nodes} activeId={activeNode?.id} publication={book.publication??{author:""}} onPublication={publication=>onUpdateBook({publication:{...book.publication,...publication} as PublicationData})} onSelect={id=>{onSelectNode(id);setMobilePanel("writing");}} onMove={onMoveNode} onRename={onRenameNode} onDuplicate={onDuplicateNode} onRemove={onRemoveNode} onPrepare={onOpenPrepare} onReorder={(from,to)=>{const next=[...nodes];const source=next.findIndex(n=>n.id===from),target=next.findIndex(n=>n.id===to);if(source<0||target<0)return;const [item]=next.splice(source,1);next.splice(target,0,item);onUpdateBook({nodes:next});}}/>
{(book.semanticBook?.plannedScenes ?? book.story?.scenes ?? []).length > 0 && <div className="mt-6 border-t border-border/70 pt-4"><p className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Cenas planejadas</p>{(book.semanticBook?.plannedScenes ?? book.story?.scenes ?? []).map(scene => <button key={scene.id} onClick={() => nodes.some(node => node.id === scene.id) ? onSelectNode(scene.id) : onPromotePlannedScene(scene)} className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-card/70 hover:text-foreground"><span className="block truncate">{scene.title}</span><span className="mt-0.5 block text-[10px]">{nodes.some(node => node.id === scene.id) ? "Abrir no manuscrito" : "Criar cena editável"}</span></button>)}</div>}</aside><section className={(mobilePanel === "writing" ? "" : "hidden lg:block") + "flex min-h-[34rem] flex-col bg-muted/20 px-4 py-8 sm:px-8 lg:px-12"}><div className="mx-auto flex w-full max-w-3xl flex-1 flex-col"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{activeNode?.kind === "chapter" ? "Capítulo" : "Cena"}</p><h1 className="mt-3 font-serif text-3xl tracking-tight">{activeNode ? displayNodeTitle(nodes, activeNode) : "Manuscrito"}</h1><p className="mt-2 text-[11px] text-muted-foreground">{formatNumber(countWords(draft))} palavras · ~{readingMinutes} min de leitura · sessão +{formatNumber(wordsThisSession)}</p>{!typewriterMode && editorToolbar}{findReplace && <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border/70 bg-card p-2"><Input aria-label="Localizar texto" value={findTerm} onChange={event => setFindTerm(event.target.value)} placeholder="Localizar" className="h-8 w-40 text-xs" /><Input aria-label="Substituir por" value={replaceTerm} onChange={event => setReplaceTerm(event.target.value)} placeholder="Substituir por" className="h-8 w-40 text-xs" /><Button size="sm" variant="outline" onClick={replaceAll} disabled={!findTerm}>Substituir tudo</Button></div>}{plainTextMode && !typewriterMode ? <div className="mt-8 flex flex-1 flex-col"><Textarea value={draft} onSelect={event => {splitCursor.current = event.currentTarget.selectionStart;}} onChange={event => onDraftChange(event.target.value)} className="min-h-[27rem] flex-1 resize-none border border-border/50 bg-card/40 p-5 font-serif text-lg leading-[1.9] shadow-none focus-visible:ring-0" placeholder="Comece onde a história pede." spellCheck /><Button className="mt-3 self-start" variant="outline" size="sm" onClick={() => setPlainTextMode(false)}>Voltar para blocos</Button></div> : <div className="mt-8 flex-1 space-y-5"><div className="mt-4 flex items-center justify-between"><p className="text-xs text-muted-foreground">Estrutura do capítulo · {blocks.length} bloco(s)</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => {setPlainTextMode(true);setTypewriterMode(false);safeLocalSet("shakstory:typewriter-mode","false");}}>Editar como texto corrido</Button><Button variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => onSplitNode(splitCursor.current)} disabled={!activeNode || activeNode.kind === "part" || draft.length < 4}>Dividir aqui</Button><Button variant="outline" size="sm" onClick={onMergeNode} disabled={!activeNode || activeNode.kind === "part"}>Unir ao próximo</Button></div></div><TypewriterFrame active={typewriterMode} editorRef={richEditorRef} text={draft}><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Texto rico</span><span className="text-[10px] text-muted-foreground">{blocks.length} bloco(s) semântico(s)</span></div><div ref={richEditorRef} data-editorial-page="true" inputMode={typewriterMode?"none":"text"} onMouseUp={rememberSplitCursor} onKeyUp={rememberSplitCursor} role="textbox" aria-label="Editar bloco 1" contentEditable suppressContentEditableWarning onInput={event => { const html = sanitizeRichContent(event.currentTarget.innerHTML); lastRichInputHtmlRef.current = html; const text = (event.currentTarget.innerText ?? event.currentTarget.textContent ?? "").replace(/\u00a0/g, " "); lastRichInputTextRef.current = text; onRichDraftChange(text, html); }} onBlur={event => { const html = sanitizeRichContent(event.currentTarget.innerHTML); lastRichInputHtmlRef.current = html; const text = (event.currentTarget.innerText ?? event.currentTarget.textContent ?? "").replace(/\u00a0/g, " "); lastRichInputTextRef.current = text; onRichDraftChange(text, html); }} className="min-h-[34rem] whitespace-pre-wrap font-serif text-[18px] leading-[1.9] outline-none empty:before:text-muted-foreground empty:before:content-['Comece_onde_a_história_pede.'] [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-5 [&_h1]:my-8 [&_h1]:text-3xl [&_h2]:my-7 [&_h2]:text-2xl [&_h3]:my-6 [&_h3]:text-xl [&_p]:mb-4" /></TypewriterFrame></div>}<div className="mt-5 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-border/60 bg-background p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Sessão</p><p className="mt-1 text-sm font-medium">+{formatNumber(wordsThisSession)} palavras</p><p className="text-[10px] text-muted-foreground">{sessionMinutes} min</p></div><div className="rounded-xl border border-border/60 bg-background p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Manuscrito</p><p className="mt-1 text-sm font-medium">{formatNumber(manuscriptWords)} palavras</p><p className="text-[10px] text-muted-foreground">{estimatedPages} páginas estimadas</p></div><div className="rounded-xl border border-border/60 bg-background p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Meta</p><p className="mt-1 text-sm font-medium">{targetWords ? String(progress) + "% concluído" : "Sem meta definida"}</p><Progress value={progress} className="mt-2 h-1" /></div></div><div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground"><span>Ctrl/⌘+S salva · Ctrl/⌘+Shift+F ativa foco · Ctrl/⌘+K localiza</span><span>rascunho local protegido</span></div></div></section><aside className={"border-t border-border/70 bg-background lg:border-l lg:border-t-0 " + (distractionFree || typewriterMode ? "hidden" : mobilePanel === "tools" ? "" : "hidden lg:block")}><div className="grid grid-cols-3 border-b border-border/70 p-2">{([["assistant","Revisar"],["context","Contexto"],["goals","Metas"]] as const).map(([value,label]) => <button key={value} onClick={() => setInspectorTab(value)} className={"rounded-md px-2 py-2 text-[11px] font-medium transition " + (inspectorTab === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}</div><div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-4">{inspectorTab === "assistant" && <LiteraryAssistant {...assistant} />}{inspectorTab === "context" && <div className="space-y-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Contexto da obra</p><h2 className="mt-1 font-serif text-2xl">Referências rápidas</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Personagens, lugares e cenas planejadas permanecem ao alcance enquanto você escreve.</p></div><div className="grid grid-cols-3 gap-2"><div className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{book.planning?.characters.length ?? 0}</p><p className="text-[9px] text-muted-foreground">personagens</p></div><div className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{book.planning?.locations.length ?? 0}</p><p className="text-[9px] text-muted-foreground">lugares</p></div><div className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{book.story?.scenes.length ?? 0}</p><p className="text-[9px] text-muted-foreground">cenas</p></div></div><div className="rounded-xl border border-primary/15 bg-primary/5 p-3"><div className="flex items-center justify-between gap-2"><div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-primary">Style DNA</p><p className="mt-1 text-xs font-medium">Voz observada nesta obra</p></div><Badge variant="outline" className="text-[9px]">{styleDna.wordCount} palavras analisadas</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Frase média</span><strong className="mt-1 block text-xs text-foreground">{styleDna.averageSentenceWords} palavras</strong></div><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Parágrafo médio</span><strong className="mt-1 block text-xs text-foreground">{styleDna.averageParagraphWords} palavras</strong></div><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Diálogo</span><strong className="mt-1 block text-xs text-foreground">{Math.round(styleDna.dialogueWordRatio * 100)}%</strong></div><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Diversidade lexical</span><strong className="mt-1 block text-xs text-foreground">{Math.round(styleDna.lexicalDiversity * 100)}%</strong></div></div><p className="mt-2 text-[10px] leading-4 text-muted-foreground">Ritmo: {styleDna.rhythm === "concise" ? "frases mais curtas" : styleDna.rhythm === "expansive" ? "frases mais expansivas" : "cadência equilibrada"}. A Cowila usa isso como referência suave, nunca como regra.</p></div><div className="rounded-xl border border-border/70 bg-card p-3"><div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10"><ShieldCheck className="h-3.5 w-3.5 text-primary" /></div><div className="min-w-0"><p className="text-xs font-medium">Radar de Continuidade</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Cruza a cena com cânone, cronologia, conhecimento, relações, locais e regras do mundo.</p></div></div><Button className="mt-3 w-full" size="sm" variant="outline" onClick={continuity.onCheck} disabled={continuity.loading || !draft.trim()}><ShieldCheck className="mr-2 h-3.5 w-3.5" />{continuity.loading ? "Verificando continuidade…" : "Verificar continuidade"}</Button>{continuity.error && <div className="mt-3 rounded-lg bg-destructive/10 p-3 text-[10px] text-destructive">{continuity.error}</div>}{continuity.result && <div className="mt-3 space-y-3"><div className="grid grid-cols-3 gap-1.5 text-center text-[9px]"><div className="rounded-lg bg-muted/60 p-2"><strong className="block text-xs text-foreground">{continuity.result.context.bookCanonFacts}</strong>livro</div><div className="rounded-lg bg-muted/60 p-2"><strong className="block text-xs text-foreground">{continuity.result.context.seriesCanonFacts}</strong>série</div><div className="rounded-lg bg-muted/60 p-2"><strong className="block text-xs text-foreground">{continuity.result.context.universeCanonFacts}</strong>universo</div></div>{continuity.result.canonWarnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">{continuity.result.canonWarnings.map((warning,index)=><p key={index} className="text-[10px] leading-4 text-muted-foreground">• {warning}</p>)}</div>}<div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-[11px] leading-5">{continuity.result.report}</div><div className="flex items-center justify-between gap-2"><span className="text-[9px] text-muted-foreground">{continuity.result.context.planningEntities} refs. de planejamento · {continuity.result.context.storyEntities} refs. narrativas</span><Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={continuity.onClear}>Limpar</Button></div></div>}</div>{book.planning?.characters.slice(0,5).map(item => <div key={item.id} className="rounded-xl border border-border/70 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{item.name}</p><Badge variant="outline" className="text-[9px]">{item.role}</Badge></div>{item.notes && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.notes}</p>}</div>)}{book.planning?.locations.slice(0,3).map(item => <div key={item.id} className="rounded-xl border border-border/70 p-3"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-[10px] text-primary">{item.atmosphere}</p></div>)}{(book.story?.scenes ?? []).filter(scene => scene.chapterId === activeNode?.id).map(scene => <div key={scene.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] uppercase tracking-wider text-primary">Cena planejada</p><h3 className="mt-1 text-sm font-medium">{scene.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Objetivo: {book.story?.objectives.find(item => item.id === scene.objectiveId)?.title ?? scene.objective ?? "A definir"}</p><p className="text-xs leading-5 text-muted-foreground">Conflito: {book.story?.conflicts.find(item => item.id === scene.conflictId)?.title ?? scene.conflict ?? "A definir"}</p>{scene.notes && <p className="mt-2 text-xs leading-5">{scene.notes}</p>}</div>)}<Button variant="outline" className="w-full" onClick={onOpenPlanning}><UsersRound className="mr-2 h-3.5 w-3.5" />Abrir planejamento completo</Button></div>}{inspectorTab === "goals" && <div className="space-y-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Produtividade</p><h2 className="mt-1 font-serif text-2xl">Ritmo de escrita</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Metas ligadas ao manuscrito, sem transformar o processo criativo em uma planilha.</p></div><div className="rounded-xl border border-border/70 p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Progresso do livro</span><strong className="text-sm">{progress}%</strong></div><Progress value={progress} className="mt-3" /><div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>{formatNumber(manuscriptWords)}</span><span>{targetWords ? formatNumber(targetWords) : "sem meta"}</span></div></div><label className="block text-xs font-medium text-muted-foreground">Meta total de palavras<Input type="number" min="0" className="mt-2" value={book.targetWordCount} onChange={event => onUpdateBook({ targetWordCount: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="block text-xs font-medium text-muted-foreground">Meta diária<Input type="number" min="0" className="mt-2" value={dailyGoal || ""} onChange={event => onUpdateBook({ dailyGoalWords: Math.max(0, Number(event.target.value) || 0) })} placeholder="Ex.: 1000" /></label><label className="block text-xs font-medium text-muted-foreground">Prazo<Input type="date" className="mt-2" value={book.deadline ?? ""} onChange={event => onUpdateBook({ deadline: event.target.value || undefined })} /></label><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-muted/60 p-3"><Clock3 className="h-3.5 w-3.5 text-primary" /><p className="mt-2 text-sm font-medium">{formatDuration(book.editSeconds)}</p><p className="text-[9px] text-muted-foreground">tempo registrado</p></div><div className="rounded-lg bg-muted/60 p-3"><Target className="h-3.5 w-3.5 text-primary" /><p className="mt-2 text-sm font-medium">{dailyGoal ? formatNumber(dailyGoal) + "/dia" : "Livre"}</p><p className="text-[9px] text-muted-foreground">ritmo diário</p></div></div><Button variant="outline" className="w-full" onClick={onOpenPrepare}><Sparkles className="mr-2 h-3.5 w-3.5" />Preparar publicação</Button></div>}</div><div className="border-t border-border/70 p-3"><div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>Histórico versionado</span><History className="h-3.5 w-3.5 text-primary" /></div></div></aside></div></div>;
}

export function LiteraryAssistant({
  focus,
  setFocus,
  result,
  models,
  isLoading,
  error,
  onAnalyze,
  onApply,
  coauthorResult,
  coauthorLoading,
  coauthorError,
  coauthorExpansion,
  coauthorExpansionLoading,
  coauthorExpansionError,
  onGenerate,
  onChoose,
  onApplyExpansion,
  onBackToSamples,
  onReject,
  canUndoCoauthor,
  onUndoCoauthor,
}: LiteraryAssistantProps) {
  const [mode, setMode] = useState<"review" | "coauthor">("review");
  const [intent, setIntent] = useState("");
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const labels: Record<LiteraryAssistantProps["focus"], string> = {
    full: "Revisão completa",
    language: "Ortografia e clareza",
    grammar: "Gramática e tempos",
    parts_of_speech: "Classes gramaticais",
    lexicon: "Palavras e sinônimos",
    narrative: "Narrativa e ritmo",
    voice: "Tom e voz",
    style: "Estilo",
  };

  return <div className="rounded-xl border border-primary/20 bg-card p-4">
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
        <WandSparkles className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">Cowila • Estúdio literário</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Revisa, propõe e desenvolve caminhos narrativos sem escrever por cima do autor.</p>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 rounded-lg bg-secondary/60 p-1" role="tablist" aria-label="Modo da Cowila">
      <button type="button" role="tab" aria-selected={mode === "review"} onClick={() => setMode("review")} className={"rounded-md px-3 py-2 text-[11px] font-medium transition " + (mode === "review" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Revisora</button>
      <button type="button" role="tab" aria-selected={mode === "coauthor"} onClick={() => setMode("coauthor")} className={"rounded-md px-3 py-2 text-[11px] font-medium transition " + (mode === "coauthor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Coautora</button>
    </div>

    {mode === "review" ? <div>
      <select value={focus} onChange={event => setFocus(event.target.value as LiteraryAssistantProps["focus"])} className="mt-4 h-9 w-full rounded-md border border-border bg-background px-2 text-xs">
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button className="mt-3 w-full" size="sm" onClick={onAnalyze} disabled={isLoading}>
        <WandSparkles className="mr-2 h-3.5 w-3.5" />{isLoading ? "Lendo o trecho…" : "Analisar trecho"}
      </Button>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">A análise usa o livro e a cena reais, além do cânone e da memória disponíveis. Modelo: {result?.model ?? models[0]?.id ?? "padrão do estúdio"}.</p>
      {error && <div className="mt-3 flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div>}
      {result && <div className="mt-4 space-y-3">
        <div className="rounded-lg bg-primary/5 p-3"><p className="text-xs leading-5">{result.summary}</p></div>
        {result.strengths.length > 0 && <div><p className="mb-2 flex items-center gap-2 text-xs font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />Pontos fortes</p><ul className="space-y-1 text-xs text-muted-foreground">{result.strengths.slice(0, 3).map((item, index) => <li key={index}>• {item}</li>)}</ul></div>}
        {result.suggestions.length > 0 && <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium"><Lightbulb className="h-3.5 w-3.5 text-primary" />Sugestões ({result.suggestions.length})</p>
          <div className="space-y-2">{result.suggestions.map((item, index) => <div key={item.original + "-" + index} className="rounded-lg border border-border/70 p-3">
            <div className="flex items-center justify-between gap-2"><Badge variant="outline" className="text-[10px]">{item.category}</Badge><span className="text-[10px] text-muted-foreground">{Math.round(item.confidence * 100)}%</span></div>
            {item.original && <p className="mt-2 text-xs line-through text-muted-foreground">{item.original}</p>}
            {item.suggestion && <p className="mt-1 text-xs font-medium">{item.suggestion}</p>}
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{item.explanation}</p>
            {item.original && item.suggestion && <Button variant="outline" size="sm" className="mt-2 h-7 text-[10px]" onClick={() => onApply(item.start, item.end, item.original, item.suggestion)}>Aplicar sugestão</Button>}
          </div>)}</div>
        </div>}
        {result.narrativeNotes.length > 0 && <div><p className="mb-2 text-xs font-medium">Notas de leitura</p><ul className="space-y-1 text-xs text-muted-foreground">{result.narrativeNotes.slice(0, 4).map((item, index) => <li key={index}>• {item}</li>)}</ul></div>}
      </div>}
    </div> : <div className="mt-4">
      <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
        <p className="text-xs font-medium">Coautoria em duas etapas</p>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">1. A Cowila cria três amostras curtas de caminhos diferentes. 2. Você escolhe um caminho. 3. Só então a Cowila expande esse caminho com as diretrizes literárias completas.</p>
      </div>

      <label className="mt-4 block text-xs font-medium text-muted-foreground">O que deve acontecer agora?
        <Textarea aria-label="Intenção da continuação" value={intent} onChange={event => setIntent(event.target.value)} className="mt-2 min-h-20 text-xs" placeholder="Ex.: aumentar a tensão, mas Elia ainda não deve descobrir toda a verdade." />
      </label>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
        <Badge variant="outline">3 amostras</Badge>
        <Badge variant="outline">~180 palavras cada</Badge>
        <Badge variant="outline">nenhuma altera o manuscrito</Badge>
      </div>

      <Button className="mt-3 w-full" size="sm" onClick={() => { setSelectedSampleId(null); onGenerate({ intent }); }} disabled={coauthorLoading || coauthorExpansionLoading}>
        <Sparkles className="mr-2 h-3.5 w-3.5" />{coauthorLoading ? "Criando 3 amostras…" : "Gerar 3 amostras"}
      </Button>

      {canUndoCoauthor && <Button variant="outline" className="mt-2 w-full" size="sm" onClick={onUndoCoauthor}>
        <RotateCcw className="mr-2 h-3.5 w-3.5" />Desfazer última aplicação
      </Button>}

      {coauthorError && <div className="mt-3 flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{coauthorError}</span></div>}
      {coauthorExpansionError && <div className="mt-3 flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{coauthorExpansionError}</span></div>}

      {coauthorResult && !coauthorExpansion && <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
          <Badge variant="outline">{coauthorResult.context.canonFacts} fatos de cânone do livro</Badge>
          <Badge variant="outline">{coauthorResult.context.memoryMessages} mensagens de memória</Badge>
          <Badge variant="outline">fase 1 · amostras</Badge>
        </div>
        {coauthorResult.canonWarnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] font-medium">Alertas de contexto</p>
          {coauthorResult.canonWarnings.map((warning, index) => <p key={index} className="mt-1 text-[10px] leading-4 text-muted-foreground">• {warning}</p>)}
        </div>}
        {coauthorResult.alternatives.map((alternative, index) => <article key={alternative.id} className={"rounded-xl border bg-background p-3 " + (selectedSampleId === alternative.id ? "border-primary/60" : "border-border/70")}>
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-xs font-medium">Amostra {index + 1} · {alternative.label}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{countWords(alternative.text)} palavras · direção narrativa</p></div>
            <Badge variant="outline" className="text-[9px]">Amostra</Badge>
          </div>
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-serif text-[13px] leading-6">{alternative.text}</p>
          <Button className="mt-3 w-full" size="sm" variant="outline" disabled={coauthorExpansionLoading} onClick={() => { setSelectedSampleId(alternative.id); onChoose(alternative, intent); }}>
            <ChevronRight className="mr-2 h-3.5 w-3.5" />{coauthorExpansionLoading && selectedSampleId === alternative.id ? "Expandindo este caminho…" : "Escolher este caminho"}
          </Button>
        </article>)}
        {coauthorExpansionLoading && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[10px] leading-4 text-muted-foreground">A Cowila está transformando a amostra escolhida em uma continuação completa com ritmo, beats, continuidade, Style DNA e faixa do gênero.</div>}
        <Button variant="ghost" className="w-full text-xs" onClick={() => { setSelectedSampleId(null); onReject(); }}>Descartar as 3 amostras</Button>
      </div>}

      {coauthorExpansion && <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-xs font-medium">Continuação expandida</p><p className="mt-0.5 text-[9px] text-muted-foreground">{countWords(coauthorExpansion.text)} palavras · fase 2</p></div>
            <Badge className="text-[9px]">Pronta para decisão</Badge>
          </div>
          <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-serif text-[13px] leading-6">{coauthorExpansion.text}</p>
        </div>
        {coauthorExpansion.canonWarnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] font-medium">Alertas antes de aplicar</p>
          {coauthorExpansion.canonWarnings.map((warning, index) => <p key={index} className="mt-1 text-[10px] leading-4 text-muted-foreground">• {warning}</p>)}
        </div>}
        <Button className="w-full" size="sm" onClick={() => onApplyExpansion(coauthorExpansion.text)}>
          <Check className="mr-2 h-3.5 w-3.5" />Aplicar ao manuscrito
        </Button>
        <Button variant="outline" className="w-full" size="sm" onClick={() => { setSelectedSampleId(null); onBackToSamples(); }}>
          Voltar às 3 amostras
        </Button>
        <p className="text-[9px] leading-4 text-muted-foreground">A expansão segue o caminho escolhido e as diretrizes de extensão/ritmo do gênero. Só o botão acima altera o manuscrito.</p>
      </div>}
    </div>}
  </div>;
}

export function ProjectView({ book, onNavigate, onUpdate }: { book: Book; onNavigate: (view: View) => void; onUpdate: (patch: Partial<Book>) => void }) {
  const planning = book.planning ?? { characters: [], locations: [], timeline: [] };
  const semantic = migrateLegacyNodes({ id: book.id, title: book.title, nodes: book.nodes.map(node => ({ ...node, kind: node.kind as "part" | "chapter" | "scene" })) });
  const semanticChapters = semantic.parts.reduce((sum, part) => sum + part.chapters.length, 0);
  const semanticScenes = semantic.parts.flatMap(part => part.chapters).reduce((sum, chapter) => sum + chapter.scenes.length, 0);
  const words = book.nodes.reduce((sum, node) => sum + countWords(node.content), 0);
  const [nextStep, setNextStep] = useState("");
  const [goalWords, setGoalWords] = useState(String(book.targetWordCount));
  const [deadline, setDeadline] = useState(book.deadline ?? "");
  const snapshotKey = `shakstory:snapshots:${book.id}`;
  const [snapshots, setSnapshots] = useState<Array<{ id: string; createdAt: number; label: string; book: Book }>>(() => { try { return JSON.parse(localStorage.getItem(snapshotKey) ?? "[]") as Array<{ id: string; createdAt: number; label: string; book: Book }>; } catch { return []; } });
  const [snapshotError, setSnapshotError] = useState("");
  const saveSnapshot = () => { const next = [{ id: stableId("snapshot"), createdAt: Date.now(), label: `Snapshot ${snapshots.length + 1}`, book }, ...snapshots].slice(0, 8); if (!safeLocalSet(snapshotKey, JSON.stringify(next))) { setSnapshotError("Não foi possível guardar o snapshot. Baixe um backup antes de restaurar."); return false; } setSnapshots(next); setSnapshotError(""); return true; };
  const restoreSnapshot = (snapshot: { book: Book }) => { if (!saveSnapshot()) return; onUpdate({ ...snapshot.book, updatedAt: Date.now() }); };
  const steps = book.nextSteps ?? [];
  const addNextStep = () => { if (!nextStep.trim()) return; onUpdate({ nextSteps: [...steps, nextStep.trim()] }); setNextStep(""); };
  return <div className="animate-in fade-in-0 duration-300"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Projeto do livro</p><div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h1 className="font-serif text-4xl tracking-tight">{book.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Comece pelo contexto, organize o universo e só depois abra o manuscrito quando quiser.</p><div className="mt-3 flex flex-wrap gap-2" aria-label="Hierarquia narrativa"><span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">Universo: {book.hierarchy?.universeName || "não definido"}</span><span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">Série: {book.hierarchy?.seriesName || "não definida"}</span></div></div><Button onClick={() => onNavigate("prepare")}><Sparkles className="mr-2 h-4 w-4" />Preparar publicação</Button></div><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Status" value={statusLabel(book.status)} icon={Target} /><Stat label="Palavras" value={`${formatNumber(words)} / ${formatNumber(book.targetWordCount)}`} icon={FileText} /><Stat label="Personagens" value={String(planning.characters.length)} icon={UsersRound} /><Stat label="Eventos" value={String(planning.timeline.length)} icon={Target} /></div><div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">Estrutura semântica pronta: {semantic.parts.length} parte(s), {semanticChapters} capítulo(s), {semanticScenes} cena(s) e blocos preservados para evolução futura.</div><section className="mt-5 rounded-2xl border border-border/70 bg-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Meta de escrita</p><h2 className="mt-2 font-serif text-2xl">Transforme intenção em ritmo.</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Defina uma meta total e um prazo; o progresso é calculado a partir do manuscrito atual.</p></div><div className="text-left sm:text-right"><p className="text-xs text-muted-foreground">Progresso</p><p className="font-serif text-2xl text-primary">{Math.min(100, Math.round((words / Math.max(1, Number(goalWords) || 1)) * 100))}%</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium text-muted-foreground">Meta total de palavras<Input className="mt-2" type="number" min="0" value={goalWords} onChange={event => setGoalWords(event.target.value)} onBlur={() => onUpdate({ targetWordCount: Math.max(0, Number(goalWords) || 0) })} /></label><label className="text-xs font-medium text-muted-foreground">Meta diária<Input className="mt-2" type="number" min="0" value={book.dailyGoalWords ?? 500} onChange={event => onUpdate({ dailyGoalWords: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="text-xs font-medium text-muted-foreground">Prazo<Input className="mt-2" type="date" value={deadline} onChange={event => { setDeadline(event.target.value); onUpdate({ deadline: event.target.value }); }} /></label></div><div className="mt-4"><Progress value={Math.min(100, Math.round((words / Math.max(1, Number(goalWords) || 1)) * 100))} className="h-2" /><p className="mt-2 text-[11px] text-muted-foreground">{formatNumber(words)} de {formatNumber(Number(goalWords) || 0)} palavras · {formatNumber(book.dailyGoalWords ?? 500)} por dia{deadline ? ` · prazo ${deadline}` : ""}</p></div></section><section className="mt-5 rounded-2xl border border-border/70 bg-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Snapshots locais</p><h2 className="mt-2 font-serif text-2xl">Volte a uma decisão anterior.</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Uma cópia local do projeto é criada sem alterar o documento salvo na nuvem.</p></div><Button variant="outline" size="sm" onClick={saveSnapshot}>Criar snapshot</Button></div>{snapshots.length > 0 ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{snapshots.map(snapshot => <div key={snapshot.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3"><div><p className="text-xs font-medium">{snapshot.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(snapshot.createdAt)}</p></div><Button variant="ghost" size="sm" onClick={() => restoreSnapshot(snapshot)}>Restaurar</Button></div>)}</div> : <p className="mt-4 text-xs text-muted-foreground">Nenhum snapshot criado nesta sessão.</p>}</section>{snapshotError && <p role="alert" className="mt-3 text-sm text-destructive">{snapshotError}</p>}<ProjectBackupPanel book={book} onRestore={restored => { if (!saveSnapshot()) throw new Error("A restauração foi interrompida porque não foi possível guardar a cópia atual."); onUpdate({ planning: undefined, story: undefined, review: undefined, publication: undefined, writingProgress: undefined, hierarchy: undefined, semanticBook: undefined, nextSteps: undefined, subtitle: undefined, dailyGoalWords: undefined, deadline: undefined, archived: undefined, ...restored as unknown as Book, updatedAt: Date.now() }); }} /><ProjectProgressPanel nodes={book.nodes} history={book.writingProgress} /><div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="grid gap-4 md:grid-cols-3"><ProjectAction title="Planejar universo" description="Personagens, locais e timeline para dar continuidade à história." icon={UsersRound} onClick={() => onNavigate("planning")} /><ProjectAction title="Manuscrito" description="Abra capítulos apenas quando quiser escrever ou revisar." icon={FileText} onClick={() => onNavigate("editor")} /><ProjectAction title="Preparar" description="Metadados e visão estrutural para a etapa de publicação." icon={Sparkles} onClick={() => onNavigate("prepare")} /></div><section className="rounded-2xl border border-border/70 bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Próximos passos</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Pequenas decisões que mantêm o projeto em movimento.</p><div className="mt-4 space-y-2">{steps.map((step, index) => <div key={`${step}-${index}`} className="flex items-start gap-2 rounded-lg bg-secondary/50 p-2.5 text-xs"><span className="mt-0.5 text-primary">{index + 1}.</span><span className="flex-1">{step}</span><button className="text-muted-foreground hover:text-foreground" aria-label={`Remover passo ${step}`} onClick={() => onUpdate({ nextSteps: steps.filter((_, itemIndex) => itemIndex !== index) })}><X className="h-3.5 w-3.5" /></button></div>)}<div className="flex gap-2"><Input value={nextStep} onChange={event => setNextStep(event.target.value)} onKeyDown={event => event.key === "Enter" && addNextStep()} placeholder="Adicionar um próximo passo" /><Button size="icon" variant="outline" onClick={addNextStep} aria-label="Adicionar próximo passo" disabled={!nextStep.trim()}><Plus className="h-4 w-4" /></Button></div></div></section></div></div>;
}
function ProjectAction({ title, description, icon: Icon, onClick }: { title: string; description: string; icon: typeof BookOpen; onClick: () => void }) { return <button onClick={onClick} className="rounded-2xl border border-border/70 bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><Icon className="h-4 w-4 text-primary" /><h2 className="mt-8 font-serif text-xl">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><span className="mt-5 inline-flex items-center text-xs font-medium text-primary">Abrir <ChevronRight className="ml-1 h-3 w-3" /></span></button>; }
function PreparationView({ book, onUpdate }: { book: Book; onUpdate: (patch: Partial<Book>) => void }) {
  const [publication, setPublication] = useState<PublicationData>(book.publication ?? { author: "", genre: "", language: "Português", description: "", includeToc: true, typography: "classic", frontMatter: [{ id: "dedication", title: "Dedicatória", content: "", enabled: false }, { id: "preface", title: "Prefácio", content: "", enabled: false }], backMatter: [{ id: "about-author", title: "Sobre o autor", content: "", enabled: false }, { id: "afterword", title: "Posfácio", content: "", enabled: false }] });
  const [layout, setLayout] = useState<"classic" | "compact">("classic");
  const [previewDevice, setPreviewDevice] = useState<"book" | "tablet" | "phone" | "print">("book");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const coverUpload = trpc.assets.uploadCover.useMutation({ onSuccess: result => { const nextPublication = { ...publication, coverImageUrl: result.url }; setPublication(nextPublication); onUpdate({ publication: nextPublication }); } });
  const update = (patch: Partial<PublicationData>) => {const next={...publication,...patch};setPublication(next);onUpdate({publication:next});};
  useEffect(() => { if(book.publication) setPublication(book.publication); }, [book.publication]);
  const updateSection = (area: "frontMatter" | "backMatter", id: string, patch: Partial<{ title: string; content: string; enabled: boolean }>) => update({[area]:(publication[area]??[]).map(section=>section.id===id?{...section,...patch}:section)});
  const exportBook = { bookId: book.id, copyright: publication.copyright, publicationYear: publication.publicationYear, title: book.title, subtitle: book.subtitle, author: publication.author, language: publication.language, description: publication.description, category: publication.category, isbn: publication.isbn, publicationDate: publication.publicationDate, layout, typography: publication.typography ?? "classic", trimSize: publication.trimSize ?? "a4", marginPreset: publication.marginPreset ?? "normal", dropCap: publication.dropCap ?? false, headerText: publication.headerText, footerText: publication.footerText, coverImageUrl: publication.coverImageUrl, includeToc: publication.includeToc !== false, frontMatter: publicationSections({...publication,bookId:book.id}), backMatter: publication.backMatter, chapters: chaptersFromNodes(book.nodes) };
  const validationIssues = useMemo(() => validateBook({ title: book.title, author: publication.author, language: publication.language, nodes: book.nodes, semanticBook: book.semanticBook }), [book, publication]);
  const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };
  const exportEpub = async () => { if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando EPUB…"); download(await buildEpub(await prepareExportAssets({...exportBook,isbn:publication.copyright?.isbns?.epub||publication.isbn})), `${book.title}.epub`); setExportStatus("EPUB pronto"); } catch(error) { setExportStatus(error instanceof Error ? error.message : "Não foi possível gerar o EPUB"); } finally { setExportBusy(false); } };
  const exportDocx = async () => { if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando DOCX…"); download(await buildDocx(await prepareExportAssets(exportBook)), `${book.title}.docx`); setExportStatus("DOCX pronto"); } catch(error) { setExportStatus(error instanceof Error ? error.message : "Não foi possível gerar o DOCX"); } finally { setExportBusy(false); } };
  const exportPdf = async () => { if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando PDF…"); download(buildPdf(await prepareExportAssets({...exportBook,isbn:publication.copyright?.isbns?.pdf||publication.isbn})), `${book.title}.pdf`); setExportStatus("PDF pronto"); } catch(error) { setExportStatus(error instanceof Error ? error.message : "Não foi possível gerar o PDF"); } finally { setExportBusy(false); } };
  const exportHtml = async () => { if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando HTML…"); const blob = new Blob([buildPrintHtml(await prepareExportAssets(exportBook))], { type: "text/html" }); download(blob, `${book.title}.html`); setExportStatus("HTML pronto"); } catch { setExportStatus("Não foi possível gerar o HTML"); } finally { setExportBusy(false); } };
  const exportPrint = () => { if (exportBusy) return; setExportBusy(true); try { setExportStatus("Abrindo impressão…"); const printWindow = window.open("", "_blank"); if (!printWindow) { setExportStatus("Permita pop-ups para abrir a impressão"); return; } printWindow.document.write(buildPrintHtml(exportBook)); printWindow.document.close(); printWindow.focus(); printWindow.print(); setExportStatus("Pré-visualização de impressão aberta"); } catch { setExportStatus("Não foi possível abrir a impressão"); } finally { setExportBusy(false); } };
  return <div className="animate-in fade-in-0 duration-300"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Preparação editorial</p><h1 className="mt-2 font-serif text-4xl">Leve o projeto até a capa.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Preencha os metadados que acompanham o livro e revise a estrutura antes de pensar em exportação. Esta etapa não altera capítulos.</p><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="rounded-2xl border border-border/70 bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Metadados</p><label className="mt-5 block text-xs font-medium text-muted-foreground">Autor<Input className="mt-2" value={publication.author} onChange={event => update({ author: event.target.value })} placeholder="Nome que aparecerá na publicação" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Gênero<Input className="mt-2" value={publication.genre} onChange={event => update({ genre: event.target.value })} placeholder="Romance, ensaio, fantasia…" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Idioma<Input className="mt-2" value={publication.language} onChange={event => update({ language: event.target.value })} /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">ISBN<Input className="mt-2" value={publication.isbn ?? ""} onChange={event => update({ isbn: event.target.value })} placeholder="978…" /></label><label className="text-xs font-medium text-muted-foreground">Data de publicação<Input className="mt-2" type="date" value={publication.publicationDate ?? ""} onChange={event => update({ publicationDate: event.target.value })} /></label></div><label className="mt-4 block text-xs font-medium text-muted-foreground">Ano de publicação<Input className="mt-2" type="number" min="1000" max="9999" value={publication.copyright?.year ?? publication.publicationYear ?? publication.publicationDate?.slice(0,4) ?? ""} onChange={event => update({publicationYear:event.target.value,copyright:{...publication.copyright,year:event.target.value}})} placeholder="2026" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Categoria / gênero<Input className="mt-2" value={publication.category ?? publication.genre} onChange={event => update({ category: event.target.value, genre: event.target.value })} placeholder="Romance, fantasia, ensaio…" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Descrição<textarea className="mt-2 min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={publication.description} onChange={event => update({ description: event.target.value })} placeholder="A apresentação editorial do livro" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Imagem da capa<Input className="mt-2" value={publication.coverImageUrl ?? ""} onChange={event => update({ coverImageUrl: event.target.value })} placeholder="https://…/capa.jpg" /></label><p className="mt-1 text-[11px] text-muted-foreground">Use uma URL HTTPS de uma imagem própria ou faça upload de uma imagem sua para o armazenamento seguro.</p><label className="mt-3 block text-xs font-medium text-muted-foreground">Enviar arquivo de capa<input className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" type="file" accept="image/jpeg,image/png,image/webp" disabled={coverUpload.isPending} onChange={event => { const file = event.target.files?.[0]; if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return; const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); const base64 = value.split(",")[1]; if (base64) coverUpload.mutate({ filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120), contentType: file.type as "image/jpeg" | "image/png" | "image/webp", base64 }); }; reader.readAsDataURL(file); }} /></label>{coverUpload.isPending && <p className="mt-1 text-[11px] text-muted-foreground">Enviando capa…</p>}{coverUpload.error && <p className="mt-1 text-[11px] text-destructive">{coverUpload.error.message}</p>}<label className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground"><input type="checkbox" checked={publication.includeToc !== false} onChange={event => update({ includeToc: event.target.checked })} />Incluir sumário editorial nas exportações</label><div className="mt-7 border-t border-border/60 pt-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Book Builder</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Monte as páginas que ficam antes e depois do corpo do livro. Seções desativadas não entram nos arquivos exportados.</p>{([['frontMatter', 'Front Matter'], ['backMatter', 'Back Matter']] as const).map(([area, label]) => <div key={area} className="mt-5"><h3 className="font-serif text-xl">{label}</h3><div className="mt-3 space-y-3">{(publication[area] ?? []).map(section => <div key={section.id} className="rounded-xl border border-border/70 bg-background/60 p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={section.enabled !== false} onChange={event => updateSection(area, section.id, { enabled: event.target.checked })} />Incluir {section.title.toLowerCase()}</label><Input className="mt-2" value={section.title} onChange={event => updateSection(area, section.id, { title: event.target.value })} aria-label={`Título ${section.title}`} /><Textarea className="mt-2 min-h-20" value={section.content} onChange={event => updateSection(area, section.id, { content: event.target.value })} placeholder={`Conteúdo de ${section.title.toLowerCase()}`} aria-label={`Conteúdo ${section.title}`} /></div>)}</div></div>)}</div><Button className="mt-5" onClick={() => onUpdate({ publication })}><Save className="mr-2 h-4 w-4" />Salvar metadados</Button></section><aside className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Pré-visualização</p><h2 className="mt-5 font-serif text-3xl">{book.title}</h2>{book.subtitle && <p className="mt-1 text-sm text-muted-foreground">{book.subtitle}</p>}<div className="mt-6 space-y-3 border-t border-primary/15 pt-4 text-sm"><p><span className="text-muted-foreground">Autor</span><br />{publication.author || "A definir"}</p><p><span className="text-muted-foreground">Gênero</span><br />{publication.genre || "A definir"}</p><p><span className="text-muted-foreground">Idioma</span><br />{publication.language || "A definir"}</p><p><span className="text-muted-foreground">ISBN</span><br />{publication.isbn || "A definir"}</p><p><span className="text-muted-foreground">Publicação</span><br />{publication.publicationDate || "A definir"}</p><p><span className="text-muted-foreground">ID do livro</span><br /><code className="break-all text-[10px]">{book.id}</code></p></div><div className="mt-6 rounded-lg bg-background/70 p-3 text-xs leading-5 text-muted-foreground">{publication.description || "A descrição aparecerá aqui quando você preencher os metadados."}</div>{publication.coverImageUrl && <img src={publication.coverImageUrl} alt={`Capa de ${book.title}`} className="mt-4 max-h-64 w-full rounded-lg object-contain" onError={event => { event.currentTarget.style.display = "none"; }} />}<div className="mt-6"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Prévia diagramada</p><div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Dispositivo da prévia">{([['book', 'Livro'], ['tablet', 'Tablet'], ['phone', 'Telefone'], ['print', 'Impressão']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setPreviewDevice(value)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium transition ${previewDevice === value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div><div className={`mt-3 flex justify-center rounded-lg bg-muted/30 p-3 ${previewDevice === "print" ? "overflow-auto" : "overflow-hidden"}`}><iframe title={`Prévia do layout editorial — ${previewDevice}`} srcDoc={buildPrintHtml(exportBook)} className={`h-64 border border-border bg-white shadow-sm ${previewDevice === "phone" ? "w-[220px]" : previewDevice === "tablet" ? "w-[360px]" : previewDevice === "print" ? "min-w-[640px] w-full" : "w-full"}`} /></div></div><div className="mt-6 border-t border-primary/15 pt-4"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Validação editorial</p>{validationIssues.length === 0 ? <p className="mt-2 text-xs text-primary">Pronto para revisão de exportação.</p> : <div className="mt-2 space-y-1">{validationIssues.map(issue => <p key={`${issue.code}-${issue.path}`} className={`text-xs ${issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}`}>{issue.severity === "error" ? "Erro" : "Aviso"}: {issue.message}</p>)}</div>}<div className="mt-6"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Layout e exportação</p><select className="mt-3 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={layout} onChange={event => setLayout(event.target.value as typeof layout)}><option value="classic">Layout clássico</option><option value="compact">Layout compacto</option></select><label className="mt-3 block text-xs font-medium text-muted-foreground">Preset tipográfico<select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={publication.typography ?? "classic"} onChange={event => update({ typography: event.target.value as TypographyPreset })}>{Object.entries(TYPOGRAPHY_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Formato<select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={publication.trimSize ?? "a4"} onChange={event => update({ trimSize: event.target.value as PublicationData["trimSize"] })}><option value="a4">A4</option><option value="a5">A5</option><option value="6x9">6 × 9 pol.</option></select></label><label className="text-xs font-medium text-muted-foreground">Margens<select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={publication.marginPreset ?? "normal"} onChange={event => update({ marginPreset: event.target.value as PublicationData["marginPreset"] })}><option value="narrow">Estreitas</option><option value="normal">Normais</option><option value="wide">Amplas</option></select></label></div><label className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><input type="checkbox" checked={publication.dropCap ?? false} onChange={event => update({ dropCap: event.target.checked })} />Usar capitular no primeiro parágrafo</label><Input className="mt-3" value={publication.headerText ?? ""} onChange={event => update({ headerText: event.target.value })} placeholder="Cabeçalho (opcional)" aria-label="Cabeçalho editorial" /><Input className="mt-3" value={publication.footerText ?? ""} onChange={event => update({ footerText: event.target.value })} placeholder="Rodapé (opcional)" aria-label="Rodapé editorial" /><p className="mt-3 text-[11px] leading-5 text-muted-foreground">PDF com páginas numeradas. DOCX com sumário atualizável no Word. EPUB adapta as páginas ao leitor.</p><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={exportEpub} disabled={exportBusy}>EPUB</Button><Button variant="outline" size="sm" onClick={exportDocx} disabled={exportBusy}>DOCX</Button><Button variant="outline" size="sm" onClick={exportPdf} disabled={exportBusy}>PDF</Button><Button variant="outline" size="sm" onClick={exportPrint} disabled={exportBusy}>Imprimir</Button><Button variant="outline" size="sm" onClick={exportHtml} disabled={exportBusy}>HTML</Button></div>{exportStatus && <p className="mt-3 text-[11px] text-primary">{exportStatus}</p>}</div></div><p className="mt-5 text-[11px] leading-4 text-muted-foreground">O conteúdo permanece separado do layout; exportar cria uma cópia e não altera o projeto.</p></aside></div></div>;
}

export function PlanningView({ book, onUpdate }: { book: Book; onUpdate: (planning: PlanningData & { story?: StoryData }) => void }) {
  const planning = book.planning ?? { characters: [], locations: [], timeline: [] };
  const story = normalizeStory(book.story ?? { objectives: [], conflicts: [], relations: [], notes: [], noteIds: [], noteStatuses: [], scenes: [] });
  const boards = planning.boards ?? [];
  const [activeTab, setActiveTab] = useState<PlanningTab>("characters");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [role, setRole] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<EditorialStatus>("draft");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const labels: Record<PlanningTab, string> = { characters: "Personagens", locations: "Locais", timeline: "Timeline", boards: "Story Boards", story: "Story Engine" };
  const placeholders = { characters: ["Nome do personagem", "Função na história", "Desejos, conflitos e detalhes"], locations: ["Nome do local", "Atmosfera", "Detalhes sensoriais e notas"], timeline: ["Título do evento", "Data ou ordem", "O que muda nesta passagem"] };
  const resetForm = () => { setName(""); setRole(""); setDetail(""); setTags(""); setStatus("draft"); setEditingId(null); };
  const editEntry = (item: Character | Location | TimelineEvent) => { setEditingId(item.id); setName("name" in item ? item.name : item.title); setRole("role" in item ? item.role : "atmosphere" in item ? item.atmosphere : item.date); setDetail("description" in item ? item.description : item.notes); setTags((item.tags ?? []).join(", ")); setStatus(item.status ?? "draft"); };
  const saveEntry = () => {
    if (!name.trim() || activeTab === "story" || activeTab === "boards") return;
    const id = editingId ?? stableId(activeTab);
    if (activeTab === "characters") { const item = { id, name: name.trim(), role: role.trim() || "Sem função definida", notes: detail.trim(), tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), status }; onUpdate({ ...planning, characters: editingId ? planning.characters.map(entry => entry.id === id ? item : entry) : [...planning.characters, item] }); }
    if (activeTab === "locations") { const item = { id, name: name.trim(), atmosphere: role.trim() || "Atmosfera a definir", notes: detail.trim(), tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), status }; onUpdate({ ...planning, locations: editingId ? planning.locations.map(entry => entry.id === id ? item : entry) : [...planning.locations, item] }); }
    if (activeTab === "timeline") { const item = { id, title: name.trim(), date: role.trim() || "Sem data", description: detail.trim(), tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), status }; onUpdate({ ...planning, timeline: editingId ? planning.timeline.map(entry => entry.id === id ? item : entry) : [...planning.timeline, item] }); }
    resetForm();
  };
  const removeEntry = (id: string) => {
    if (pendingDeleteId !== id) { setPendingDeleteId(id); return; }
    if (activeTab === "characters") onUpdate({ ...planning, characters: planning.characters.filter(item => item.id !== id) });
    if (activeTab === "locations") onUpdate({ ...planning, locations: planning.locations.filter(item => item.id !== id) });
    if (activeTab === "timeline") onUpdate({ ...planning, timeline: planning.timeline.filter(item => item.id !== id) });
    setPendingDeleteId(null);
    if (editingId === id) resetForm();
  };
  if (activeTab === "story") return <StoryEnginePanel story={story} chapterOptions={book.nodes.filter(node => node.kind === "chapter").map(node => ({ id: node.id, label: node.title }))} entityOptions={[...planning.characters.map(item => ({ id: item.id, label: item.name })), ...planning.locations.map(item => ({ id: item.id, label: item.name })), ...planning.timeline.map(item => ({ id: item.id, label: item.title }))]} onUpdate={(nextStory: StoryData) => onUpdate({ ...planning, story: nextStory })} onBack={() => { resetForm(); setActiveTab("characters"); }} />;
  if (activeTab === "boards") return <PlanningBoards boards={boards} onChange={nextBoards => onUpdate({ ...planning, boards: nextBoards })} onBack={() => { resetForm(); setActiveTab("characters"); }} />;
  const entries = planning[activeTab];
  return <div className="animate-in fade-in-0 duration-300"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Universo da história</p><div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h1 className="font-serif text-4xl">Seu projeto, antes das páginas.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Organize personagens, lugares e eventos com ciclo de vida editorial. Tudo pertence a {book.title} e é salvo junto ao documento versionado.</p></div><Badge variant="outline">ID {book.id}</Badge></div><div className="mt-8 grid gap-3 sm:grid-cols-4">{(Object.keys(labels) as PlanningTab[]).map(tab => <button key={tab} onClick={() => { setActiveTab(tab); resetForm(); }} className={`rounded-xl border p-4 text-left transition ${activeTab === tab ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card hover:border-primary/30"}`}><p className="text-xs font-medium">{labels[tab]}</p><p className="mt-2 font-serif text-2xl">{tab === "story" ? story.objectives.length + story.conflicts.length + story.relations.length + story.notes.length + story.scenes.length : tab === "boards" ? boards.length : planning[tab].length}</p><p className="mt-1 text-[11px] text-muted-foreground">registros editoriais</p></button>)}</div><div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="space-y-3">{entries.length === 0 ? <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8"><Sparkles className="h-5 w-5 text-primary" /><h2 className="mt-4 font-serif text-2xl">Ainda sem {labels[activeTab].toLowerCase()}.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Adicione uma referência ao lado para manter a continuidade enquanto escreve.</p></div> : entries.map(item => { const title = "title" in item ? item.title : item.name; const descriptor = "date" in item ? item.date : "role" in item ? item.role : item.atmosphere; const body = "description" in item ? item.description : item.notes; return <div key={item.id} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl">{title}</h2><p className="mt-1 text-xs text-primary">{descriptor}</p></div><Badge variant="outline">{statusLabel(item.status)}</Badge></div>{body && <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>}{item.tags && item.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map(tag => <span key={`${item.id}-${tag}`} className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">#{tag}</span>)}</div>}<div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => editEntry(item)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>{pendingDeleteId === item.id ? <><Button variant="destructive" size="sm" onClick={() => removeEntry(item.id)}>Confirmar exclusão</Button><Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>Cancelar</Button></> : <Button variant="ghost" size="sm" onClick={() => removeEntry(item.id)} aria-label={`Excluir ${title}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir</Button>}</div></div>; })}</section><aside className="rounded-2xl border border-border/70 bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">{editingId ? "Editar registro" : "Novo registro"}</p><h2 className="mt-2 font-serif text-2xl">{editingId ? "Atualizar" : "Adicionar"} {labels[activeTab].replace(/s$/, "").toLowerCase()}.</h2><Input className="mt-5" value={name} onChange={event => setName(event.target.value)} placeholder={placeholders[activeTab][0]} /><Input className="mt-3" value={role} onChange={event => setRole(event.target.value)} placeholder={placeholders[activeTab][1]} /><Input className="mt-3" value={tags} onChange={event => setTags(event.target.value)} placeholder="Tags separadas por vírgula" aria-label="Tags do elemento" /><Textarea className="mt-3 min-h-28" value={detail} onChange={event => setDetail(event.target.value)} placeholder={placeholders[activeTab][2]} /><label className="mt-3 block text-xs font-medium text-muted-foreground">Status<select aria-label="Status do elemento" className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value as EditorialStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={saveEntry} disabled={!name.trim()}>{editingId ? "Salvar alterações" : <><Plus className="mr-2 h-4 w-4" />Adicionar</>}</Button>{editingId && <Button variant="ghost" onClick={resetForm}>Cancelar</Button>}</div><p className="mt-3 text-[11px] leading-4 text-muted-foreground">Cada registro mantém seu ID estável e seu status ao ser salvo.</p></aside></div></div>;
}

export function StoryEnginePanel({ story, entityOptions = [], chapterOptions = [], onUpdate, onBack }: { story: StoryData; chapterOptions?: Array<{ id: string; label: string }>; entityOptions?: Array<{ id: string; label: string }>; onUpdate: (story: StoryData) => void; onBack?: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"objectives" | "conflicts" | "notes" | "relations" | "scenes">("objectives");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [objectiveId, setObjectiveId] = useState("");
  const [conflictId, setConflictId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [status, setStatus] = useState<EditorialStatus>("draft");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const resetForm = () => { setTitle(""); setDescription(""); setFrom(""); setTo(""); setStatus("draft"); setEditingId(null); setObjectiveId(""); setConflictId(""); setChapterId(""); };
  const add = () => {
    if (!title.trim()) return;
    if (kind === "notes") { const noteId = editingId ?? stableId("note"); const index = editingId ? (story.noteIds ?? []).indexOf(editingId) : -1; const notes = editingId && index >= 0 ? story.notes.map((note, noteIndex) => noteIndex === index ? title.trim() : note) : [...story.notes, title.trim()]; const noteIds = editingId && index >= 0 ? story.noteIds : [...(story.noteIds ?? []), noteId]; const noteStatuses = editingId && index >= 0 ? (story.noteStatuses ?? []).map((entry, noteIndex) => noteIndex === index ? status : entry) : [...(story.noteStatuses ?? []), status]; onUpdate({ ...story, notes, noteIds, noteStatuses }); }
    else if (kind === "relations") { if (!from.trim() || !to.trim()) return; const relation = { id: editingId ?? stableId("relation"), from: from.trim(), to: to.trim(), fromId: entityOptions.find(option => option.label === from.trim() || option.id === from.trim())?.id, toId: entityOptions.find(option => option.label === to.trim() || option.id === to.trim())?.id, label: title.trim(), status }; onUpdate({ ...story, relations: editingId ? story.relations.map(entry => entry.id === editingId ? relation : entry) : [...story.relations, relation] }); }
    else if (kind === "scenes") { const scene = { id: editingId ?? stableId("planned-scene"), title: title.trim(), objective: story.objectives.find(item => item.id === objectiveId)?.title ?? from.trim(), conflict: story.conflicts.find(item => item.id === conflictId)?.title ?? to.trim(), objectiveId: objectiveId || undefined, conflictId: conflictId || undefined, chapterId: chapterId || undefined, notes: description.trim(), status }; onUpdate({ ...story, scenes: editingId ? story.scenes.map(entry => entry.id === editingId ? scene : entry) : [...story.scenes, scene] }); }
    else { const item = { id: editingId ?? stableId(kind), title: title.trim(), description: description.trim(), status }; onUpdate({ ...story, [kind]: editingId ? story[kind].map(entry => entry.id === editingId ? item : entry) : [...story[kind], item] }); }
    resetForm();
  };
  const editItem = (item: StoryCard | StoryRelation | StoryScene, itemKind: typeof kind) => { setKind(itemKind); setEditingId(item.id); setStatus(item.status ?? "draft"); if (itemKind === "relations") { const relation = item as StoryRelation; setTitle(relation.label); setFrom(relation.fromId ?? relation.from); setTo(relation.toId ?? relation.to); } else if (itemKind === "scenes") { const scene = item as StoryScene; setTitle(scene.title); setFrom(scene.objective); setTo(scene.conflict); setDescription(scene.notes); setObjectiveId(scene.objectiveId ?? ""); setConflictId(scene.conflictId ?? ""); setChapterId(scene.chapterId ?? ""); } else { const card = item as StoryCard; setTitle(card.title); setDescription(card.description); } };
  const editNote = (noteId: string, note: string, index: number) => { setKind("notes"); setEditingId(noteId); setTitle(note); setDescription(""); setStatus(story.noteStatuses?.[index] ?? "draft"); };
  const removeItem = (itemKind: typeof kind, id: string) => { if (pendingDeleteId !== id) { setPendingDeleteId(id); return; } if (itemKind === "objectives") onUpdate({ ...story, objectives: story.objectives.filter(item => item.id !== id) }); if (itemKind === "conflicts") onUpdate({ ...story, conflicts: story.conflicts.filter(item => item.id !== id) }); if (itemKind === "relations") onUpdate({ ...story, relations: story.relations.filter(item => item.id !== id) }); if (itemKind === "scenes") onUpdate({ ...story, scenes: story.scenes.filter(item => item.id !== id) }); if (itemKind === "notes") { const index = story.noteIds?.indexOf(id) ?? -1; if (index >= 0) onUpdate({ ...story, notes: story.notes.filter((_, noteIndex) => noteIndex !== index), noteIds: (story.noteIds ?? []).filter(noteId => noteId !== id), noteStatuses: (story.noteStatuses ?? []).filter((_, noteIndex) => noteIndex !== index) }); } setPendingDeleteId(null); if (editingId === id) resetForm(); };
  const linkedTitle = (id: string | undefined, options: Array<{id: string; title?: string; label?: string}>, fallback: string) => id ? (options.find(item => item.id === id)?.title ?? options.find(item => item.id === id)?.label ?? `${fallback || "Referência"} (vínculo indisponível)`) : fallback;
  const linkSelect = (label: string, value: string, setValue: (value: string) => void, options: Array<{id: string; title?: string; label?: string}>) => <label className="mt-3 block text-xs font-medium text-muted-foreground">{label}<select aria-label={label} value={value} onChange={event => setValue(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Sem vínculo</option>{value && !options.some(item => item.id === value) && <option value={value}>Vínculo indisponível — preservar referência</option>}{options.map(item => <option key={item.id} value={item.id}>{item.title ?? item.label}</option>)}</select></label>;
  const linkedScenes = (id: string, field: "objectiveId" | "conflictId") => { const scenes = story.scenes.filter(scene => scene[field] === id); return scenes.length ? <p className="mt-3 text-xs text-primary">Cenas vinculadas: {scenes.map(scene => scene.title).join(" · ")}</p> : null; };
  const itemActions = (itemKind: "objectives" | "conflicts" | "relations" | "scenes", id: string, titleText: string) => <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" aria-label={`Editar ${itemKind === "relations" ? "relação " : ""}${titleText}`} onClick={() => { const collection = itemKind === "objectives" ? story.objectives : itemKind === "conflicts" ? story.conflicts : itemKind === "relations" ? story.relations : story.scenes; const item = collection.find(entry => entry.id === id); if (item) editItem(item, itemKind); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>{pendingDeleteId === id ? <><Button variant="destructive" size="sm" onClick={() => removeItem(itemKind, id)}>Confirmar exclusão</Button><Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>Cancelar</Button></> : <Button variant="ghost" size="sm" onClick={() => removeItem(itemKind, id)} aria-label={`Excluir ${titleText}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir</Button>}</div>;
  return <div className="animate-in fade-in-0 duration-300"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Story Engine</p><h1 className="mt-2 font-serif text-4xl">A arquitetura por trás da história.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Registre objetivos, conflitos, cenas e notas com edição, exclusão, status e IDs estáveis.</p></div>{onBack && <Button variant="outline" onClick={onBack}>Voltar ao planejamento</Button>}</div><div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="space-y-3">{story.objectives.map(item => <div key={item.id} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Objetivo</p><h2 className="mt-2 font-serif text-xl">{item.title}</h2></div><Badge variant="outline">{statusLabel(item.status)}</Badge></div>{item.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>}{linkedScenes(item.id, "objectiveId")}{itemActions("objectives", item.id, item.title)}</div>)}{story.conflicts.map(item => <div key={item.id} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Conflito</p><h2 className="mt-2 font-serif text-xl">{item.title}</h2></div><Badge variant="outline">{statusLabel(item.status)}</Badge></div>{item.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>}{linkedScenes(item.id, "conflictId")}{itemActions("conflicts", item.id, item.title)}</div>)}{story.notes.map((note, index) => { const noteId = story.noteIds?.[index] ?? `legacy-note-${index}`; return <div key={noteId} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm leading-6">{note}</p><Badge variant="outline">{statusLabel(story.noteStatuses?.[index])}</Badge></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => editNote(noteId, note, index)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>{pendingDeleteId === noteId ? <><Button variant="destructive" size="sm" onClick={() => removeItem("notes", noteId)}>Confirmar exclusão</Button><Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>Cancelar</Button></> : <Button variant="ghost" size="sm" onClick={() => removeItem("notes", noteId)} aria-label={`Excluir nota ${note}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir</Button>}</div></div>; })}{story.relations.map(item => <div key={item.id} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm"><span className="font-medium">{linkedTitle(item.fromId, entityOptions, item.from)} → {linkedTitle(item.toId, entityOptions, item.to)}</span><span className="ml-2 text-muted-foreground">{item.label}</span></p><Badge variant="outline">{statusLabel(item.status)}</Badge></div>{itemActions("relations", item.id, item.label)}</div>)}{story.scenes.map(item => <div key={item.id} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Cena planejada</p><h2 className="mt-2 font-serif text-xl">{item.title}</h2></div><Badge variant="outline">{statusLabel(item.status)}</Badge></div><p className="mt-3 text-sm text-muted-foreground">Objetivo: {linkedTitle(item.objectiveId, story.objectives, item.objective) || "A definir"} · Conflito: {linkedTitle(item.conflictId, story.conflicts, item.conflict) || "A definir"}</p>{item.chapterId && <p className="mt-2 text-xs text-primary">Capítulo: {linkedTitle(item.chapterId, chapterOptions, "Capítulo removido")}</p>}{item.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.notes}</p>}{itemActions("scenes", item.id, item.title)}</div>)}{story.objectives.length + story.conflicts.length + story.notes.length + story.relations.length + story.scenes.length === 0 && <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8"><Sparkles className="h-5 w-5 text-primary" /><h2 className="mt-4 font-serif text-2xl">A estrutura ainda está aberta.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Comece pela tensão central ou pelo que o protagonista deseja.</p></div>}</section><aside className="rounded-2xl border border-border/70 bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">{editingId ? "Editar elemento" : "Novo elemento"}</p><select aria-label="Tipo de elemento" className="mt-4 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={kind} onChange={event => { setKind(event.target.value as typeof kind); resetForm(); }}><option value="objectives">Objetivo</option><option value="conflicts">Conflito</option><option value="notes">Nota de autor</option><option value="relations">Relação</option><option value="scenes">Cena planejada</option></select><Input className="mt-3" value={title} onChange={event => setTitle(event.target.value)} placeholder={kind === "notes" ? "Uma nota para manter por perto" : kind === "objectives" ? "O que precisa acontecer?" : kind === "conflicts" ? "O que está em tensão?" : kind === "relations" ? "Tipo de relação" : "Título da cena"} />{kind === "relations" && <><Input list="story-entities" className="mt-3" value={from} onChange={event => setFrom(event.target.value)} placeholder="Origem: personagem, lugar ou evento" /><Input list="story-entities" className="mt-3" value={to} onChange={event => setTo(event.target.value)} placeholder="Destino: personagem, lugar ou evento" /><datalist id="story-entities">{entityOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</datalist></>}{kind === "scenes" && <>{linkSelect("Vincular objetivo", objectiveId, setObjectiveId, story.objectives)}{linkSelect("Vincular conflito", conflictId, setConflictId, story.conflicts)}{linkSelect("Vincular capítulo", chapterId, setChapterId, chapterOptions)}<Input className="mt-3" value={from} onChange={event => setFrom(event.target.value)} placeholder="Objetivo da cena" disabled={Boolean(objectiveId)} /><Input className="mt-3" value={to} onChange={event => setTo(event.target.value)} placeholder="Conflito ou virada" disabled={Boolean(conflictId)} /></>}<Textarea className="mt-3 min-h-28" value={description} onChange={event => setDescription(event.target.value)} placeholder="Contexto, consequência e observações" /><label className="mt-3 block text-xs font-medium text-muted-foreground">Status<select aria-label="Status do elemento" className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value as EditorialStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="mt-4 flex gap-2"><Button className="flex-1" onClick={add} disabled={!title.trim() || (kind === "relations" && (!from.trim() || !to.trim()))}>{editingId ? (kind === "relations" ? "Salvar relação" : "Salvar alterações") : <><Plus className="mr-2 h-4 w-4" />Adicionar ao projeto</>}</Button>{editingId && <Button variant="ghost" onClick={resetForm}>Cancelar</Button>}</div></aside></div></div>;
}
