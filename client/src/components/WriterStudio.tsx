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
import { resolveLocalOutcome, resolveSaveState } from "@/lib/save-state";
import { cloudflareTransport } from "@/lib/trpc";
import { guard, guardFresh, refreshPlan, usePlan } from "@/lib/plans";
import { AdminPanel, PlanBanner, PlansDialog } from "./PlanBanner";
import { IdbKV } from "@/lib/sync/kv";
import { rememberSynced, syncLibrary } from "@/lib/sync/engine";
import { mergeLibraries, type LibraryLike, type MergeReport } from "@/lib/sync/merge";
import { useMirror } from "@/lib/mirror/useMirror";
import { CONTINGENCY } from "@/lib/contingency";
import { DataSafetyPanel } from "@/components/DataSafetyPanel";
import { CowilaChat } from "@/components/CowilaChat";
import { mergeCharacters } from "@/lib/cowila/project";
// Carregada só quando a Cowila é usada (os testes que simulam o trpc não precisam conhecê-la).
const askCowila = (input: import("@/lib/trpc").CowilaAsk) => import("@/lib/trpc").then(module => module.askCowila(input));
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
import { BOOK_MODELS, pageReport } from "@/lib/bookModels";
import { LayoutPrintControls } from "@/components/LayoutPrintControls";
import { PublishStepper, ThemeGallery } from "./PublishFlow";
import { IsbnLookup } from "./IsbnLookup";
import { TranslateBookDialog, type TranslatedBook } from "./TranslateBookDialog";
import { createCowilaRefiner, estimateRefineCalls, glossaryFromPlanning, languageByCode, loadGlossary, TRANSLATE_LANGUAGES, translateExportBook } from "@/lib/translate";
import { CowilaTutorial } from "@/tutorial/CowilaTutorial";
import { normalizeIsbn, publicationDates, type IsbnInfo } from "@/lib/isbn";
import { type ExportBook, pdfSupportsLanguage, buildDocx, buildEpub, buildPdf, buildPrintHtml, buildText, chaptersFromNodes, TYPOGRAPHY_PRESETS, type TypographyPreset, TRIM_SIZES, CUSTOM_TRIM_LIMITS, type TrimSize, type CustomTrim } from "@shared/book-export";
import { HelpCircle, LogOut, Eye, AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Italic, Link2, List, ListOrdered, Minus, MoreHorizontal, Pilcrow, Quote, Redo2, Underline as UnderlineIcon, Undo2, ImagePlus, AlertCircle, BookOpen, BookMarked, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Clock3, CloudOff, Download, FileText, History, Lightbulb, Loader2, Menu, PanelLeft, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Sparkles, Target, Trash2, UsersRound, WandSparkles, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { AntivirusSecurityView } from "./AntivirusSecurityView";
import { MarkdownText, InlineMarkdown } from "./MarkdownText";
import { AvatarCard, EditorMenu, useProfile, type EditorAction } from "./AccountMenu";
import { ProfilePage } from "./ProfilePage";
import { signOutMirror } from "@/lib/mirror/firebase";
import { PlanningBoards, type PlanningBoard } from "./PlanningBoards";
import { appendContinuationHtml, appendContinuationText, continuationToHtml, type CoauthorAlternative } from "@shared/coauthor";
import { assessCoauthorQuality } from "@shared/coauthor-quality";
import { analyzeStyleDna } from "@shared/style-dna";
import { normalizeEditorialControls, normalizeProtectedTerms, type EditorialControls } from "@shared/editorial-controls";

type View = "library" | "project" | "planning" | "editor" | "prepare" | "security" | "authorship" | "account-center" | "admin-plans";
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
type PublicationData = { copyright?: CopyrightData; author: string; genre: string; category?: string; language: string; description: string; isbn?: string; publicationDate?: string; publicationYear?: string; coverImageUrl?: string; includeToc?: boolean; typography?: TypographyPreset; trimSize?: TrimSize; customTrim?: CustomTrim; marginPreset?: "narrow" | "normal" | "wide"; dropCap?: boolean; headerText?: string; footerText?: string; runningHeader?: boolean; bleedMm?: number; gutterMm?: number; frontMatter?: Array<{ id: string; title: string; content: string; enabled?: boolean }>; backMatter?: Array<{ id: string; title: string; content: string; enabled?: boolean }>; };
type Book = { writingProgress?: DailyProgress[]; archived?: boolean; review?: ReviewData; id: string; title: string; subtitle?: string; status: EditorialStatus; targetWordCount: number; dailyGoalWords?: number; deadline?: string; nodes: Node[]; updatedAt: number; startedAt?: number; lastOpenedAt?: number; editSeconds?: number; planning?: PlanningData; story?: StoryData; publication?: PublicationData; nextSteps?: string[]; semanticBook?: SemanticBook; hierarchy?: BookHierarchy };
type LibraryDocument = { version: 1; versionId?: string; books: Book[] };
type LiterarySuggestion = { category: string; severity: string; original: string; suggestion: string; explanation: string; confidence: number; start: number; end: number };
type LiteraryResult = { summary: string; strengths: string[]; suggestions: LiterarySuggestion[]; narrativeNotes: string[]; model: string; availableModels: string[] };
type CoauthorResult = { alternatives: CoauthorAlternative[]; canonWarnings: string[]; model: string; context: { canonFacts: number; memoryMessages: number; requestedWords: number } };
type CoauthorExpansionResult = { text: string; canonWarnings: string[]; model: string; context: { canonFacts: number; memoryMessages: number } };
type CoauthorOperation = "rewrite" | "continue" | "expand";
type CoauthorGenerateOptions = { intent: string; operation: CoauthorOperation; editorialControls?: EditorialControls };
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
type LiteraryAssistantProps = { bookId?: string; focus: "language" | "grammar" | "parts_of_speech" | "lexicon" | "narrative" | "voice" | "style" | "full"; setFocus: (focus: LiteraryAssistantProps["focus"]) => void; result: LiteraryResult | null; models: Array<{ id: string }>; isLoading: boolean; error: string | null; onAnalyze: () => void; onApply: (start: number, end: number, original: string, suggestion: string) => void; coauthorResult: CoauthorResult | null; coauthorLoading: boolean; coauthorError: string | null; coauthorExpansion: CoauthorExpansionResult | null; coauthorExpansionLoading: boolean; coauthorExpansionError: string | null; onGenerate: (options: CoauthorGenerateOptions) => void; onChoose: (alternative: CoauthorAlternative, intent: string, editorialControls: EditorialControls, operation: CoauthorOperation) => void; onApplyExpansion: (text: string, operation: CoauthorOperation) => void; onBackToSamples: () => void; onReject: () => void; canUndoCoauthor: boolean; onUndoCoauthor: () => void };

type SyncState = { mode: "cloudflare-d1" | "github" | "json"; status: "idle" | "syncing" | "synced" | "conflict" | "error"; lastSyncAt: number | null; lastWebhookAt: number | null; lastWebhookEvent: string | null; lastConflictPath: string | null; lastError: string | null };

const emptyLibrary: LibraryDocument = { version: 1, books: [] };
const countWords = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;
/** Configuração editorial escolhida pelo autor para este livro, sem upload de preferências de outros projetos. */
const editorialForBook = (bookId: string) => {
  try { return normalizeEditorialControls(JSON.parse(localStorage.getItem(`shakstory:cowila:editorial:${bookId}`) || "{}")); }
  catch { return normalizeEditorialControls(null); }
};

const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const formatDate = (value: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(value);
const statusLabels: Record<EditorialStatus, string> = { planning: "Planejamento", draft: "Rascunho", editing: "Em edição", revision: "Em revisão", completed: "Concluído" };
const statusLabel = (value?: EditorialStatus) => statusLabels[value ?? "draft"];
const countCharacters = (book: Book) => book.nodes.reduce((sum, node) => sum + node.content.length, 0);
const countPages = (book: Book) => Math.max(1, Math.ceil(countCharacters(book) / 1800));
const wordsOf = (book: Book) => book.nodes.reduce((sum, node) => sum + countWords(node.content), 0);
const coverHue = (title: string) => Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
const viewLabels: Record<View, string> = { library: "Biblioteca", project: "Visão geral", editor: "Escrita", planning: "Planejar história", prepare: "Preparar edição", security: "Segurança", authorship: "Autoria X-URI", "account-center": "Central de Contas", "admin-plans": "Contas e planos" };
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

function PrivacyPolicyPanel({ onBack }: { onBack: () => void }) {
  return <section className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 sm:px-8" aria-label="LGPD e Política de Privacidade">
    <button type="button" onClick={onBack} className="rounded-lg border border-border px-4 py-2 text-sm text-primary">← Voltar à Central de Contas</button>
    <header><p className="font-mono text-xs uppercase tracking-[.2em] text-primary">Transparência e proteção de dados</p><h1 className="mt-2 font-serif text-4xl">LGPD e Política de Privacidade</h1><p className="mt-3 text-sm text-muted-foreground">Informações sobre o tratamento de dados no Shakstory. Atualizado em 20 de outubro de 2026.</p></header>
    <div className="space-y-5 rounded-2xl border border-border bg-card p-6 text-sm leading-7">
      <div><h2 className="font-serif text-2xl">1. Dados utilizados</h2><p>O Shakstory utiliza dados de identificação e autenticação, como nome, e-mail e identificadores de acesso, além de informações de conta, plano, preferências e manuscritos que você decide criar ou sincronizar.</p></div>
      <div><h2 className="font-serif text-2xl">2. Finalidades e bases legais</h2><p>Os dados são tratados para fornecer o editor, autenticar usuários, preservar documentos, administrar planos, prevenir fraudes e atender obrigações legais. Conforme a finalidade, o tratamento pode se apoiar na execução de contrato, cumprimento de obrigação legal, legítimo interesse sujeito a avaliação e, quando aplicável, consentimento.</p></div>
      <div><h2 className="font-serif text-2xl">3. Armazenamento e terceiros</h2><p>O serviço pode utilizar Cloudflare para acesso e infraestrutura, Firebase/Google para identidade ou sincronização, e GitHub Pages para a versão de contingência. Os manuscritos podem permanecer no dispositivo e, conforme as funções ativadas, em serviços de sincronização. Esses fornecedores possuem políticas próprias.</p></div>
      <div><h2 className="font-serif text-2xl">4. Seus direitos</h2><p>Nos termos da Lei nº 13.709/2018, você pode solicitar confirmação de tratamento, acesso, correção, anonimização ou eliminação quando cabível, portabilidade nos termos da regulamentação, informações sobre compartilhamento e revisão de decisões automatizadas quando aplicável. Alguns dados podem precisar ser retidos por obrigação legal.</p></div>
      <div><h2 className="font-serif text-2xl">5. Desativação e exclusão</h2><p>Desativação temporária e reativação serão disponibilizadas após implantação das verificações de identidade e definição transparente do período de recuperação. Exclusão permanente, quando habilitada, exigirá confirmação reforçada e observará eventuais retenções legais. Atualmente essas operações estão indisponíveis.</p></div>
      <div><h2 className="font-serif text-2xl">6. Segurança e conservação</h2><p>São utilizados controles de acesso e mecanismos de autenticação. Nenhum sistema oferece risco zero. O período de conservação depende da finalidade, obrigações legais e necessidade de segurança; uma tabela definitiva de prazos ainda precisa ser publicada.</p></div>
      <div><h2 className="font-serif text-2xl">7. Solicitações de privacidade</h2><p>Para exercer seus direitos, utilize os canais oficiais de suporte disponibilizados pelo Shakstory. Antes de liberar dados ou executar alterações sensíveis, poderá ser necessária confirmação de identidade.</p></div>
      <p className="border-t border-border pt-4 text-muted-foreground">Este texto é um resumo informativo inicial. A identificação formal do controlador, o canal de privacidade, os prazos de retenção e eventuais transferências internacionais precisam de validação jurídica antes de representar uma política definitiva.</p>
    </div>
  </section>;
}

import { requestContingencyAccountDeletion } from "../lib/mirror/firebase";
function AccountCenterPanel({ email, displayName, onSaveName }: { email?: string | null; displayName?: string | null; onSaveName: (name: string) => void }) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [lgpdRequest, setLgpdRequest] = useState<"acesso" | "correcao" | "portabilidade" | "informacoes">("acesso");
  const [lgpdDetails, setLgpdDetails] = useState("");
  const [lgpdCopied, setLgpdCopied] = useState(false);
  const [lgpdSending, setLgpdSending] = useState(false);
  const [lgpdProtocol, setLgpdProtocol] = useState("");
  const [lgpdError, setLgpdError] = useState("");
  const [lgpdHistory, setLgpdHistory] = useState<Array<{ protocol: string; kind: string; status: string }>>([]);
  const [lgpdHistoryLoading, setLgpdHistoryLoading] = useState(false);
  const lgpdTypes = { acesso: "access", correcao: "correction", portabilidade: "portability", informacoes: "processing_info" } as const;
  const loadLgpdHistory = async () => {
    if (CONTINGENCY) return;
    setLgpdHistoryLoading(true);
    try {
      const response = await fetch("/api/privacy/requests", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível consultar os protocolos.");
      const data: { requests?: Array<{ protocol: string; kind: string; status: string }> } = await response.json();
      setLgpdHistory(data.requests || []);
    } catch (error) { setLgpdError(error instanceof Error ? error.message : "Falha ao consultar protocolos."); }
    finally { setLgpdHistoryLoading(false); }
  };
  const submitLgpd = async () => {
    if (CONTINGENCY || lgpdSending) return;
    setLgpdSending(true);
    setLgpdError("");
    setLgpdProtocol("");
    try {
      const response = await fetch("/api/privacy/requests", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: lgpdTypes[lgpdRequest], details: lgpdDetails.trim(), idempotencyKey: crypto.randomUUID() }),
      });
      const data: { protocol?: string; error?: string } = await response.json();
      if (!response.ok || !data.protocol) throw new Error(data.error || "Não foi possível registrar o pedido.");
      setLgpdProtocol(data.protocol);
      await loadLgpdHistory();
    } catch (error) { setLgpdError(error instanceof Error ? error.message : "Falha ao enviar pedido."); }
    finally { setLgpdSending(false); }
  };
  const [deletion, setDeletion] = useState<{ id: string; status: string; scheduledFor?: string } | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const deletionApi = async (path: string, body?: Record<string, string>) => {
    const response = await fetch("/api/account/deletion" + path, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data: { request?: { id: string; status: string; scheduledFor?: string }; id?: string; status?: string; error?: string } = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível processar a solicitação.");
    return data;
  };
  const refreshDeletion = async () => {
    if (CONTINGENCY) return;
    setDeletionBusy(true); setDeletionError("");
    try { const result = await deletionApi(""); setDeletion(result.request || null); }
    catch (error) { setDeletionError(error instanceof Error ? error.message : "Falha ao consultar."); }
    finally { setDeletionBusy(false); }
  };
  const changeDeletion = async (action: "request" | "confirm" | "cancel") => {
    if (deletionBusy) return;
    setDeletionBusy(true); setDeletionError("");
    if (CONTINGENCY) {
      try {
        if (action !== "request") throw new Error("Confirmação e cancelamento exigem o serviço de revisão.");
        await requestContingencyAccountDeletion();
        setDeletion({ id: "firebase:" + (email || "contingencia"), status: "pending_review" });
        setDeletionConfirmation("");
      } catch (error) { setDeletionError(error instanceof Error ? error.message : "Falha ao registrar no Firebase."); }
      finally { setDeletionBusy(false); }
      return;
    }
    try {
      const result = action === "request"
        ? await deletionApi("", { confirmation: "SOLICITAR EXCLUSÃO", idempotencyKey: crypto.randomUUID() })
        : await deletionApi(action === "confirm" ? "/confirm" : "/cancel", { id: deletion?.id || "", ...(action === "confirm" ? { confirmation: "CONFIRMAR 30 DIAS" } : {}) });
      if (action === "cancel") setDeletion(null);
      else if (result.request) setDeletion(result.request);
      setDeletionConfirmation("");
    } catch (error) { setDeletionError(error instanceof Error ? error.message : "Falha ao processar."); }
    finally { setDeletionBusy(false); }
  };
  const plan = usePlan();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName ?? "");
  const [savedName, setSavedName] = useState(false);
  useEffect(() => { if (!editingName) setNameDraft(displayName ?? ""); }, [displayName, editingName]);
  if (privacyOpen) return <PrivacyPolicyPanel onBack={() => setPrivacyOpen(false)} />;
  return <section className="mx-auto min-w-0 w-full max-w-4xl space-y-5 overflow-x-hidden px-0 py-5 sm:px-4 sm:py-8" aria-label="Central de Contas">
    <div><p className="font-mono text-xs uppercase tracking-[.2em] text-primary">Sua conta e privacidade</p><h1 className="mt-2 font-serif text-3xl leading-tight break-words text-foreground sm:text-4xl">Central de Contas</h1><p className="mt-3 text-muted-foreground">Gerencie seus dados, assinatura e direitos de privacidade com segurança.</p></div>
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <article className="min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 sm:p-6"><h2 className="font-serif text-xl leading-tight break-words sm:text-2xl">Dados cadastrais</h2><p className="mt-3 break-words text-sm text-muted-foreground">Nome de exibição: {displayName || "Não informado"}</p><p className="mt-1 break-all text-sm text-muted-foreground">E-mail de acesso: {email || "Não informado"}</p><p className="mt-3 break-words text-sm text-muted-foreground">O nome de exibição é salvo somente neste navegador. Não altera a identidade do Google ou Cloudflare Access.</p>{editingName ? <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); const name = nameDraft.trim(); if (!name || name.length > 120) return; onSaveName(name); setEditingName(false); setSavedName(true); }}><label className="flex min-w-0 w-full flex-1 flex-col sm:min-w-[200px] gap-1 text-sm">Novo nome de exibição<input autoFocus maxLength={120} required value={nameDraft} onChange={event => setNameDraft(event.target.value)} className="w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground" /></label><button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Salvar nome</button><button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => { setEditingName(false); setNameDraft(displayName ?? ""); }}>Cancelar</button></form> : <button type="button" className="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-primary" onClick={() => { setSavedName(false); setEditingName(true); }}>Editar nome de exibição</button>}{savedName && !editingName && <p role="status" className="mt-2 text-sm">Nome salvo neste navegador.</p>}<p className="mt-3 break-words text-sm text-muted-foreground">Alterar e-mail ou vincular métodos de acesso exige autenticação adicional e ainda não está disponível.</p></article>
      <article className="min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 sm:p-6"><h2 className="font-serif text-xl leading-tight break-words sm:text-2xl">Autenticação e segurança</h2><p className="mt-3 text-sm">Método de acesso deste endereço: <strong>{CONTINGENCY ? "Google / Firebase Authentication" : "Cloudflare Access"}</strong></p><p className="mt-2 text-sm text-muted-foreground">Identidade apresentada nesta sessão: {email || "Não disponível"}</p><p className="mt-3 break-words text-sm text-muted-foreground">O endereço de contingência e o endereço principal usam fluxos de autenticação diferentes. Esta seção informa o método de entrada do ambiente atual; não comprova que outros provedores estejam vinculados à mesma conta.</p><p className="mt-3 text-sm">Para trocar o e-mail ou o provedor de entrada, será necessária uma verificação adicional. Vinculação, desvinculação e alteração de credenciais não estão habilitadas nesta versão.</p></article>
      <article className="min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 sm:p-6"><h2 className="font-serif text-xl leading-tight break-words sm:text-2xl">Plano e assinatura</h2><p className="mt-3 text-sm">Plano informado pelo serviço: <strong>{plan.label || plan.plan}</strong></p>{plan.daysLeft != null && <p className="mt-1 text-sm text-muted-foreground">Dias restantes: {plan.daysLeft}</p>}{plan.paidUntil && <p className="mt-1 text-sm text-muted-foreground">Válido até: {plan.paidUntil}</p>}<p className="mt-3 break-words text-sm text-muted-foreground">O plano é consultado no servidor quando disponível. Na contingência ou offline, a informação pode não estar atualizada.</p><button type="button" className="mt-3 rounded-lg border border-border px-4 py-2 text-sm text-primary" onClick={() => { void refreshPlan(); }}>Atualizar informações do plano</button><p className="mt-3 text-sm">Alteração e cancelamento de assinatura aguardam integração segura com o faturamento.</p></article>
      <article className="min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 sm:p-6"><h2 className="font-serif text-xl leading-tight break-words sm:text-2xl">Privacidade e LGPD</h2><p className="mt-3 text-sm">Acesso, correção e portabilidade dos dados dependem de confirmação de identidade. A solicitação de desativação e a reativação durante o prazo contratual ainda não estão habilitadas.</p><button type="button" onClick={() => setPrivacyOpen(true)} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-primary hover:bg-muted">Ler LGPD e Política de Privacidade</button><div className="mt-5 border-t border-border pt-4"><h3 className="text-base font-semibold">Solicitação LGPD</h3><p className="mt-2 text-sm text-muted-foreground">No endereço principal, envie uma solicitação autenticada e receba um protocolo. Na contingência, o envio está indisponível porque a identidade Google não está vinculada à Cloudflare Access.</p><label className="mt-3 flex flex-col gap-1 text-sm">Tipo de solicitação<select value={lgpdRequest} onChange={event => { setLgpdRequest(event.target.value as typeof lgpdRequest); setLgpdCopied(false); }} className="w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2"><option value="acesso">Confirmação e acesso aos dados</option><option value="correcao">Correção de dados pessoais</option><option value="portabilidade">Portabilidade dos dados pessoais</option><option value="informacoes">Informações sobre tratamento e compartilhamento</option></select></label><label className="mt-3 flex flex-col gap-1 text-sm">Detalhes do pedido (opcional)<textarea maxLength={1500} rows={3} value={lgpdDetails} onChange={event => { setLgpdDetails(event.target.value); setLgpdCopied(false); }} placeholder="Descreva o que deseja solicitar, sem incluir senhas ou documentos sensíveis." className="w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2" /></label><button type="button" className="mt-3 rounded-lg border border-border px-4 py-2 text-sm text-primary hover:bg-muted" onClick={() => { const subjects = { acesso: "confirmação e acesso aos meus dados pessoais", correcao: "correção dos meus dados pessoais", portabilidade: "portabilidade dos meus dados pessoais", informacoes: "informações sobre o tratamento e compartilhamento dos meus dados pessoais" }; const text = `Assunto: Solicitação LGPD — ${subjects[lgpdRequest]}\n\nSolicito, nos termos da Lei nº 13.709/2018, ${subjects[lgpdRequest]}.\nConta: ${email || "e-mail a informar"}\n${lgpdDetails.trim() ? "\nDetalhes: " + lgpdDetails.trim() + "\n" : ""}\nPeço orientação sobre o canal seguro de verificação de identidade e os próximos passos.\n`; void navigator.clipboard.writeText(text).then(() => setLgpdCopied(true)).catch(() => { window.prompt("Copie o texto da solicitação:", text); }); }}>Copiar texto da solicitação</button><button type="button" disabled={CONTINGENCY || lgpdSending} onClick={() => { void submitLgpd(); }} className="mt-3 sm:ml-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{lgpdSending ? "Enviando..." : "Enviar solicitação e gerar protocolo"}</button><button type="button" disabled={CONTINGENCY || lgpdHistoryLoading} onClick={() => { void loadLgpdHistory(); }} className="ml-2 mt-3 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Consultar meus protocolos</button>{CONTINGENCY && <p className="mt-2 text-sm text-muted-foreground">Envio indisponível na contingência. Entre pelo endereço principal protegido por Cloudflare Access.</p>}{lgpdProtocol && <p role="status" className="mt-3 text-sm font-semibold">Pedido registrado. Protocolo: {lgpdProtocol}. Guarde este número para acompanhamento.</p>}{lgpdError && <p role="alert" className="mt-3 text-sm text-destructive">{lgpdError}</p>}{lgpdHistory.length > 0 && <ul className="mt-3 space-y-1 break-all text-sm">{lgpdHistory.map(item => <li key={item.protocol}>{item.protocol} — {item.kind} — {item.status}</li>)}</ul>}{lgpdCopied && <p role="status" className="mt-2 text-sm text-primary">Texto copiado. O pedido ainda precisa ser enviado por um canal oficial.</p>}</div></article>
      <article className="min-w-0 max-w-full rounded-2xl border border-destructive/30 bg-card p-4 sm:p-6"><h2 className="font-serif text-xl leading-tight break-words sm:text-2xl">Exclusão permanente</h2><p className="mt-3 text-sm">Você pode solicitar a exclusão e agendar um prazo de recuperação de 30 dias. Nesta etapa, o agendamento não suspende o acesso nem apaga dados; a exclusão definitiva só será habilitada após backup verificado e controles adicionais.</p>
        {CONTINGENCY ? <><p className="mt-3 text-sm text-muted-foreground">Na contingência, você pode registrar um pedido de revisão no Firebase usando sua identidade Google verificada. O pedido não exclui nem suspende sua conta. Sem conexão, o envio não é confirmado.</p><label className="mt-3 block text-sm">Digite EXCLUIR MINHA CONTA para solicitar<input className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2" value={deletionConfirmation} onChange={event => setDeletionConfirmation(event.target.value)} /></label><button type="button" disabled={deletionBusy || deletionConfirmation !== "EXCLUIR MINHA CONTA"} onClick={() => { void changeDeletion("request"); }} className="mt-3 rounded-lg border border-destructive px-4 py-2 text-sm disabled:opacity-50">Registrar pedido de exclusão no Firebase</button>{deletion?.status === "pending_review" && <p role="status" className="mt-3 text-sm">Pedido enviado para revisão. Nenhuma exclusão foi executada.</p>}{deletionError && <p role="alert" className="mt-3 text-sm text-destructive">{deletionError}</p>}</> : <>
          <button type="button" disabled={deletionBusy} onClick={() => { void refreshDeletion(); }} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Consultar situação da exclusão</button>
          {deletion && <p role="status" className="mt-3 break-all text-sm">Protocolo: {deletion.id}. Estado: {deletion.status}.{deletion.scheduledFor ? " Agendado para: " + deletion.scheduledFor + " (UTC)." : ""}</p>}
          {!deletion || deletion.status === "cancelled" ? <div className="mt-3 space-y-2"><label className="block text-sm">Digite EXCLUIR MINHA CONTA para solicitar<input className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2" value={deletionConfirmation} onChange={event => setDeletionConfirmation(event.target.value)} /></label><button type="button" disabled={deletionBusy || deletionConfirmation !== "EXCLUIR MINHA CONTA"} onClick={() => { void changeDeletion("request"); }} className="rounded-lg border border-destructive px-4 py-2 text-sm disabled:opacity-50">Solicitar exclusão</button></div> : null}
          {deletion?.status === "pending_confirmation" && <button type="button" disabled={deletionBusy} onClick={() => { void changeDeletion("confirm"); }} className="mt-3 rounded-lg border border-destructive px-4 py-2 text-sm disabled:opacity-50">Confirmar agendamento de 30 dias</button>}
          {(deletion?.status === "scheduled" || deletion?.status === "pending_confirmation") && <button type="button" disabled={deletionBusy} onClick={() => { void changeDeletion("cancel"); }} className="ml-2 mt-3 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Cancelar solicitação</button>}
          {deletionError && <p role="alert" className="mt-2 text-sm text-destructive">{deletionError}</p>}
        </>}</article>
    </div>
  </section>;
}

export default function WriterStudio() {
  const adminPlan = usePlan();
  const openAdminPlans = () => { if (!CONTINGENCY && adminPlan.owner && adminPlan.email) { setView("admin-plans"); setAccountOpen(false); window.scrollTo?.({ top: 0 }); } };
  const themeContext = useTheme();
  const [fallbackTheme, setFallbackTheme] = useState<"light" | "dark">("light");
  const theme = themeContext.switchable ? themeContext.theme : fallbackTheme;
  const [accountOpen, setAccountOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#perfil");
  const showAccount = (open: boolean) => {
    setAccountOpen(open);
    try {
      if (open && window.location.hash !== "#perfil") window.history.pushState(null, "", "#perfil");
      else if (!open && window.location.hash === "#perfil") window.history.pushState(null, "", window.location.pathname + window.location.search);
    } catch { /* histórico indisponível */ }
    if (open) window.scrollTo?.({ top: 0 });
  };
  useEffect(() => { void refreshPlan(); }, []);
  useEffect(() => {
    const sync = () => setAccountOpen(window.location.hash === "#perfil");
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, []);
  const signOut = async () => {
    if (!window.confirm("Sair da conta neste navegador?")) return;
    try { await signOutMirror(); } catch { /* Firebase indisponível: segue com o logout */ }
    if (CONTINGENCY) {
      try { localStorage.removeItem("shakstory:contingency-email"); localStorage.setItem("shakstory:mirror-enabled", "0"); } catch { /* sem armazenamento */ }
      window.history.replaceState(null, "", window.location.pathname);
      window.location.reload();
      return;
    }
    window.location.href = "/cdn-cgi/access/logout";
  };
  const { profile, setProfile, email: accountEmail, online, displayName } = useProfile();
  const toggleTheme = themeContext.toggleTheme ?? (() => setFallbackTheme(previous => previous === "light" ? "dark" : "light"));
  const [view, setView] = useState<View>("library");
  const [tutorialMenu, setTutorialMenu] = useState(false);
  const libraryQuery = trpc.data.get.useQuery({ path: "library.json" }, { enabled: !CONTINGENCY });
  const statusQuery = trpc.data.status.useQuery(undefined, { refetchInterval: CONTINGENCY ? false : 15000, enabled: !CONTINGENCY, retry: false });
  const modelQuery = trpc.literaryAssist.models.useQuery(undefined, { enabled: view === "editor" });
  const utils = trpc.useUtils();
  const literaryMutation = trpc.literaryAssist.analyze.useMutation({ onSuccess: data => setAssistResult(data) });
  const coauthorMutation = trpc.literaryAssist.coauthor.useMutation({ onSuccess: data => { setCoauthorResult(data); setCoauthorExpansion(null); } });
  const expansionTarget = useRef<{ bookId: string; sceneId: string } | null>(null);
  const expandCoauthorMutation = trpc.literaryAssist.expandCoauthor.useMutation({
    onSuccess: (data) => {
      // A expansão escolhida deve chegar ao manuscrito, não ficar apenas na prévia.
      // Nunca aplique uma resposta tardia a outro capítulo/livro.
      if (!expansionTarget.current || expansionTarget.current.bookId !== activeBookId || expansionTarget.current.sceneId !== activeNodeId) {
        setNotice("Expansão recebida para outra cena; nada foi alterado.");
        return;
      }
      if (!assessCoauthorQuality(data.text).accepted) {
        setCoauthorExpansion(data);
        setNotice("Expansão com duplicações: manuscrito preservado.");
        return;
      }
      applyCoauthorExpansion(data.text, "continue");
    },
  });
  const continuityMutation = trpc.literaryAssist.continuity.useMutation({ onSuccess: data => setContinuityResult(data) });
  const [library, setLibrary] = useState<LibraryDocument>(emptyLibrary);
  const [sha, setSha] = useState<string | undefined>();
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  // Estados de salvamento: numeração de cada edição e da última confirmada pela sincronização (o aviso "concluída" nunca cobre edição mais nova).
  const [localLost, setLocalLost] = useState(false);
  const [editSeq, setEditSeq] = useState(0);
  const [syncedSeq, setSyncedSeq] = useState(0);
  const editSeqRef = useRef(0);
  const localWrite = useRef(0);
  const lostNotified = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [manualOffline, setManualOffline] = useState(() => { try { return localStorage.getItem("shakstory:manual-offline") === "1"; } catch { return false; } });
  const manualOfflineRef = useRef(manualOffline);
  manualOfflineRef.current = manualOffline;
  const syncKv = useRef<IdbKV | null>(null);
  const kv = () => (syncKv.current ??= new IdbKV());
  const mergedHandler = useRef<((doc: LibraryLike, report: MergeReport) => void) | undefined>(undefined);
  const mirror = useMirror(kv, () => mergedHandler.current);
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
      void rememberSynced(kv(), remote as unknown as LibraryLike, libraryQuery.data.sha).catch(()=>{});
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

  const saveQueue = useRef<{busy:boolean;pending?:LibraryDocument;inflight?:LibraryDocument;pendingSeq?:number;inflightSeq?:number;sha?:string;blocked?:boolean}>({busy:false});
  const saveMutation = trpc.data.put.useMutation({
    onSuccess: result => {
      const savedDoc = saveQueue.current.inflight;
      if (savedDoc && !manualOfflineRef.current) mirror.requestPush(savedDoc as unknown as LibraryLike);
      setSha(result.sha);
      const doneSeq = saveQueue.current.inflightSeq;
      const hasMore = Boolean(saveQueue.current.pending);
      saveQueue.current.busy=false;saveQueue.current.inflight=undefined;saveQueue.current.inflightSeq=undefined;saveQueue.current.sha=result.sha;
      if (doneSeq !== undefined) setSyncedSeq(current => Math.max(current, doneSeq));
      if(saveQueue.current.pending) flushSave();
      setLocalOnly(false);
      setConflict(false);
      if (!hasMore) setNotice("Salvo na nuvem");
      void utils.data.status.invalidate();
      window.setTimeout(() => setNotice(null), 2200);
    },
    onError: error => {
      saveQueue.current.busy=false;saveQueue.current.pending??=saveQueue.current.inflight;saveQueue.current.pendingSeq??=saveQueue.current.inflightSeq;saveQueue.current.inflight=undefined;saveQueue.current.inflightSeq=undefined;
      if (error.data?.code === "CONFLICT") { void resolveConflict(); }
      else setLocalOnly(true);
    },
  });

  const resolveConflict = async () => {
    const queue = saveQueue.current;
    const local = queue.pending ?? queue.inflight ?? library;
    const coveredSeq = queue.pendingSeq ?? queue.inflightSeq;
    queue.busy = true; queue.pending = undefined; queue.pendingSeq = undefined;
    try {
      const result = await syncLibrary({ kv: kv(), transport: cloudflareTransport, local: local as unknown as LibraryLike });
      const merged = result.doc as unknown as LibraryDocument;
      queue.sha = result.sha; setSha(result.sha); queue.blocked = false;
      persistLocal(merged);
      if (coveredSeq !== undefined) setSyncedSeq(current => Math.max(current, coveredSeq));
      setLibrary(merged); setConflict(false); setLocalOnly(false);
      setNotice(result.report.conflictCopies ? "Alterações de outro aparelho foram mescladas. Trechos em conflito ficaram como “cópia local”." : "Alterações de outro aparelho foram mescladas");
      window.setTimeout(() => setNotice(null), 4000);
      void utils.data.status.invalidate();
    } catch {
      queue.pending = local; queue.pendingSeq = coveredSeq; setLocalOnly(true);
    } finally { queue.busy = false; }
  };
  const flushSave = () => {
    const queue=saveQueue.current;if(queue.busy||queue.blocked||!queue.pending||!navigator.onLine||manualOfflineRef.current)return;
    const next=queue.pending;queue.pending=undefined;queue.inflight=next;queue.inflightSeq=queue.pendingSeq;queue.pendingSeq=undefined;queue.busy=true;
    saveMutation.mutate({path:"library.json",data:next as unknown as Record<string,unknown>,expectedSha:queue.sha??sha});
  };
  const explicitSave = useRef(false);
  const flashNotice = (text: string, ms = 4000) => { setNotice(text); window.setTimeout(() => setNotice(null), ms); };
  // Contingência: o botão Salvar envia ao Firebase na hora (sem a espera de 15 s) e confirma, como o "Salvo na nuvem".
  const contingencySave = async (doc: LibraryDocument, seq: number) => {
    if (!mirror.user) { setLocalOnly(true); flashNotice("Salvo neste aparelho. Entre com o Google (Segurança dos dados) para enviar à nuvem.", 6000); return; }
    setNotice("Enviando à nuvem…");
    const ok = await mirror.sync(doc as unknown as LibraryLike, seq);
    if (ok) { setLocalOnly(false); flashNotice("Salvo na nuvem. A cópia principal é atualizada quando o endereço principal abrir.", 3500); }
    else { setLocalOnly(true); flashNotice("Salvo neste aparelho. Não consegui enviar à nuvem agora; tento de novo na próxima alteração.", 6000); }
  };
  /** Guarda a biblioteca neste aparelho (localStorage + cópia offline). Só confirma se alguma das duas aceitou; senão avisa, nunca finge que salvou. */
  const persistLocal = (doc: LibraryDocument) => {
    const id = ++localWrite.current;
    const stored = safeLocalSet("shakstory:library", JSON.stringify(doc));
    void saveLibraryBackup(doc).then(() => true, () => false).then(backupOk => {
      if (id !== localWrite.current) return; // uma gravação mais nova já substituiu esta
      const outcome = resolveLocalOutcome(stored, backupOk);
      // se só a cópia offline aceitou, a cópia antiga do localStorage ficou defasada: remove para não voltar a um texto velho
      if (outcome === "backup-only") { try { localStorage.removeItem("shakstory:library"); } catch { /* armazenamento indisponível */ } }
      if (outcome === "lost") {
        setLocalLost(true);
        if (!lostNotified.current) { lostNotified.current = true; flashNotice("Não foi possível salvar neste aparelho (sem espaço). Baixe um backup JSON agora, em Segurança dos dados.", 10000); }
      } else {
        lostNotified.current = false; setLocalLost(false);
        if (!backupOk && !navigator.onLine) flashNotice("Não foi possível guardar a cópia offline. Mantenha esta página aberta até sincronizar.");
      }
    });
    if (stored) setLocalLost(false);
    return stored;
  };
  const saveLibrary = (nextLibrary: LibraryDocument) => {
    const persistedLibrary = { ...nextLibrary, versionId: nextLibrary.versionId ?? stableId("version"), books: nextLibrary.books.map(hydrateSemanticBook) };
    const seq = ++editSeqRef.current; setEditSeq(seq);
    persistLocal(persistedLibrary);
    setLibrary(persistedLibrary);
    if (CONTINGENCY) {
      if (explicitSave.current) { explicitSave.current = false; void contingencySave(persistedLibrary, seq); return; }
      setLocalOnly(true); mirror.requestPush(persistedLibrary as unknown as LibraryLike, seq); return;
    }
    saveQueue.current.pending=persistedLibrary;saveQueue.current.pendingSeq=seq;
    if (!navigator.onLine || manualOfflineRef.current) { setLocalOnly(true); return; }
    flushSave();
  };

  useEffect(() => { if (CONTINGENCY && mirror.lastAt && !mirror.error) setLocalOnly(false); }, [mirror.lastAt, mirror.error]);
  const connectMirror = () => { void mirror.connect(library as unknown as LibraryLike, editSeqRef.current); };
  const restoreFromMirror = async () => {
    if (!window.confirm("Restaurar da cópia na nuvem? Seu texto atual é mantido e mesclado com a cópia; nada é apagado.")) return;
    const mirrored = await mirror.restore();
    if (!mirrored) { setNotice("A cópia na nuvem está vazia ou incompleta."); window.setTimeout(() => setNotice(null), 4000); return; }
    void kv().put("snapshots", "antes-da-restauracao-" + Date.now(), library).catch(() => {});
    const { doc, report } = mergeLibraries(undefined, library as unknown as LibraryLike, mirrored);
    saveLibrary(doc as unknown as LibraryDocument);
    setNotice(report.conflictCopies ? "Cópia restaurada. Trechos diferentes ficaram como “cópia local”." : "Cópia restaurada e mesclada");
    window.setTimeout(() => setNotice(null), 4500);
  };
  mergedHandler.current = (doc, report) => {
    saveLibrary(doc as unknown as LibraryDocument);
    setNotice(report.conflictCopies ? "Alterações do outro endereço foram mescladas. Trechos em conflito ficaram como “cópia local”." : "Alterações do outro endereço foram mescladas");
    window.setTimeout(() => setNotice(null), 4000);
  };
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const draftDirty = !!activeNode && (draft !== activeNode.content || draftHtml !== (activeNode.richContent ?? ""));
  const draftDirtyRef = useRef(false);
  draftDirtyRef.current = draftDirty;
  // Mantém este endereço e o espelho em dia: no principal, só depois de carregar o D1 (para nunca gravar uma biblioteca vazia por cima).
  const mirrorSyncReady = CONTINGENCY || !!libraryQuery.data;
  useEffect(() => {
    if (!mirror.user || !mirrorSyncReady) return;
    const run = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || manualOfflineRef.current || draftDirtyRef.current) return;
      void mirror.sync(libraryRef.current as unknown as LibraryLike);
    };
    run();
    const timer = window.setInterval(run, 60000);
    return () => window.clearInterval(timer);
  }, [mirror.user, mirrorSyncReady]);
  const toggleManualOffline = () => {
    const next = !manualOfflineRef.current;
    manualOfflineRef.current = next; setManualOffline(next);
    try { localStorage.setItem("shakstory:manual-offline", next ? "1" : "0"); } catch { /* sem armazenamento */ }
    if (next) { setLocalOnly(true); setNotice("Modo offline: suas alterações ficam neste aparelho até você voltar ao modo online."); }
    else { setLocalOnly(false); flushSave(); setNotice("De volta ao modo online"); }
    window.setTimeout(() => setNotice(null), 3500);
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
    const book: Book = hydrateSemanticBook({ id: bookId, title, status: "planning", targetWordCount: 50000, startedAt: now, lastOpenedAt: now, editSeconds: 0, updatedAt: now, nodes: [createInitialNode(now)], publication: { author: "", genre: "", category: "", language: "Português", description: "", isbn: "", publicationDate: "", includeToc: true, typography: "reedsy" }, hierarchy });
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
    flashNotice(`“${title}” criado`, 2600);
    saveLibrary(nextLibrary);
  };

  const addTranslatedBook = (result: TranslatedBook) => {
    if (!activeBook) return;
    const now = Date.now();
    const bookId = stableId("book");
    const nodes: Node[] = result.nodes.map(node => ({ id: stableId("chapter"), title: node.title, kind: node.kind as Node["kind"], content: node.content, updatedAt: now }));
    if (!nodes.length) return;
    const original = activeBook.publication;
    const copy: Book = hydrateSemanticBook({ id: bookId, title: result.title || `${activeBook.title} (${result.languageLabel})`, subtitle: result.subtitle, status: "editing", targetWordCount: activeBook.targetWordCount, startedAt: now, lastOpenedAt: now, editSeconds: 0, updatedAt: now, nodes, publication: { ...(original ?? { author: "", genre: "", category: "", description: "", isbn: "", publicationDate: "", includeToc: true, typography: "reedsy" as const }), language: result.languageLabel, description: result.description ?? original?.description ?? "", isbn: "", publicationDate: "" }, hierarchy: buildBookHierarchy(bookId, "", "") });
    const nextLibrary = { ...library, books: [copy, ...library.books] };
    setLibrary(nextLibrary);
    restoredWorkspace.current = true;
    setActiveBookId(copy.id); safeLocalSet("shakstory:active-book", copy.id);
    setActiveNodeId(nodes[0].id); safeLocalSet("shakstory:active-node", nodes[0].id);
    setView("project");
    saveLibrary(nextLibrary);
    setNotice(`Cópia traduzida criada: ${copy.title}`);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const updateDraft = (value: string, html?: string) => {
    setAssistResult(null);
    setDraft(value);
    setDraftHtml(html ?? continuationToHtml(value));
    if (activeNode) { safeLocalSet(`shakstory:node:${activeNode.id}`, value); safeLocalSet(`shakstory:node:${activeNode.id}:html`, html ?? continuationToHtml(value)); }
  };

  const applyCoauthorExpansion = (expandedText: string, operation: CoauthorOperation = "continue") => {
    if (!activeNode || !expandedText.trim()) return;
    const quality = assessCoauthorQuality(expandedText);
    if (!quality.accepted) { setNotice("Cowila: texto rejeitado por repetição. Escolha outra amostra."); return; }
    setCoauthorUndo({ nodeId: activeNode.id, text: draft, html: draftHtml });
    const baseHtml = draftHtml || continuationToHtml(draft);
    updateDraft(
      operation === "rewrite" ? expandedText : appendContinuationText(draft, expandedText),
      operation === "rewrite" ? continuationToHtml(expandedText) : appendContinuationHtml(baseHtml, expandedText),
    );
    setCoauthorResult(null);
    setCoauthorExpansion(null);
    setNotice(operation === "rewrite" ? "Texto reescrito · desfazer disponível" : "Continuação aplicada · desfazer disponível");
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

  const updateNodeList = (transform: (nodes: Node[]) => Node[], label?: string) => { const ok = commitStructure(transform); if (label) flashNotice(ok ? label : "Nada foi alterado.", 2400); };

  const deleteBookById = (id: string) => {
    const removed = library.books.find(book => book.id === id);
    if (!removed) return;
    void kv().put("snapshots", "antes-de-excluir-" + id + "-" + Date.now(), removed).catch(() => flashNotice("Atenção: não consegui guardar a cópia de segurança antes desta ação.", 6000));
    const nextLibrary = { ...library, books: library.books.filter(book => book.id !== id) };
    setLibrary(nextLibrary);
    if (id === activeBookId) {
      setActiveBookId(null);
      setActiveNodeId(null);
      localStorage.removeItem("shakstory:active-book");
      localStorage.removeItem("shakstory:active-node");
      setView("library");
    }
    setBookDialog(null);
    saveLibrary(nextLibrary);
    flashNotice(`“${removed.title}” excluído. Uma cópia de segurança ficou neste aparelho.`, 5000);
  };
  const deleteActiveBook = () => { if (activeBookId) deleteBookById(activeBookId); };

  const resetBookById = (id: string) => {
    const current = library.books.find(book => book.id === id);
    if (!current) return;
    const now = Date.now();
    const resetNodes = [createInitialNode(now)];
    const resetBook = { ...current, nodes: resetNodes, semanticBook: migrateLegacyNodes({ id: current.id, title: current.title, nodes: resetNodes.map(node => ({ ...node, kind: node.kind as "part" | "chapter" | "scene" })) }), planning: { characters: [], locations: [], timeline: [] }, story: { objectives: [], conflicts: [], relations: [], notes: [], noteIds: [], noteStatuses: [], scenes: [] }, status: "planning" as EditorialStatus, updatedAt: now, lastOpenedAt: now, editSeconds: 0 };
    const nextLibrary = { ...library, books: library.books.map(book => book.id === id ? resetBook : book) };
    setLibrary(nextLibrary);
    void kv().put("snapshots", "antes-de-zerar-" + id + "-" + now, current).catch(() => flashNotice("Atenção: não consegui guardar a cópia de segurança antes desta ação.", 6000));
    if (id === activeBookId) {
      setActiveNodeId(resetBook.nodes[0].id);
      safeLocalSet("shakstory:active-node", resetBook.nodes[0].id);
      setView("project");
    }
    setBookDialog(null);
    saveLibrary(nextLibrary);
    flashNotice("Livro zerado. Uma cópia de segurança ficou neste aparelho.", 5000);
  };
  const resetActiveBook = () => { if (activeBookId) resetBookById(activeBookId); };

  const quickExport = async (book: Book, format: "pdf" | "epub" | "docx" | "txt" | "html") => {
    if (!(await guardFresh("export"))) return;
    const publication = book.publication ?? { author: "", genre: "", language: "Português", description: "", includeToc: true, typography: "reedsy" as TypographyPreset };
    try {
    const exportBook = await prepareExportAssets({ bookId: book.id, copyright: publication.copyright, publicationYear: publication.publicationYear, title: book.title, subtitle: book.subtitle, author: publication.author, language: publication.language, description: publication.description, category: publication.category, isbn: publication.copyright?.isbns?.[format === "epub" ? "epub" : format === "pdf" ? "pdf" : "paperback"] || publication.isbn, publicationDate: publication.publicationDate, frontMatter:publicationSections({...publication,bookId:book.id}),backMatter:publication.backMatter,trimSize:publication.trimSize,customTrim:publication.customTrim,marginPreset:publication.marginPreset,headerText:publication.headerText,footerText:publication.footerText, runningHeader: publication.runningHeader, bleedMm: publication.bleedMm, gutterMm: publication.gutterMm, layout: "classic" as const, typography: publication.typography ?? "reedsy", coverImageUrl: publication.coverImageUrl, includeToc: publication.includeToc !== false, chapters: chaptersFromNodes(book.nodes) });
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
    if (nextView === "library" || nextView === "security" || nextView === "account-center") {
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

  const tutorialUser = accountEmail || mirror.user?.email || "";
  // O tutorial só troca de tela: não cria livro, não muda status e preserva o rascunho em edição.
  const tutorialGo = (next: View) => {
    if (next !== "library" && next !== "security" && !activeBook) return false;
    if (activeNode && (draft !== activeNode.content || draftHtml !== (activeNode.richContent ?? ""))) updateBook({});
    setView(next);
    return true;
  };
  const doneSeq = CONTINGENCY ? mirror.syncedSeq : syncedSeq;
  const saveView = resolveSaveState({
    localLost,
    conflict: conflict || statusQuery.data?.status === "conflict",
    pending: editSeq > doneSeq,
    syncing: saveMutation.isPending || (CONTINGENCY ? mirror.busy : statusQuery.data?.status === "syncing"),
    stalled: manualOffline || !online || (CONTINGENCY ? !mirror.user || Boolean(mirror.error) : localOnly),
    everSynced: doneSeq > 0 || statusQuery.data?.status === "synced",
  });
  const syncLabel = saveView.label;

  const runEditorAction = (action: EditorAction) => {
    if (action === "review") {
      if (view !== "editor") navigate("editor");
      window.setTimeout(() => {
        const summary = Array.from(document.querySelectorAll("details > summary")).find(node => node.textContent?.includes("Manuscrito, revisão e preferências"));
        const details = summary?.parentElement as HTMLDetailsElement | null | undefined;
        if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "start" }); }
      }, view === "editor" ? 0 : 250);
      return;
    }
    if (view !== "editor") navigate("editor");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("shakstory:editor-action", { detail: action })), view === "editor" ? 0 : 250);
  };
  const accountControls = <><EditorMenu hasBook={Boolean(activeBook) || library.books.length > 0} canDelete={(activeBook?.nodes.length ?? 0) > 1} theme={theme} onToggleTheme={() => toggleTheme?.()} onEditorAction={runEditorAction} onProject={() => navigate("project")} onExport={format => { const target = activeBook ?? [...library.books].sort((left, right) => (right.lastOpenedAt ?? right.updatedAt) - (left.lastOpenedAt ?? left.updatedAt))[0]; if (target) void quickExport(target, format); }} /><AvatarCard name={displayName} email={accountEmail} photo={profile.photo} online={online} onOpen={() => showAccount(true)} /><button type="button" className="sk-mobile-logout inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Sair da conta" title="Sair da conta" onClick={() => void signOut()}><LogOut className="h-4 w-4" aria-hidden="true" /></button></>;

  const filteredBooks = library.books.filter(book => !query.trim() || book.title.toLowerCase().includes(query.toLowerCase()) || book.nodes.some(node => node.content.toLowerCase().includes(query.toLowerCase())));


  return <div className={`sk-app min-h-screen bg-background text-foreground${CONTINGENCY ? " sk-contingency-editorial" : ""}`}>
    <aside className="sk-sidebar"><div className="sk-brand"><div className="sk-brand-mark"><BookOpen className="h-4 w-4" aria-hidden="true" /></div><div><p className="font-serif text-xl leading-none">Shakstory</p><p className="mt-1 text-[10px] uppercase tracking-[0.18em] opacity-60">Estúdio do autor</p></div></div>{activeBook && view !== "library" && <div className="sk-bookcard"><BookCover book={activeBook} className="sk-cover-mini" /><div className="min-w-0 flex-1"><p className="truncate font-serif text-sm">{activeBook.title}</p><p className="mt-0.5 text-[11px] opacity-60">{formatNumber(wordsOf(activeBook))} palavras · {statusLabel(activeBook.status)}</p><div className="sk-bookcard-bar"><span style={{ width: `${Math.min(100, Math.round(wordsOf(activeBook) / Math.max(1, activeBook.targetWordCount) * 100))}%` }} /></div></div></div>}<nav aria-label="Navegação principal" className="sk-nav"><RailButton active={view === "library"} icon={BookOpen} label="Biblioteca" onClick={() => setView("library")} /><span className="sk-nav-label">Seu livro</span><RailButton active={view === "project"} icon={Target} label="Projeto" onClick={() => navigate("project")} /><RailButton active={view === "editor"} icon={FileText} label="Manuscrito" onClick={() => navigate("editor")} /><RailButton active={view === "planning"} icon={UsersRound} label="Planejar" onClick={() => navigate("planning")} /><RailButton active={view === "prepare"} icon={Sparkles} label="Preparar" onClick={() => navigate("prepare")} /><span className="sk-nav-label">Proteção</span><RailButton active={view === "security"} icon={ShieldCheck} label="Segurança" onClick={() => navigate("security")} /><RailButton active={view === "authorship"} icon={BookMarked} label="Autoria X-URI" onClick={() => navigate("authorship")} />{!CONTINGENCY && adminPlan.owner && adminPlan.email && <button type="button" className="sk-nav-item sk-account-center-desktop-only" aria-current={view === "admin-plans" ? "page" : undefined} onClick={openAdminPlans}><UsersRound className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>Contas e planos</span></button>}<button type="button" className="sk-nav-item sk-account-center-desktop-only" onClick={() => showAccount(true)}><UsersRound className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>Minha conta</span></button><button type="button" className="sk-nav-item sk-account-center-desktop-only" onClick={() => navigate("account-center")}><ShieldCheck className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>Central de Contas</span></button><button type="button" data-tutorial-entry className="sk-nav-item sk-tutorial-desktop-only" onClick={() => setTutorialMenu(true)}><HelpCircle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>Tutorial com Cowila</span></button></nav></aside>
    <div className="sk-main"><header className="sk-topbar sticky top-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur"><div className="sk-topbar-inner flex items-center gap-3 px-4 py-3 sm:px-6"><Button className="lg:hidden" variant="ghost" size="icon" aria-label="Abrir menu de navegação" onClick={() => setMenuOpen(current => !current)}><Menu className="h-4 w-4" /></Button><div className="flex items-center gap-2 lg:hidden"><div className="sk-brand-mark sk-brand-mark-sm"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" /></div><span className="hidden font-serif text-lg leading-none min-[430px]:inline">Shakstory</span></div><div aria-label="Você está em" className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:flex"><span>Biblioteca</span>{view !== "library" && <><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /><span className="truncate font-medium text-foreground">{viewLabels[view]}</span></>}</div><div className="sk-topbar-actions ml-auto flex items-center gap-2"><span role="status" aria-live="polite" title={saveView.detail} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs sm:px-3 ${saveView.state === "unsaved" ? "bg-destructive text-white" : saveView.state === "conflict" || saveView.state === "local" ? "bg-amber-500/10 text-amber-900 dark:text-amber-300" : "bg-primary/10 text-primary"}`}><SyncIcon state={saveView.state} /><span className="sm:hidden">{saveView.short}</span><span className="hidden sm:inline">{saveView.label}</span></span><Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={toggleManualOffline} aria-pressed={manualOffline}>{manualOffline ? "Voltar online" : "Trabalhar offline"}</Button><Button className="hidden md:inline-flex" variant="ghost" size="sm" onClick={() => toggleTheme?.()} aria-label="Alternar tema">{theme === "dark" ? "Tema clássico" : "Tema escuro"}</Button><Button variant="ghost" size="icon" className="sk-topbar-search" aria-label="Buscar" onClick={() => { if (view !== "library") setView("library"); window.setTimeout(() => document.getElementById("library-search")?.focus(), 80); }}><Search className="h-4 w-4" /></Button>{accountControls}</div></div></header>
    {menuOpen && <div className="fixed inset-0 z-20 bg-black/10" onClick={() => setMenuOpen(false)}><aside className="absolute left-3 top-16 w-64 rounded-2xl border border-border bg-card p-3 shadow-xl" role="dialog" aria-label="Menu de navegação" onClick={event => event.stopPropagation()}><div className="mb-2 flex items-center justify-between px-2"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Navegação</p><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X className="h-4 w-4" /></Button></div>{CONTINGENCY && <button type="button" className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm sm:hidden" onClick={() => { setMenuOpen(false); if (view !== "library") setView("library"); window.setTimeout(() => document.getElementById("library-search")?.focus(), 80); }}><Search className="h-4 w-4" />Buscar na biblioteca</button>}{CONTINGENCY && <button type="button" className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm sm:hidden" onClick={() => { setMenuOpen(false); void signOut(); }}><LogOut className="h-4 w-4" />Sair da conta</button>}<div className="grid gap-1"><NavButton active={view === "library"} icon={BookOpen} label="Biblioteca" onClick={() => { setView("library"); setMenuOpen(false); }} /><NavButton active={view === "project"} icon={Target} label="Projeto" onClick={() => { navigate("project"); setMenuOpen(false); }} /><NavButton active={view === "editor"} icon={FileText} label="Manuscrito" onClick={() => { navigate("editor"); setMenuOpen(false); }} /><NavButton active={view === "planning"} icon={UsersRound} label="Planejar" onClick={() => { navigate("planning"); setMenuOpen(false); }} /><NavButton active={view === "prepare"} icon={Sparkles} label="Preparar" onClick={() => { navigate("prepare"); setMenuOpen(false); }} /><NavButton active={view === "security"} icon={ShieldCheck} label="Segurança" onClick={() => { setView("security"); setMenuOpen(false); }} /><NavButton active={view === "authorship"} icon={BookMarked} label="Autoria X-URI" onClick={() => { setView("authorship"); setMenuOpen(false); }} />{!CONTINGENCY && adminPlan.owner && adminPlan.email && <NavButton active={view === "admin-plans"} icon={UsersRound} label="Contas e planos" onClick={() => { setMenuOpen(false); openAdminPlans(); }} />}<NavButton active={accountOpen} icon={UsersRound} label="Minha conta" onClick={() => { setMenuOpen(false); showAccount(true); }} /><NavButton active={view === "account-center"} icon={ShieldCheck} label="Central de Contas" onClick={() => { navigate("account-center"); setMenuOpen(false); }} /><NavButton active={false} icon={HelpCircle} label="Tutorial com Cowila" onClick={() => { setMenuOpen(false); setTutorialMenu(true); }} /></div></aside></div>}
    {!CONTINGENCY && mirror.ready && !!libraryQuery.data && (!mirror.user || mirror.error) && <div className="border-b border-amber-500/25 bg-amber-500/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm text-amber-900 dark:text-amber-100"><span>{mirror.user ? mirror.error : "A cópia de segurança na nuvem está desligada, então o endereço de contingência fica vazio. Conecte o Google uma vez para enviar a biblioteca."}</span>{!mirror.user && <Button size="sm" disabled={mirror.busy} onClick={connectMirror}>Conectar e enviar agora</Button>}</div>{!mirror.user && mirror.error && <p role="alert" className="mx-auto max-w-7xl px-5 pb-2 text-sm text-destructive">{mirror.error}</p>}</div>}
    <PlanBanner /><PlansDialog />
    <CowilaTutorial userKey={tutorialUser || "anon"} ready={Boolean(tutorialUser) && !accountOpen && (CONTINGENCY || !libraryQuery.isLoading)} hasBook={Boolean(activeBook)} hasBooks={library.books.length > 0} view={view} go={tutorialGo} menuOpen={tutorialMenu} onMenuClose={() => setTutorialMenu(false)} />
    {CONTINGENCY && (!!mirror.error || mirror.remoteEmpty === true) && <div className="border-b border-amber-500/25 bg-amber-500/10"><p role="status" className="mx-auto max-w-7xl px-5 py-1.5 text-xs text-amber-900 dark:text-amber-100">{mirror.error || "A cópia na nuvem ainda está vazia: abra o endereço principal e aguarde alguns segundos para a biblioteca ser enviada."}</p></div>}
    {conflict && <div className="border-b border-amber-500/25 bg-amber-500/10"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 text-sm text-amber-900 dark:text-amber-100"><span>Outra sessão alterou o documento antes deste salvamento. Recarregue antes de substituir o conteúdo.</span><Button size="sm" variant="outline" onClick={() => { setConflict(false); void libraryQuery.refetch(); }}>Recarregar</Button></div></div>}
    <main className={`shakstory-workspace mx-auto min-w-0 w-full max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10 lg:pb-14${accountOpen ? " hidden" : ""}`}><WritingPreferences hidden/>{notice && view !== "editor" && <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">{notice}</div>}{view === "admin-plans" && !CONTINGENCY && adminPlan.owner && adminPlan.email && <AdminPanel onClose={() => setView("library")} />}{view === "library" && <ManuscriptImport onImport={(title, preview) => { const now=Date.now(); const book=hydrateSemanticBook({id:stableId("book"),title,status:"draft",targetWordCount:50000,updatedAt:now,nodes:preview.chapters.map((chapter,index)=>({id:stableId("chapter"),title:chapter.title||`Capítulo ${index+1}`,kind:"chapter",content:chapter.content,richContent:sanitizeRichContent(chapter.richContent),updatedAt:now}))}); const next={...library,books:[book,...library.books]};setLibrary(next);saveLibrary(next); }} />}{(view === "editor" || view === "prepare") && activeBook && <EditorialWorkbench key={view} initiallyOpen={view==="prepare"} initialTab={view==="prepare"?"copyright":"review"} publication={{...(activeBook.publication ?? {author:"",genre:"",language:"pt-BR",description:""}),bookId:activeBook.id}} review={activeBook.review} node={activeNode} nodes={activeBook.nodes} onSelect={selectManuscriptNode} text={draft} html={draftHtml} onPublication={publication=>updateBook({publication:{...activeBook.publication,...publication} as PublicationData})} onReview={review=>updateBook({review})} onRestore={(text,html)=>{skipTracking.current=draft!==text || draftHtml!==html;updateDraft(text,html);}} />}{view === "library" && <LibraryView books={filteredBooks} totalWords={totalWords} query={query} onQuery={setQuery} onOpen={chooseBook} onNew={() => setNewBookOpen(true)} onEdit={book => { setActiveBookId(book.id); setBookDialog("edit"); }} onReset={book => { setActiveBookId(book.id); setBookDialog("reset"); }} onDelete={book => { setActiveBookId(book.id); setBookDialog("delete"); }} onExport={quickExport} />}{view === "project" && activeBook && <ProjectView book={materializeDraft(activeBook)} onNavigate={navigate} onUpdate={updateBook} />}{view === "editor" && activeBook && <EditorView book={activeBook} nodes={activeBook.nodes} activeNode={activeNode} draft={draft} richContent={draftHtml} onDraftChange={updateDraft} onRichDraftChange={(value, html) => updateDraft(value, html)} onSelectNode={selectManuscriptNode} onBack={() => setView("library")} onSave={() => { explicitSave.current = true; updateBook({}); }} onUpdateBook={updateBook} onOpenPlanning={() => navigate("planning")} onOpenPrepare={() => navigate("prepare")} onAddChapter={() => updateNodeList(nodes => addChapter(nodes, Date.now()), "Capítulo adicionado")} onAddPart={() => updateNodeList(nodes => addPart(nodes, Date.now()), "Parte adicionada")} onRenameNode={(id, title) => updateNodeList(nodes => renameNode(nodes, id, title, Date.now()), "Título atualizado")} onDuplicateNode={id => updateNodeList(nodes => duplicateNode(nodes, id, Date.now()), "Capítulo duplicado")} onMoveNode={(id, direction) => updateNodeList(nodes => moveNode(nodes, id, direction), "Ordem atualizada")} onRemoveNode={id => updateNodeList(nodes => removeNode(nodes, id), "Item removido. Uma cópia ficou no histórico de versões.")} onSplitNode={splitActiveNode} onMergeNode={mergeActiveNode} onPromotePlannedScene={scene => updateNodeList(nodes => nodes.some(node => node.id === scene.id) ? nodes : [...nodes, { id: scene.id, title: scene.title, kind: "scene", content: "", updatedAt: Date.now() }])} saving={saveMutation.isPending} notice={notice} assistant={{ bookId: activeBook.id, focus: assistFocus, setFocus: setAssistFocus, result: assistResult, models: modelQuery.data?.models ?? [], isLoading: literaryMutation.isPending, error: literaryMutation.error?.message ?? null, onAnalyze: () => { if (activeNode && draft.trim()) literaryMutation.mutate({ text: draft, focus: assistFocus, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, role: assistFocus === "narrative" ? "developmental_editor" : assistFocus === "grammar" || assistFocus === "language" || assistFocus === "parts_of_speech" ? "copy_editor" : "line_editor", task: "analyze", bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, planning: activeBook.planning, story: activeBook.story, styleSample: styleSampleForBook(activeBook, activeNode.id, draft) }); }, onApply: (start, end, original, suggestion) => { if (!original || !suggestion || draft.slice(start, end) !== original) return; updateDraft(applySuggestionAtOffsets(draft, start, end, original, suggestion)); }, coauthorResult, coauthorLoading: coauthorMutation.isPending, coauthorError: coauthorMutation.error?.message ?? null, coauthorExpansion, coauthorExpansionLoading: expandCoauthorMutation.isPending, coauthorExpansionError: expandCoauthorMutation.error?.message ?? null, onGenerate: options => { if (!activeNode) return; setCoauthorExpansion(null); coauthorMutation.mutate({ bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, text: draft, intent: options.intent, targetWords: 180, alternativeCount: 3, editorialControls: options.editorialControls ?? editorialForBook(activeBook.id), genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, planning: activeBook.planning, story: activeBook.story, styleSample: styleSampleForBook(activeBook, activeNode.id, draft) }); }, onChoose: (alternative, intent, editorialControls, operation) => {
        if (!activeNode || !alternative.text.trim()) return;
        if (operation === "expand") {
          setCoauthorExpansion(null);
          expansionTarget.current = { bookId: activeBook.id, sceneId: activeNode.id };
          expandCoauthorMutation.mutate({ bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, text: draft, selectedAlternative: alternative, intent, editorialControls, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, planning: activeBook.planning, story: activeBook.story, styleSample: styleSampleForBook(activeBook, activeNode.id, draft) });
        } else {
          applyCoauthorExpansion(alternative.text, operation);
        }
      }, onApplyExpansion: (text, operation) => applyCoauthorExpansion(text, operation), onBackToSamples: () => setCoauthorExpansion(null), onReject: () => { setCoauthorResult(null); setCoauthorExpansion(null); }, canUndoCoauthor: Boolean(activeNode && coauthorUndo?.nodeId === activeNode.id), onUndoCoauthor: undoCoauthorApplication }} continuity={{ result: continuityResult, loading: continuityMutation.isPending, error: continuityMutation.error?.message ?? null, onCheck: () => { if (!activeNode) return; continuityMutation.mutate({ bookId: activeBook.id, bookTitle: activeBook.title, sceneId: activeNode.id, sceneTitle: activeNode.title, text: draft, genre: activeBook.publication?.genre, subgenre: activeBook.publication?.category, planning: activeBook.planning, story: activeBook.story }); }, onClear: () => setContinuityResult(null) }} />}{view === "planning" && activeBook && <PlanningView book={activeBook} onUpdate={updatePlanning} />}{view === "prepare" && activeBook && <PreparationView book={activeBook} onUpdate={updateBook} onNavigate={navigate} onTranslated={addTranslatedBook} />}{view === "security" && <AntivirusSecurityView />}{view === "authorship" && <section aria-labelledby="xuri-guide-title" className="mx-auto w-full max-w-4xl space-y-6"><div className="rounded-2xl border border-border bg-card p-5 sm:p-8"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><BookMarked className="h-6 w-6" aria-hidden="true" /></div><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Proteção e procedência</p><h1 id="xuri-guide-title" className="mt-1 font-serif text-3xl">Autoria X-URI, sem complicação</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">O X-URI cria registros verificáveis de versões do seu livro. Você pode guardar um dossiê e conferir se os registros e as assinaturas continuam íntegros, sem precisar entender criptografia.</p></div></div><div className="mt-6 rounded-xl border border-border p-4"><h2 className="font-semibold">O que isso comprova — e o que não comprova</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">A verificação pode indicar que os dados registrados não foram alterados e que uma assinatura corresponde à chave pública incluída. Isso é uma evidência técnica de integridade e procedência; não é certidão oficial, não confirma sua identidade civil e, por si só, não prova quem escreveu o texto. Guarde também o manuscrito original.</p></div><div><h2 className="font-serif text-xl">Passo a passo para o autor</h2><ol className="mt-4 space-y-4">{[{n:"1",title:"Abra Minha conta",body:"No menu lateral, entre em Minha conta e procure a área Autoria. É ali que você configura e administra o registro de versões."},{n:"2",title:"Ative o autenticador",body:"Siga as instruções para configurar o código de autenticação (TOTP) num aplicativo autenticador. Guarde os códigos de recuperação num local seguro."},{n:"3",title:"Configure sua chave de assinatura, se disponível",body:"A assinatura Ed25519 é uma proteção adicional. Crie a chave no seu navegador, defina uma frase-senha e guarde o arquivo de backup da chave privada. Sem a frase-senha e o backup, a chave pode ser irrecuperável."},{n:"4",title:"Registre uma versão",body:"Quando o manuscrito estiver no estado que deseja documentar, use a opção de registrar versão na área Autoria e confirme com o código do autenticador. O registro guarda um hash e se liga ao registro anterior."},{n:"5",title:"Baixe e guarde o dossiê",body:"Na área Autoria, use a opção Dossiê para baixar o arquivo JSON. Guarde-o junto com uma cópia do manuscrito correspondente. O dossiê inclui o e-mail da conta; revise-o antes de compartilhar."},{n:"6",title:"Verifique o dossiê",body:"Abra o verificador público abaixo, escolha o arquivo JSON que baixou e leia o resultado. Ele informa se a cadeia está íntegra e se as assinaturas podem ser verificadas. Faça isso novamente sempre que precisar demonstrar a integridade do arquivo."}].map(step => <li key={step.n} className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{step.n}</span><div><h3 className="font-semibold">{step.title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p></div></li>)}</ol></div><div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:flex-wrap"><Button onClick={() => showAccount(true)}>Abrir Minha conta</Button><Button variant="outline" onClick={() => window.open(`${import.meta.env.BASE_URL}verificar/xuri`, "_blank", "noopener,noreferrer")}>Abrir verificador X-URI</Button></div></div><div className="rounded-2xl border border-border p-5 sm:p-6"><h2 className="font-serif text-xl">Importante sobre a verificação</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground"><li>O arquivo é verificado no navegador e não precisa ser enviado ao verificador.</li><li>Se o dossiê não tiver assinatura, isso não significa automaticamente que os dados foram adulterados; significa que não há assinatura verificável naquele registro.</li><li>O carimbo de tempo RFC 3161 exige uma verificação criptográfica adicional com ferramentas e certificado confiável. O verificador web não conclui essa validação completa.</li><li>Para conferir o hash do conteúdo do livro, conserve o manuscrito correspondente: o dossiê não inclui o livro integral.</li></ul><p className="mt-4 text-sm text-muted-foreground">Se não encontrar a opção Autoria em Minha conta, ou se a ativação falhar, não considere uma versão registrada até que o sistema confirme a operação.</p></div></section>}{view === "account-center" && <AccountCenterPanel email={accountEmail} displayName={displayName} onSaveName={name => setProfile({ name })} />}</main></div>
    {accountOpen && <ProfilePage books={library.books} profile={profile} email={accountEmail} online={online} displayName={displayName} syncLabel={syncLabel} dataSafety={<DataSafetyPanel manualOffline={manualOffline} onToggleOffline={toggleManualOffline} mirror={mirror} onConnect={connectMirror} onRestore={() => void restoreFromMirror()} />} statusLabel={value => statusLabel(value as EditorialStatus | undefined)} onProfile={setProfile} onClose={() => showAccount(false)} onSignOut={() => void signOut()} onDeleteBook={book => deleteBookById(book.id)} onResetBook={book => resetBookById(book.id)} onOpen={book => { const found = library.books.find(item => item.id === book.id); showAccount(false); if (found) chooseBook(found); }} />}
    {!accountOpen && <CowilaChat books={library.books as never} active={activeBook as never} activeNodeId={activeNode?.id} draft={draft} online={online} ask={askCowila}
      onAddCharacters={found => { const base = activeBook?.planning ?? { characters: [], locations: [], timeline: [] }; const merged = mergeCharacters(base.characters, found, () => stableId("character")); if (merged.added || merged.updated) updatePlanning({ ...base, characters: merged.characters as Character[] }); return { added: merged.added, updated: merged.updated }; }}
      onSetDescription={text => { if (activeBook) updateBook({ publication: { ...(activeBook.publication ?? { author: "", genre: "", language: "pt-BR", description: "" }), description: text } as PublicationData }); }}
      onReplaceDraft={text => updateDraft(text)}
      onSaveSection={(target, title, content) => {
        if (!activeBook) return { replaced: false, undo: () => {} };
        const prevNodes = activeBook.nodes; const prevPublication = activeBook.publication; const now = Date.now(); let replaced = false;
        const basePub: PublicationData = prevPublication ?? { author: "", genre: "", language: "Português", description: "", includeToc: true, typography: "reedsy" };
        if (target.area === "chapter") {
          const existing = target.key === "chapter" ? undefined : activeBook.nodes.find(node => node.kind !== "part" && node.title.trim().toLowerCase() === target.title.toLowerCase());
          if (existing) { replaced = true; updateBook({ nodes: activeBook.nodes.map(node => node.id === existing.id ? { ...node, title, content, richContent: undefined, updatedAt: now } : node) }); }
          else { const created: Node = { id: stableId("chapter"), title, kind: "chapter", content, updatedAt: now }; updateBook({ nodes: target.position === "start" ? [created, ...activeBook.nodes] : [...activeBook.nodes, created] }); }
        } else if (target.area === "toc") {
          replaced = Boolean(basePub.includeToc);
          updateBook({ publication: { ...basePub, includeToc: true } });
        } else {
          const area = target.area === "front" ? "frontMatter" : "backMatter";
          const list = basePub[area] ?? [];
          replaced = list.some(section => section.id === target.key && section.content?.trim());
          const next = list.some(section => section.id === target.key) ? list.map(section => section.id === target.key ? { ...section, title: target.title, content, enabled: true } : section) : [...list, { id: target.key, title: target.title, content, enabled: true }];
          updateBook({ publication: { ...basePub, [area]: next } });
        }
        return { replaced, undo: () => updateBook({ nodes: prevNodes, publication: prevPublication ?? basePub }) };
      }} />}
    {newBookOpen && <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="new-book-title"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Novo projeto</p><h2 id="new-book-title" className="mt-2 font-serif text-3xl">Comece a história.</h2></div><Button size="icon" variant="ghost" onClick={() => setNewBookOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></Button></div><p className="mt-3 text-sm leading-6 text-muted-foreground">O primeiro capítulo será criado automaticamente. Você pode completar os metadados quando quiser.</p><label className="mt-6 block text-xs font-medium text-muted-foreground">Título<Input className="mt-2" autoFocus value={newBookTitle} onChange={event => setNewBookTitle(event.target.value)} onKeyDown={event => event.key === "Enter" && createBook()} placeholder="O nome do seu livro" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Universo<Input className="mt-2" value={newBookUniverseName} onChange={event => setNewBookUniverseName(event.target.value)} placeholder="Opcional" /></label><label className="text-xs font-medium text-muted-foreground">Série<Input className="mt-2" value={newBookSeriesName} onChange={event => setNewBookSeriesName(event.target.value)} placeholder="Opcional" /></label></div><p className="mt-2 text-[11px] leading-4 text-muted-foreground">Livros com os mesmos nomes de Universo e Série compartilham a mesma identidade narrativa.</p><Button className="mt-5 w-full" onClick={createBook} disabled={!newBookTitle.trim()}><Plus className="mr-2 h-4 w-4" />Criar livro</Button></div></div>}
    {bookDialog && activeBook && <BookDialog mode={bookDialog} book={activeBook} onClose={() => setBookDialog(null)} onSave={patch => { updateBook(patch); setBookDialog(null); flashNotice("Dados do livro salvos", 2400); }} onReset={resetActiveBook} onDelete={deleteActiveBook} />}
  </div>;
}

function RailButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof BookOpen; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`sk-nav-item${active ? " is-active" : ""}`}><Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>{label}</span></button>; }
function BookCover({ book, className = "" }: { book: Book; className?: string }) { const hue = coverHue(book.title); return <div className={`sk-cover ${className}`} style={{ background: `linear-gradient(150deg, hsl(${hue} 42% 42%), hsl(${(hue + 40) % 360} 45% 24%))` }}>{book.publication?.coverImageUrl ? <img src={book.publication.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="font-serif italic">{book.title.charAt(0).toUpperCase()}</span>}</div>; }
function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof BookOpen; label: string; onClick: () => void }) { return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>; }
function SyncIcon({ state }: { state: string }) { return state === "unsaved" ? <AlertCircle className="h-3.5 w-3.5" /> : state === "conflict" || state === "local" ? <CloudOff className="h-3.5 w-3.5" /> : state === "pending" ? <RefreshCw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />; }

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
function BookCard({ book, onOpen, onEdit, onReset, onDelete, onExport }: { book: Book; onOpen: () => void; onEdit: () => void; onReset: () => void; onDelete: () => void; onExport: (format: "pdf" | "epub" | "docx" | "txt" | "html") => void }) { const words = book.nodes.reduce((sum, node) => sum + countWords(node.content), 0); const chapters = book.nodes.filter(node => node.kind === "chapter").length; const progress = Math.min(100, Math.round((words / Math.max(1, book.targetWordCount)) * 100)); return <article className="library-book-card rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"><div className="flex gap-4"><button onClick={onOpen} aria-label={`Continuar ${book.title}`} className="group flex min-w-0 flex-1 gap-4 text-left"><div className="library-cover grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/90 to-primary/50 text-primary-foreground">{book.publication?.coverImageUrl ? <img src={book.publication.coverImageUrl} alt={`Capa de ${book.title}`} className="h-full w-full object-cover"/> : <span className="font-serif text-4xl italic">{book.title.charAt(0).toUpperCase()}</span>}</div><div className="min-w-0 flex-1 py-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-serif text-xl">{book.title}</h3><p className="mt-1 text-xs text-primary">{statusLabel(book.status)}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" /></div><p className="mt-2 truncate text-xs text-muted-foreground">{book.publication?.author || "Autor ainda não informado"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">ISBN {book.publication?.isbn || "não informado"}</p></div></button></div><div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground sm:grid-cols-4"><span><strong className="block text-foreground">{countPages(book)}</strong>páginas</span><span><strong className="block text-foreground">{chapters}</strong>capítulos</span><span><strong className="block text-foreground">{formatNumber(countCharacters(book))}</strong>caracteres</span><span><strong className="block text-foreground">{formatDuration(book.editSeconds)}</strong>edição</span></div><div className="mt-3 flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>{formatNumber(words)} palavras</span><span>{progress}%</span></div><Progress value={progress} className="h-1.5" /></div><span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(book.lastOpenedAt ?? book.updatedAt)}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar livro</Button><Button size="sm" onClick={onOpen}>Continuar</Button><Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:text-destructive" onClick={onReset} aria-label={`Zerar ${book.title}`}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Zerar manuscrito</Button><Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:text-destructive" onClick={onDelete} aria-label={`Excluir ${book.title}`}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir projeto</Button><select aria-label={`Exportar ${book.title}`} className="h-9 rounded-md border border-input bg-background px-2 text-xs" defaultValue="" onChange={event => { const format = event.target.value as "pdf" | "epub" | "docx" | "txt" | "html"; if (format) onExport(format); event.currentTarget.value = ""; }}><option value="">Exportar…</option><option value="pdf">PDF</option><option value="epub">EPUB</option><option value="docx">DOCX</option><option value="txt">TXT</option><option value="html">HTML / ebook</option></select></div></article>; }

function BookDialog({ mode, book, onClose, onSave, onReset, onDelete }: { mode: "edit" | "reset" | "delete"; book: Book; onClose: () => void; onSave: (patch: Partial<Book>) => void; onReset: () => void; onDelete: () => void }) {
  const [archived,setArchived]=useState(book.archived??false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.publication?.author ?? "");
  const [isbn, setIsbn] = useState(book.publication?.isbn ?? "");
  const [universeName, setUniverseName] = useState(book.hierarchy?.universeName ?? "");
  const [seriesName, setSeriesName] = useState(book.hierarchy?.seriesName ?? "");
  const [status, setStatus] = useState<EditorialStatus>(book.status);
  const [targetWordCount, setTargetWordCount] = useState(String(book.targetWordCount));
  const [found, setFound] = useState<Partial<PublicationData>>({});
  const applyIsbnToDialog = (info: IsbnInfo, overwrite: boolean) => {
    const current = { ...(book.publication ?? { author: "", genre: "", language: "Português", description: "" }), ...found } as PublicationData;
    const dates = publicationDates(info.publishedDate);
    const pick = <T,>(now: T | undefined, next: T | undefined) => (next && (overwrite || !now) ? next : now);
    const year = pick(current.copyright?.year ?? current.publicationYear, dates.year);
    setIsbn(normalizeIsbn(info.isbn));
    if (overwrite) setTitle(info.title);
    setAuthor(value => pick(value, info.authors.join(", ")) ?? "");
    setFound({ description: pick(current.description, info.description) ?? "", category: pick(current.category, info.categories[0]), language: overwrite ? info.language ?? current.language : current.language || info.language || "Português", publicationDate: pick(current.publicationDate, dates.date), publicationYear: year, ...(year ? { copyright: { ...current.copyright, year } } : {}) });
  };
  const dialogTitle = mode === "edit" ? "Editar livro" : mode === "reset" ? "Zerar história?" : "Excluir livro?";
  if (mode !== "edit") return <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="book-action-title"><h2 id="book-action-title" className="font-serif text-3xl">{dialogTitle}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "reset" ? "Todos os capítulos, personagens, locais, eventos e notas deste livro serão substituídos por uma estrutura vazia. Essa ação exige confirmação e preserva o UUID do livro." : "O livro será removido da biblioteca e do documento editorial. Essa ação não pode ser desfeita."}</p><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="destructive" onClick={mode === "reset" ? onReset : onDelete}>{mode === "reset" ? "Confirmar zerar" : "Confirmar exclusão"}</Button></div></div></div>;
  const publication = book.publication ?? { author: "", genre: "", language: "Português", description: "" };
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/40 p-5 backdrop-blur-sm"><div className="my-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="book-action-title"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Metadados editoriais</p><h2 id="book-action-title" className="mt-2 font-serif text-3xl">{dialogTitle}</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X className="h-4 w-4" /></Button></div><label className="mt-4 flex gap-2"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Arquivar livro</label><label className="mt-6 block text-xs font-medium text-muted-foreground">Título<Input className="mt-2" value={title} onChange={event => setTitle(event.target.value)} /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Autor<Input className="mt-2" value={author} onChange={event => setAuthor(event.target.value)} placeholder="Nome do autor" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Universo<Input className="mt-2" value={universeName} onChange={event => setUniverseName(event.target.value)} placeholder="Opcional" /></label><label className="text-xs font-medium text-muted-foreground">Série<Input className="mt-2" value={seriesName} onChange={event => setSeriesName(event.target.value)} placeholder="Opcional" /></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><IsbnLookup value={isbn} onChange={setIsbn} onApply={applyIsbnToDialog} /><label className="text-xs font-medium text-muted-foreground">Meta de palavras<Input className="mt-2" type="number" min="0" value={targetWordCount} onChange={event => setTargetWordCount(event.target.value)} /></label></div><label className="mt-4 block text-xs font-medium text-muted-foreground">Status editorial<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value as EditorialStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave({ archived, title: title.trim() || book.title, status, targetWordCount: Math.max(0, Number(targetWordCount) || 0), publication: { ...publication, ...found, author: author.trim(), isbn: isbn.trim() }, hierarchy: buildBookHierarchy(book.id, universeName, seriesName) })}>Salvar alterações</Button></div></div></div>;
}

function EditorView({ book, nodes, activeNode, draft, richContent, onDraftChange, onRichDraftChange, onSelectNode, onBack, onSave, onUpdateBook, onOpenPlanning, onOpenPrepare, onAddChapter, onAddPart, onRenameNode, onDuplicateNode, onMoveNode, onRemoveNode, onSplitNode, onMergeNode, onPromotePlannedScene, saving, notice, assistant, continuity }: { book: Book; nodes: Node[]; activeNode: Node | null; draft: string; richContent: string; onDraftChange: (value: string) => void; onRichDraftChange: (value: string, html: string) => void; onSelectNode: (id: string) => void; onBack: () => void; onSave: () => void; onUpdateBook: (patch: Partial<Book>) => void; onOpenPlanning: () => void; onOpenPrepare: () => void; onAddChapter: () => void; onAddPart: () => void; onRenameNode: (id: string, title: string) => void; onDuplicateNode: (id: string) => void; onMoveNode: (id: string, direction: "up" | "down") => void; onRemoveNode: (id: string) => void; onSplitNode: (offset?: number) => void; onMergeNode: () => void; onPromotePlannedScene: (scene: NonNullable<SemanticBook["plannedScenes"]>[number]) => void; saving: boolean; notice: string | null; assistant: LiteraryAssistantProps; continuity: ContinuityRadarProps }) {
  const [mobilePanel,setMobilePanel]=useState("writing");
  const [plainTextMode, setPlainTextMode] = useState(false);
  const [typewriterMode,setTypewriterMode]=useState(()=>localStorage.getItem("shakstory:typewriter-mode")==="true");
  const toggleTypewriter=()=>{const next=!typewriterMode;setTypewriterMode(next);setPlainTextMode(false);setMobilePanel("writing");safeLocalSet("shakstory:typewriter-mode",String(next));};
  const [distractionFree, setDistractionFree] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewBook = (): ExportBook => { const publication = book.publication ?? { author: "", genre: "", language: "Português", description: "", includeToc: true, typography: "reedsy" as TypographyPreset }; return { bookId: book.id, copyright: publication.copyright, publicationYear: publication.publicationYear, title: book.title, subtitle: book.subtitle, author: publication.author, language: publication.language, description: publication.description, category: publication.category, publicationDate: publication.publicationDate, frontMatter: publicationSections({ ...publication, bookId: book.id }), backMatter: publication.backMatter, trimSize: publication.trimSize, customTrim: publication.customTrim, marginPreset: publication.marginPreset, dropCap: (publication as { dropCap?: boolean }).dropCap, headerText: publication.headerText, footerText: publication.footerText, runningHeader: publication.runningHeader, bleedMm: publication.bleedMm, gutterMm: publication.gutterMm, layout: "classic", typography: publication.typography ?? "reedsy", coverImageUrl: publication.coverImageUrl, includeToc: publication.includeToc !== false, chapters: chaptersFromNodes(nodes.map(node => node.id === activeNode?.id ? { ...node, content: draft, richContent } : node)) }; };
  const openPreview = async () => {
    if (previewBusy) return;
    setPreviewBusy(true); setPreviewError(null);
    const tab = window.open("", "_blank");
    try {
      let payload = previewBook();
      if (JSON.stringify(payload).length > 1_800_000) payload = { ...payload, coverImageUrl: payload.coverImageUrl?.startsWith("data:") ? undefined : payload.coverImageUrl, chapters: payload.chapters.map(chapter => ({ ...chapter, richContent: chapter.richContent?.replace(/<img[^>]*src=["']data:[^>]*>/gi, "") })) };
      if (CONTINGENCY) {
        // Sem servidor: a leitura é guardada neste aparelho e aberta em /ler/local.
        await new IdbKV().put("meta", "preview-local", { book: payload, at: Date.now() });
        const localUrl = `${import.meta.env.BASE_URL}ler/local${activeNode ? `?c=${encodeURIComponent(activeNode.id)}` : ""}`;
        if (tab) tab.location.href = localUrl; else window.location.assign(localUrl);
        setPreviewBusy(false);
        return;
      }
      const response = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookId: book.id, activeId: activeNode?.id ?? null, book: payload }) });
      const result = await response.json().catch(() => ({})) as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error === "too_large" ? "O livro é grande demais para a página de leitura." : "Não foi possível gerar a página de leitura.");
      const url = `/ler/${result.token}${activeNode ? `?c=${encodeURIComponent(activeNode.id)}` : ""}`;
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (error) {
      tab?.close();
      setPreviewError(error instanceof Error ? error.message : "Falha ao abrir a pré-visualização.");
    } finally { setPreviewBusy(false); }
  };
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
  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === "find") setFindReplace(true);
      else if (action === "preview") void openPreview();
      else if (action === "split") onSplitNode(splitCursor.current);
      else if (action === "spell") { assistant.setFocus("grammar"); setMobilePanel("tools"); }
      else if (action === "delete" && activeNode && nodes.length > 1 && window.confirm(`Remover “${activeNode.title}” do manuscrito? Uma versão do conteúdo será preservada.`)) onRemoveNode(activeNode.id);
    };
    window.addEventListener("shakstory:editor-action", handler);
    return () => window.removeEventListener("shakstory:editor-action", handler);
  });
  const [selectionBox, setSelectionBox] = useState<{ top: number; bottom: number; left: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const element = richEditorRef.current;
      const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
      if (!element || !selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) { setSelectionBox(current => current ? null : current); return; }
      const range = selection.getRangeAt(0);
      const rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      if (!rect || (!rect.width && !rect.height)) { setSelectionBox(current => current ? null : current); return; }
      const left = Math.min(Math.max(rect.left + rect.width / 2, 150), Math.max(150, window.innerWidth - 150));
      setSelectionBox({ top: rect.top, bottom: rect.bottom, left });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { document.removeEventListener("selectionchange", update); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, []);
  const coarsePointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const floatBelow = Boolean(selectionBox) && (coarsePointer || (selectionBox?.top ?? 0) < 120);
  const floatStyle: React.CSSProperties | undefined = selectionBox ? { left: selectionBox.left, top: floatBelow ? selectionBox.bottom + 12 : selectionBox.top - 10, transform: floatBelow ? "translateX(-50%)" : "translate(-50%, -100%)" } : undefined;
  const iconButton = (label: string, Icon: typeof Bold, command: string, value?: string) => <button type="button" aria-label={label} title={label} className="float-btn" onMouseDown={event => { event.preventDefault(); formatSelection(command, value); }}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></button>;
  const floatingToolbar = <div role="toolbar" aria-label="Formatar texto selecionado" data-open={selectionBox ? "true" : "false"} style={floatStyle} className="float-toolbar"><div className="float-row">{iconButton("Parágrafo", Pilcrow, "formatBlock", "<p>")}{[1, 2, 3, 4, 5, 6].map(level => <button key={level} type="button" aria-label={`Título H${level}`} title={`Título H${level}`} className="float-btn float-btn-text" onMouseDown={event => { event.preventDefault(); formatSelection("formatBlock", `<h${level}>`); }}>H{level}</button>)}{iconButton("Citação", Quote, "formatBlock", "<blockquote>")}</div><div className="float-row">{iconButton("Negrito", Bold, "bold")}{iconButton("Itálico", Italic, "italic")}{iconButton("Sublinhado", UnderlineIcon, "underline")}<span className="float-sep" aria-hidden="true" />{iconButton("Lista com marcadores", List, "insertUnorderedList")}{iconButton("Lista numerada", ListOrdered, "insertOrderedList")}<span className="float-sep" aria-hidden="true" />{iconButton("Alinhar à esquerda", AlignLeft, "justifyLeft")}{iconButton("Centralizar", AlignCenter, "justifyCenter")}{iconButton("Alinhar à direita", AlignRight, "justifyRight")}<span className="float-sep" aria-hidden="true" /><button type="button" aria-label="Inserir link" title="Inserir link" className="float-btn" onMouseDown={event => { event.preventDefault(); const url = window.prompt("URL do link"); if (url) formatSelection("createLink", url); }}><Link2 className="h-[18px] w-[18px]" aria-hidden="true" /></button>{iconButton("Limpar formatação", Eraser, "removeFormat")}</div></div>;
  const quickbar = <div role="group" aria-label="Ações rápidas" className="editor-quickbar">{iconButton("Desfazer", Undo2, "undo")}{iconButton("Refazer", Redo2, "redo")}<button type="button" aria-label="Localizar" title="Localizar" className="float-btn" onClick={() => setFindReplace(value => !value)}><Search className="h-[18px] w-[18px]" aria-hidden="true" /></button>{iconButton("Inserir separador", Minus, "insertHorizontalRule")}<button type="button" aria-label="Inserir imagem" title="Inserir imagem" className="float-btn" onMouseDown={event => { event.preventDefault(); const url = window.prompt("URL da imagem"); if (url) formatSelection("insertImage", url); }}><ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" /></button><button type="button" aria-label="Pré-visualizar" title="Pré-visualizar" className="float-btn" disabled={previewBusy} onClick={() => void openPreview()}><Eye className="h-[18px] w-[18px]" aria-hidden="true" /></button>{previewError && <span role="alert" className="ml-2 text-xs text-destructive">{previewError}</span>}</div>;
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
  return <div className={`editorial-studio -mx-4 mt-4 flex min-h-[calc(100vh-5rem)] flex-col sm:-mx-5 sm:min-h-[calc(100vh-7rem)] ${distractionFree ? "bg-background" : ""}`}><div className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5 sm:px-5">{!typewriterMode && <Button className="lg:hidden" variant="ghost" size="sm" aria-expanded={mobilePanel === "manuscript"} onClick={() => setMobilePanel(mobilePanel === "manuscript" ? "writing" : "manuscript")}><PanelLeft className="mr-2 h-4 w-4" aria-hidden="true" />Capítulos</Button>}<Button className="hidden md:inline-flex" variant="ghost" size="sm" onClick={onBack}>Biblioteca</Button><ChevronRight className="hidden h-3 w-3 text-muted-foreground md:block" /><span className="hidden truncate text-sm font-medium md:block">{book.title}</span><div className="ml-auto flex items-center gap-2"><span className="hidden text-xs text-muted-foreground xl:inline">{formatNumber(manuscriptWords)} palavras · {estimatedPages} pág. · {progress}% da meta</span>{!typewriterMode && <Button className="lg:hidden" variant={mobilePanel === "tools" ? "default" : "ghost"} size="sm" onClick={() => setMobilePanel(mobilePanel === "tools" ? "writing" : "tools")}>Ferramentas</Button>}<Button onClick={onSave} variant="outline" size="sm" disabled={saving}><Save className="mr-2 h-3.5 w-3.5" />{notice || (saving ? "Salvando" : "Salvar")}</Button><details className="editor-more"><summary aria-label="Mais opções do editor" title="Mais opções"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></summary><div className="editor-more-panel"><p className="editor-more-note">{blocks.length} bloco(s) neste capítulo</p><Button onClick={toggleTypewriter} variant={typewriterMode?"default":"outline"} size="sm" aria-pressed={typewriterMode}>Máquina de escrever</Button><Button onClick={() => setDistractionFree(value => !value)} variant="outline" size="sm">{distractionFree ? "Sair do foco" : "Modo sem distração"}</Button><Button variant="outline" size="sm" onClick={() => {setPlainTextMode(true);setTypewriterMode(false);safeLocalSet("shakstory:typewriter-mode","false");}}>Editar como texto corrido</Button><Button variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => onSplitNode(splitCursor.current)} disabled={!activeNode || activeNode.kind === "part" || draft.length < 4}>Dividir aqui</Button><Button variant="outline" size="sm" onClick={onMergeNode} disabled={!activeNode || activeNode.kind === "part"}>Unir ao próximo</Button></div></details></div></div><div className="h-1 border-b border-border/50 bg-muted/40"><div className="h-full bg-primary transition-all" style={{ width: String(progress) + "%" }} /></div>{!typewriterMode && mobilePanel === "manuscript" && <button type="button" aria-label="Fechar capítulos" className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={() => setMobilePanel("writing")} />}<div className={typewriterMode?"grid flex-1 grid-cols-1":"grid flex-1 lg:grid-cols-[260px_minmax(0,1fr)_340px]"}><aside className={`editorial-sidebar border-b border-border/70 bg-secondary/30 p-3 lg:border-b-0 lg:border-r ${distractionFree || typewriterMode ? "hidden" : mobilePanel === "manuscript" ? "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-[min(88vw,22rem)] max-lg:overflow-y-auto max-lg:shadow-2xl" : "hidden lg:block"}`}><div className="manuscript-header"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Manuscrito</h2><div className="manuscript-add"><span className="hidden max-lg:inline">Adicionar</span><button type="button" onClick={onAddPart} aria-label="Adicionar parte" title="Adicionar parte" className="manuscript-add-part">P</button><button type="button" onClick={onAddChapter} aria-label="Adicionar capítulo" title="Adicionar capítulo" className="manuscript-add-plus"><Plus className="h-4 w-4" aria-hidden="true" /></button></div></div><Progress value={progress} className="mt-3 h-1" /></div><ManuscriptNavigator nodes={nodes} activeId={activeNode?.id} publication={book.publication??{author:""}} onPublication={publication=>onUpdateBook({publication:{...book.publication,...publication} as PublicationData})} onSelect={id=>{onSelectNode(id);setMobilePanel("writing");}} onMove={onMoveNode} onRename={onRenameNode} onDuplicate={onDuplicateNode} onRemove={onRemoveNode} onPrepare={onOpenPrepare} onReorder={(from,to)=>{const next=[...nodes];const source=next.findIndex(n=>n.id===from),target=next.findIndex(n=>n.id===to);if(source<0||target<0)return;const [item]=next.splice(source,1);next.splice(target,0,item);onUpdateBook({nodes:next});}}/>
{(book.semanticBook?.plannedScenes ?? book.story?.scenes ?? []).length > 0 && <div className="mt-6 border-t border-border/70 pt-4"><p className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Cenas planejadas</p>{(book.semanticBook?.plannedScenes ?? book.story?.scenes ?? []).map(scene => <button key={scene.id} onClick={() => nodes.some(node => node.id === scene.id) ? onSelectNode(scene.id) : onPromotePlannedScene(scene)} className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-card/70 hover:text-foreground"><span className="block truncate">{scene.title}</span><span className="mt-0.5 block text-[10px]">{nodes.some(node => node.id === scene.id) ? "Abrir no manuscrito" : "Criar cena editável"}</span></button>)}</div>}<div className="manuscript-footer"><strong>{formatNumber(manuscriptWords)}</strong> palavras<span>{nodes.length} {nodes.length === 1 ? "item" : "itens"}</span></div></aside><section className={(mobilePanel === "tools" ? "hidden lg:block " : "") + "editor-page flex min-h-[34rem] flex-col bg-muted/20 px-4 py-8 sm:px-8 lg:px-12"}><div className="mx-auto flex w-full max-w-3xl flex-1 flex-col"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{activeNode?.kind === "chapter" ? "Capítulo" : "Cena"}</p><h1 className="mt-3 font-serif text-3xl tracking-tight">{activeNode ? displayNodeTitle(nodes, activeNode) : "Manuscrito"}</h1><p className="mt-2 text-[11px] text-muted-foreground">{formatNumber(countWords(draft))} palavras · ~{readingMinutes} min de leitura · sessão +{formatNumber(wordsThisSession)}</p>{!typewriterMode && quickbar}{!typewriterMode && floatingToolbar}{findReplace && <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border/70 bg-card p-2"><Input aria-label="Localizar texto" value={findTerm} onChange={event => setFindTerm(event.target.value)} placeholder="Localizar" className="h-8 w-40 text-xs" /><Input aria-label="Substituir por" value={replaceTerm} onChange={event => setReplaceTerm(event.target.value)} placeholder="Substituir por" className="h-8 w-40 text-xs" /><Button size="sm" variant="outline" onClick={replaceAll} disabled={!findTerm}>Substituir tudo</Button></div>}{plainTextMode && !typewriterMode ? <div className="mt-8 flex flex-1 flex-col"><Textarea value={draft} onSelect={event => {splitCursor.current = event.currentTarget.selectionStart;}} onChange={event => onDraftChange(event.target.value)} className="min-h-[27rem] flex-1 resize-none border border-border/50 bg-card/40 p-5 font-serif text-lg leading-[1.9] shadow-none focus-visible:ring-0" placeholder="Comece onde a história pede." spellCheck /><Button className="mt-3 self-start" variant="outline" size="sm" onClick={() => setPlainTextMode(false)}>Voltar para blocos</Button></div> : <div className="mt-8 flex-1 space-y-5"><TypewriterFrame active={typewriterMode} editorRef={richEditorRef} text={draft}><div ref={richEditorRef} data-editorial-page="true" inputMode={typewriterMode?"none":"text"} onMouseUp={rememberSplitCursor} onKeyUp={rememberSplitCursor} role="textbox" aria-label="Editar bloco 1" contentEditable suppressContentEditableWarning onInput={event => { const html = sanitizeRichContent(event.currentTarget.innerHTML); lastRichInputHtmlRef.current = html; const text = (event.currentTarget.innerText ?? event.currentTarget.textContent ?? "").replace(/\u00a0/g, " "); lastRichInputTextRef.current = text; onRichDraftChange(text, html); }} onBlur={event => { const html = sanitizeRichContent(event.currentTarget.innerHTML); lastRichInputHtmlRef.current = html; const text = (event.currentTarget.innerText ?? event.currentTarget.textContent ?? "").replace(/\u00a0/g, " "); lastRichInputTextRef.current = text; onRichDraftChange(text, html); }} className="min-h-[34rem] whitespace-pre-wrap font-serif text-[18px] leading-[1.9] outline-none empty:before:text-muted-foreground empty:before:content-['Comece_onde_a_história_pede.'] [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-5 [&_h1]:my-8 [&_h1]:text-3xl [&_h2]:my-7 [&_h2]:text-2xl [&_h3]:my-6 [&_h3]:text-xl [&_p]:mb-4" /></TypewriterFrame></div>}<div className="mt-5 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-border/60 bg-background p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Sessão</p><p className="mt-1 text-sm font-medium">+{formatNumber(wordsThisSession)} palavras</p><p className="text-[10px] text-muted-foreground">{sessionMinutes} min</p></div><div className="rounded-xl border border-border/60 bg-background p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Manuscrito</p><p className="mt-1 text-sm font-medium">{formatNumber(manuscriptWords)} palavras</p><p className="text-[10px] text-muted-foreground">{estimatedPages} páginas estimadas</p></div><div className="rounded-xl border border-border/60 bg-background p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Meta</p><p className="mt-1 text-sm font-medium">{targetWords ? String(progress) + "% concluído" : "Sem meta definida"}</p><Progress value={progress} className="mt-2 h-1" /></div></div><div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground"><span>Ctrl/⌘+S salva · Ctrl/⌘+Shift+F ativa foco · Ctrl/⌘+K localiza</span><span>rascunho local protegido</span></div></div></section><aside className={"border-t border-border/70 bg-background lg:border-l lg:border-t-0 " + (distractionFree || typewriterMode ? "hidden" : mobilePanel === "tools" ? "" : "hidden lg:block")}><div className="grid grid-cols-3 border-b border-border/70 p-2">{([["assistant","Revisar"],["context","Contexto"],["goals","Metas"]] as const).map(([value,label]) => <button key={value} onClick={() => setInspectorTab(value)} className={"rounded-md px-2 py-2 text-[11px] font-medium transition " + (inspectorTab === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}</div><div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-4">{inspectorTab === "assistant" && <LiteraryAssistant {...assistant} />}{inspectorTab === "context" && <div className="space-y-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Contexto da obra</p><h2 className="mt-1 font-serif text-2xl">Referências rápidas</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Personagens, lugares e cenas planejadas permanecem ao alcance enquanto você escreve.</p></div><div className="grid grid-cols-3 gap-2"><div className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{book.planning?.characters.length ?? 0}</p><p className="text-[9px] text-muted-foreground">personagens</p></div><div className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{book.planning?.locations.length ?? 0}</p><p className="text-[9px] text-muted-foreground">lugares</p></div><div className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{book.story?.scenes.length ?? 0}</p><p className="text-[9px] text-muted-foreground">cenas</p></div></div><div className="rounded-xl border border-primary/15 bg-primary/5 p-3"><div className="flex items-center justify-between gap-2"><div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-primary">Style DNA</p><p className="mt-1 text-xs font-medium">Voz observada nesta obra</p></div><Badge variant="outline" className="text-[9px]">{styleDna.wordCount} palavras analisadas</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Frase média</span><strong className="mt-1 block text-xs text-foreground">{styleDna.averageSentenceWords} palavras</strong></div><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Parágrafo médio</span><strong className="mt-1 block text-xs text-foreground">{styleDna.averageParagraphWords} palavras</strong></div><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Diálogo</span><strong className="mt-1 block text-xs text-foreground">{Math.round(styleDna.dialogueWordRatio * 100)}%</strong></div><div className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">Diversidade lexical</span><strong className="mt-1 block text-xs text-foreground">{Math.round(styleDna.lexicalDiversity * 100)}%</strong></div></div><p className="mt-2 text-[10px] leading-4 text-muted-foreground">Ritmo: {styleDna.rhythm === "concise" ? "frases mais curtas" : styleDna.rhythm === "expansive" ? "frases mais expansivas" : "cadência equilibrada"}. A Cowila usa isso como referência suave, nunca como regra.</p></div><div className="rounded-xl border border-border/70 bg-card p-3"><div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10"><ShieldCheck className="h-3.5 w-3.5 text-primary" /></div><div className="min-w-0"><p className="text-xs font-medium">Radar de Continuidade</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Cruza a cena com cânone, cronologia, conhecimento, relações, locais e regras do mundo.</p></div></div><Button className="mt-3 w-full" size="sm" variant="outline" onClick={continuity.onCheck} disabled={continuity.loading || !draft.trim()}><ShieldCheck className="mr-2 h-3.5 w-3.5" />{continuity.loading ? "Verificando continuidade…" : "Verificar continuidade"}</Button>{continuity.error && <div className="mt-3 rounded-lg bg-destructive/10 p-3 text-[10px] text-destructive">{continuity.error}</div>}{continuity.result && <div className="mt-3 space-y-3"><div className="grid grid-cols-3 gap-1.5 text-center text-[9px]"><div className="rounded-lg bg-muted/60 p-2"><strong className="block text-xs text-foreground">{continuity.result.context.bookCanonFacts}</strong>livro</div><div className="rounded-lg bg-muted/60 p-2"><strong className="block text-xs text-foreground">{continuity.result.context.seriesCanonFacts}</strong>série</div><div className="rounded-lg bg-muted/60 p-2"><strong className="block text-xs text-foreground">{continuity.result.context.universeCanonFacts}</strong>universo</div></div>{continuity.result.canonWarnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">{continuity.result.canonWarnings.map((warning,index)=><p key={index} className="text-[10px] leading-4 text-muted-foreground">• {warning}</p>)}</div>}<MarkdownText className="max-h-72 overflow-y-auto rounded-lg bg-secondary/40 p-3 text-[11px] leading-5" text={continuity.result.report} /><div className="flex items-center justify-between gap-2"><span className="text-[9px] text-muted-foreground">{continuity.result.context.planningEntities} refs. de planejamento · {continuity.result.context.storyEntities} refs. narrativas</span><Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={continuity.onClear}>Limpar</Button></div></div>}</div>{book.planning?.characters.slice(0,5).map(item => <div key={item.id} className="rounded-xl border border-border/70 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{item.name}</p><Badge variant="outline" className="text-[9px]">{item.role}</Badge></div>{item.notes && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.notes}</p>}</div>)}{book.planning?.locations.slice(0,3).map(item => <div key={item.id} className="rounded-xl border border-border/70 p-3"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-[10px] text-primary">{item.atmosphere}</p></div>)}{(book.story?.scenes ?? []).filter(scene => scene.chapterId === activeNode?.id).map(scene => <div key={scene.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] uppercase tracking-wider text-primary">Cena planejada</p><h3 className="mt-1 text-sm font-medium">{scene.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Objetivo: {book.story?.objectives.find(item => item.id === scene.objectiveId)?.title ?? scene.objective ?? "A definir"}</p><p className="text-xs leading-5 text-muted-foreground">Conflito: {book.story?.conflicts.find(item => item.id === scene.conflictId)?.title ?? scene.conflict ?? "A definir"}</p>{scene.notes && <p className="mt-2 text-xs leading-5">{scene.notes}</p>}</div>)}<Button variant="outline" className="w-full" onClick={onOpenPlanning}><UsersRound className="mr-2 h-3.5 w-3.5" />Abrir planejamento completo</Button></div>}{inspectorTab === "goals" && <div className="space-y-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Produtividade</p><h2 className="mt-1 font-serif text-2xl">Ritmo de escrita</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Metas ligadas ao manuscrito, sem transformar o processo criativo em uma planilha.</p></div><div className="rounded-xl border border-border/70 p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Progresso do livro</span><strong className="text-sm">{progress}%</strong></div><Progress value={progress} className="mt-3" /><div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>{formatNumber(manuscriptWords)}</span><span>{targetWords ? formatNumber(targetWords) : "sem meta"}</span></div></div><label className="block text-xs font-medium text-muted-foreground">Meta total de palavras<Input type="number" min="0" className="mt-2" value={book.targetWordCount} onChange={event => onUpdateBook({ targetWordCount: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="block text-xs font-medium text-muted-foreground">Meta diária<Input type="number" min="0" className="mt-2" value={dailyGoal || ""} onChange={event => onUpdateBook({ dailyGoalWords: Math.max(0, Number(event.target.value) || 0) })} placeholder="Ex.: 1000" /></label><label className="block text-xs font-medium text-muted-foreground">Prazo<Input type="date" className="mt-2" value={book.deadline ?? ""} onChange={event => onUpdateBook({ deadline: event.target.value || undefined })} /></label><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-muted/60 p-3"><Clock3 className="h-3.5 w-3.5 text-primary" /><p className="mt-2 text-sm font-medium">{formatDuration(book.editSeconds)}</p><p className="text-[9px] text-muted-foreground">tempo registrado</p></div><div className="rounded-lg bg-muted/60 p-3"><Target className="h-3.5 w-3.5 text-primary" /><p className="mt-2 text-sm font-medium">{dailyGoal ? formatNumber(dailyGoal) + "/dia" : "Livre"}</p><p className="text-[9px] text-muted-foreground">ritmo diário</p></div></div><Button variant="outline" className="w-full" onClick={onOpenPrepare}><Sparkles className="mr-2 h-3.5 w-3.5" />Preparar publicação</Button></div>}</div><div className="border-t border-border/70 p-3"><div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>Histórico versionado</span><History className="h-3.5 w-3.5 text-primary" /></div></div></aside></div></div>;
}

export function LiteraryAssistant({
  bookId,
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
  const [operation, setOperation] = useState<CoauthorOperation>("continue");
  const [generatedOperation, setGeneratedOperation] = useState<CoauthorOperation>("continue");
  const [editorialControls, setEditorialControls] = useState<EditorialControls>(() => bookId ? editorialForBook(bookId) : normalizeEditorialControls(null));
  const [termsDraft, setTermsDraft] = useState("");
  useEffect(() => {
    const loaded = bookId ? editorialForBook(bookId) : normalizeEditorialControls(null);
    setEditorialControls(loaded);
    setTermsDraft(loaded.protectedTerms.join(", "));
  }, [bookId]);
  const updateEditorialControls = (next: EditorialControls) => {
    setEditorialControls(next);
    if (bookId) {
      try { localStorage.setItem(`shakstory:cowila:editorial:${bookId}`, JSON.stringify(next)); }
      catch { /* configurações locais são opcionais */ }
    }
  };
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
        <div className="rounded-lg bg-primary/5 p-3"><p className="text-xs leading-5"><InlineMarkdown text={result.summary} /></p></div>
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
        {result.narrativeNotes.length > 0 && <div><p className="mb-2 text-xs font-medium">Notas de leitura</p><ul className="space-y-1 text-xs text-muted-foreground">{result.narrativeNotes.slice(0, 4).map((item, index) => <li key={index}>• <InlineMarkdown text={item} /></li>)}</ul></div>}
      </div>}
    </div> : <div className="mt-4">
      <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
        <p className="text-xs font-medium">Coautoria em duas etapas</p>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">1. A Cowila cria três amostras. 2. Você escolhe uma. Continuar acrescenta, reescrever substitui e expandir gera uma versão longa antes de aplicar.</p>
      </div>

      <label className="mt-4 block text-xs font-medium text-muted-foreground">Tipo de trabalho da Coautora
        <select aria-label="Tipo de trabalho da Coautora" value={operation} onChange={event => setOperation(event.target.value as CoauthorOperation)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-2 text-xs">
          <option value="continue">Continuar — acrescentar sem apagar</option>
          <option value="rewrite">Reescrever — substituir o texto atual</option>
          <option value="expand">Expandir — escolher amostra e gerar expansão</option>
        </select>
      </label>
      <label className="mt-4 block text-xs font-medium text-muted-foreground">O que deve acontecer agora?
        <Textarea aria-label="Intenção da continuação" value={intent} onChange={event => setIntent(event.target.value)} className="mt-2 min-h-20 text-xs" placeholder="Ex.: aumentar a tensão, mas Elia ainda não deve descobrir toda a verdade." />
      </label>

      <details className="mt-3 rounded-lg border border-border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Preferências editoriais da Coautora</summary>
        <label className="mt-3 block">Intensidade
          <select aria-label="Intensidade da Coautora" value={editorialControls.intensity} onChange={event => updateEditorialControls({ ...editorialControls, intensity: event.target.value as EditorialControls["intensity"] })} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2">
            <option value="leve">Leve</option>
            <option value="equilibrada">Equilibrada</option>
            <option value="profunda">Profunda</option>
          </select>
        </label>
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" checked={editorialControls.protectCanon} onChange={event => updateEditorialControls({ ...editorialControls, protectCanon: event.target.checked })} />
          Proteger cânone e continuidade narrativa
        </label>
        <label className="mt-3 block">Termos protegidos (separados por vírgula)
          <Textarea aria-label="Termos protegidos na Coautora" rows={2} value={termsDraft} onChange={event => setTermsDraft(event.target.value)} onBlur={() => { const terms = normalizeProtectedTerms(termsDraft); updateEditorialControls({ ...editorialControls, protectedTerms: terms }); setTermsDraft(terms.join(", ")); }} className="mt-1 text-xs" placeholder="Helena, Arven, Vale do Norte" />
        </label>
        <p className="mt-2 text-muted-foreground">Configurações locais compartilhadas com a Cowila deste livro. Nenhuma proposta entra no manuscrito sem sua aprovação.</p>
      </details>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
        <Badge variant="outline">3 amostras</Badge>
        <Badge variant="outline">~180 palavras cada</Badge>
        <Badge variant="outline">nenhuma altera o manuscrito</Badge>
        <span>Termos e voz protegidos conforme as preferências acima.</span>
      </div>

      <Button className="mt-3 w-full" size="sm" onClick={() => { const chosenOperation = operation === "continue" && /\b(reescrev|reescrit|reescrever|reformular|refaça|refazer|substitu)/i.test(intent) ? "rewrite" : operation; setSelectedSampleId(null); setGeneratedOperation(chosenOperation); onGenerate({ intent: (chosenOperation === "rewrite" ? "Reescreva integralmente o texto fornecido, sem continuar a cena. " : chosenOperation === "expand" ? "Expanda o contexto e desenvolva o caminho escolhido. " : "Continue o texto sem reescrever o que já existe. ") + intent, operation: chosenOperation, editorialControls }); }} disabled={coauthorLoading || coauthorExpansionLoading}>
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
            <Badge variant="outline" className="text-[9px]">{assessCoauthorQuality(alternative.text).accepted ? "Amostra" : "Revisão necessária"}</Badge>
          </div>
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-serif text-[13px] leading-6">{alternative.text}</p>
          {!assessCoauthorQuality(alternative.text).accepted && <p role="alert" className="mt-2 text-xs text-destructive">Esta amostra contém blocos duplicados e não pode ser escolhida. As outras opções continuam disponíveis.</p>}
          {assessCoauthorQuality(alternative.text).warnings.length > 0 && <p className="mt-2 text-xs text-amber-600">{assessCoauthorQuality(alternative.text).warnings.join(" ")}</p>}
          <Button className="mt-3 w-full" size="sm" variant="outline" disabled={coauthorExpansionLoading || !assessCoauthorQuality(alternative.text).accepted} onClick={() => { setSelectedSampleId(alternative.id); onChoose(alternative, intent, editorialControls, generatedOperation); }}>
            <ChevronRight className="mr-2 h-3.5 w-3.5" />{coauthorExpansionLoading && selectedSampleId === alternative.id ? "Expandindo e inserindo…" : (generatedOperation === "expand" ? "Expandir este caminho" : generatedOperation === "rewrite" ? "Substituir pelo texto escolhido" : "Adicionar ao manuscrito")}
          </Button>
        </article>)}
        {coauthorExpansionLoading && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[10px] leading-4 text-muted-foreground">A Cowila está expandindo o caminho escolhido. Após a validação, o texto será acrescentado ao final da cena automaticamente.</div>}
        <Button variant="ghost" className="w-full text-xs" onClick={() => { setSelectedSampleId(null); onReject(); }}>Descartar as 3 amostras</Button>
      </div>}

      {coauthorExpansion && <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-xs font-medium">Continuação expandida</p><p className="mt-0.5 text-[9px] text-muted-foreground">{countWords(coauthorExpansion.text)} palavras · fase 2</p></div>
            <Badge className="text-[9px]">{assessCoauthorQuality(coauthorExpansion.text).accepted ? "Pronta para decisão" : "Repetição detectada"}</Badge>
          </div>
          <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-serif text-[13px] leading-6">{coauthorExpansion.text}</p>
        </div>
        {!assessCoauthorQuality(coauthorExpansion.text).accepted && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">A Cowila repetiu blocos ou construções em excesso. Esta continuação não pode ser aplicada. Volte às amostras para gerar uma nova versão.</div>}
        {coauthorExpansion.canonWarnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] font-medium">Alertas antes de aplicar</p>
          {coauthorExpansion.canonWarnings.map((warning, index) => <p key={index} className="mt-1 text-[10px] leading-4 text-muted-foreground">• {warning}</p>)}
        </div>}
        <Button className="w-full" size="sm" disabled={!assessCoauthorQuality(coauthorExpansion.text).accepted} onClick={() => onApplyExpansion(coauthorExpansion.text, generatedOperation)}>
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
  const nextSnapshotLabel = () => `Snapshot ${snapshots.reduce((max, item) => { const m = /^Snapshot (\d+)$/.exec(item.label); return m ? Math.max(max, Number(m[1])) : max; }, 0) + 1}`;
  const saveSnapshot = (label?: string) => { const next = [{ id: stableId("snapshot"), createdAt: Date.now(), label: label ?? nextSnapshotLabel(), book }, ...snapshots].slice(0, 10); if (!safeLocalSet(snapshotKey, JSON.stringify(next))) { setSnapshotError("Não foi possível guardar o snapshot. Baixe um backup antes de restaurar."); return false; } setSnapshots(next); setSnapshotError(""); return true; };
  const sameProject = (a: Book, b: Book) => JSON.stringify({ ...a, updatedAt: 0, lastOpenedAt: 0, editSeconds: 0 }) === JSON.stringify({ ...b, updatedAt: 0, lastOpenedAt: 0, editSeconds: 0 });
  const [snapshotNote, setSnapshotNote] = useState("");
  const restoreSnapshot = (snapshot: { label?: string; book: Book }) => {
    // Restaurar não cria um snapshot "novo" qualquer: se o projeto atual já é igual ao escolhido, nada muda; senão o estado atual é guardado como "Antes de restaurar" para poder voltar.
    if (sameProject(snapshot.book, book)) { setSnapshotNote("O projeto já está igual a este snapshot. Nada foi alterado."); return; }
    const keepCurrent = !snapshots.some(item => sameProject(item.book, book));
    if (keepCurrent && !saveSnapshot("Antes de restaurar")) return;
    onUpdate({ ...snapshot.book, updatedAt: Date.now() });
    setSnapshotNote(`${snapshot.label ?? "Snapshot"} restaurado.${keepCurrent ? " O estado anterior ficou guardado como “Antes de restaurar”." : ""}`);
  };
  const steps = book.nextSteps ?? [];
  const addNextStep = () => { if (!nextStep.trim()) return; onUpdate({ nextSteps: [...steps, nextStep.trim()] }); setNextStep(""); };
  return <div className="animate-in fade-in-0 duration-300"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Projeto do livro</p><div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h1 className="font-serif text-4xl tracking-tight">{book.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Comece pelo contexto, organize o universo e só depois abra o manuscrito quando quiser.</p><div className="mt-3 flex flex-wrap gap-2" aria-label="Hierarquia narrativa"><span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">Universo: {book.hierarchy?.universeName || "não definido"}</span><span className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">Série: {book.hierarchy?.seriesName || "não definida"}</span></div></div><Button onClick={() => onNavigate("prepare")}><Sparkles className="mr-2 h-4 w-4" />Preparar publicação</Button></div><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Status" value={statusLabel(book.status)} icon={Target} /><Stat label="Palavras" value={`${formatNumber(words)} / ${formatNumber(book.targetWordCount)}`} icon={FileText} /><Stat label="Personagens" value={String(planning.characters.length)} icon={UsersRound} /><Stat label="Eventos" value={String(planning.timeline.length)} icon={Target} /></div><div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">Estrutura semântica pronta: {semantic.parts.length} parte(s), {semanticChapters} capítulo(s), {semanticScenes} cena(s) e blocos preservados para evolução futura.</div><section className="mt-5 rounded-2xl border border-border/70 bg-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Meta de escrita</p><h2 className="mt-2 font-serif text-2xl">Transforme intenção em ritmo.</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Defina uma meta total e um prazo; o progresso é calculado a partir do manuscrito atual.</p></div><div className="text-left sm:text-right"><p className="text-xs text-muted-foreground">Progresso</p><p className="font-serif text-2xl text-primary">{Math.min(100, Math.round((words / Math.max(1, Number(goalWords) || 1)) * 100))}%</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium text-muted-foreground">Meta total de palavras<Input className="mt-2" type="number" min="0" value={goalWords} onChange={event => setGoalWords(event.target.value)} onBlur={() => onUpdate({ targetWordCount: Math.max(0, Number(goalWords) || 0) })} /></label><label className="text-xs font-medium text-muted-foreground">Meta diária<Input className="mt-2" type="number" min="0" value={book.dailyGoalWords ?? 500} onChange={event => onUpdate({ dailyGoalWords: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="text-xs font-medium text-muted-foreground">Prazo<Input className="mt-2" type="date" value={deadline} onChange={event => { setDeadline(event.target.value); onUpdate({ deadline: event.target.value }); }} /></label></div><div className="mt-4"><Progress value={Math.min(100, Math.round((words / Math.max(1, Number(goalWords) || 1)) * 100))} className="h-2" /><p className="mt-2 text-[11px] text-muted-foreground">{formatNumber(words)} de {formatNumber(Number(goalWords) || 0)} palavras · {formatNumber(book.dailyGoalWords ?? 500)} por dia{deadline ? ` · prazo ${deadline}` : ""}</p></div></section><section className="mt-5 rounded-2xl border border-border/70 bg-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Snapshots locais</p><h2 className="mt-2 font-serif text-2xl">Volte a uma decisão anterior.</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Uma cópia local do projeto é criada sem alterar o documento salvo na nuvem.</p></div><Button variant="outline" size="sm" onClick={() => { saveSnapshot(); }}>Criar snapshot</Button></div>{snapshots.length > 0 ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{snapshots.map(snapshot => <div key={snapshot.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3"><div><p className="text-xs font-medium">{snapshot.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(snapshot.createdAt)}</p></div><Button variant="ghost" size="sm" onClick={() => restoreSnapshot(snapshot)}>Restaurar</Button></div>)}</div> : <p className="mt-4 text-xs text-muted-foreground">Nenhum snapshot criado nesta sessão.</p>}</section>{snapshotNote && !snapshotError && <p role="status" className="mt-3 text-sm text-muted-foreground">{snapshotNote}</p>}{snapshotError && <p role="alert" className="mt-3 text-sm text-destructive">{snapshotError}</p>}<ProjectBackupPanel book={book} onRestore={restored => { if (!saveSnapshot()) throw new Error("A restauração foi interrompida porque não foi possível guardar a cópia atual."); onUpdate({ planning: undefined, story: undefined, review: undefined, publication: undefined, writingProgress: undefined, hierarchy: undefined, semanticBook: undefined, nextSteps: undefined, subtitle: undefined, dailyGoalWords: undefined, deadline: undefined, archived: undefined, ...restored as unknown as Book, updatedAt: Date.now() }); }} /><ProjectProgressPanel nodes={book.nodes} history={book.writingProgress} /><div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="grid gap-4 md:grid-cols-3"><ProjectAction title="Planejar universo" description="Personagens, locais e timeline para dar continuidade à história." icon={UsersRound} onClick={() => onNavigate("planning")} /><ProjectAction title="Manuscrito" description="Abra capítulos apenas quando quiser escrever ou revisar." icon={FileText} onClick={() => onNavigate("editor")} /><ProjectAction title="Preparar" description="Metadados e visão estrutural para a etapa de publicação." icon={Sparkles} onClick={() => onNavigate("prepare")} /></div><section className="rounded-2xl border border-border/70 bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Próximos passos</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Pequenas decisões que mantêm o projeto em movimento.</p><div className="mt-4 space-y-2">{steps.map((step, index) => <div key={`${step}-${index}`} className="flex items-start gap-2 rounded-lg bg-secondary/50 p-2.5 text-xs"><span className="mt-0.5 text-primary">{index + 1}.</span><span className="flex-1">{step}</span><button className="text-muted-foreground hover:text-foreground" aria-label={`Remover passo ${step}`} onClick={() => onUpdate({ nextSteps: steps.filter((_, itemIndex) => itemIndex !== index) })}><X className="h-3.5 w-3.5" /></button></div>)}<div className="flex gap-2"><Input value={nextStep} onChange={event => setNextStep(event.target.value)} onKeyDown={event => event.key === "Enter" && addNextStep()} placeholder="Adicionar um próximo passo" /><Button size="icon" variant="outline" onClick={addNextStep} aria-label="Adicionar próximo passo" disabled={!nextStep.trim()}><Plus className="h-4 w-4" /></Button></div></div></section></div></div>;
}
function ProjectAction({ title, description, icon: Icon, onClick }: { title: string; description: string; icon: typeof BookOpen; onClick: () => void }) { return <button onClick={onClick} className="rounded-2xl border border-border/70 bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><Icon className="h-4 w-4 text-primary" /><h2 className="mt-8 font-serif text-xl">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><span className="mt-5 inline-flex items-center text-xs font-medium text-primary">Abrir <ChevronRight className="ml-1 h-3 w-3" /></span></button>; }
function PreparationView({ book, onUpdate, onNavigate, onTranslated }: { book: Book; onUpdate: (patch: Partial<Book>) => void; onNavigate?: (view: View) => void; onTranslated?: (result: TranslatedBook) => void }) {
  const [translateOpen, setTranslateOpen] = useState(false);
  const [publication, setPublication] = useState<PublicationData>(book.publication ?? { author: "", genre: "", language: "Português", description: "", includeToc: true, typography: "reedsy", frontMatter: [{ id: "dedication", title: "Dedicatória", content: "", enabled: false }, { id: "preface", title: "Prefácio", content: "", enabled: false }], backMatter: [{ id: "about-author", title: "Sobre o autor", content: "", enabled: false }, { id: "afterword", title: "Posfácio", content: "", enabled: false }] });
  const [layout, setLayout] = useState<"classic" | "compact">("classic");
  const [previewDevice, setPreviewDevice] = useState<"book" | "tablet" | "phone" | "print">("book");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportLang, setExportLang] = useState("original");
  const [exportAi, setExportAi] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const coverUpload = trpc.assets.uploadCover.useMutation({ onSuccess: result => { const nextPublication = { ...publication, coverImageUrl: result.url }; setPublication(nextPublication); onUpdate({ publication: nextPublication }); } });
  const update = (patch: Partial<PublicationData>) => {const next={...publication,...patch};setPublication(next);onUpdate({publication:next});};
  const [metaSave, setMetaSave] = useState<{ ok: boolean; text: string } | null>(null);
  const saveMetadata = () => {
    onUpdate({ publication });
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    let stored = false;
    try {
      const saved = JSON.parse(localStorage.getItem("shakstory:library") ?? "null");
      const found = saved?.books?.find((item: { id: string }) => item.id === book.id);
      stored = Boolean(found) && JSON.stringify(found.publication?.coverImageUrl ?? "") === JSON.stringify(publication.coverImageUrl ?? "") && (found.publication?.author ?? "") === (publication.author ?? "");
    } catch { stored = false; }
    setMetaSave(stored ? { ok: true, text: `✓ Metadados salvos às ${time}.` } : { ok: false, text: "Não consegui confirmar o salvamento neste navegador (armazenamento cheio ou bloqueado). Se enviou uma capa grande, use uma imagem menor ou uma URL." });
  };
  const applyIsbn = (info: IsbnInfo, overwrite: boolean) => {
    const pick = <T,>(current: T | undefined, found: T | undefined) => (found && (overwrite || !current) ? found : current);
    const dates = publicationDates(info.publishedDate);
    const year = pick(publication.copyright?.year ?? publication.publicationYear, dates.year);
    const next: PublicationData = {
      ...publication,
      isbn: normalizeIsbn(info.isbn),
      author: pick(publication.author, info.authors.join(", ")) ?? "",
      description: pick(publication.description, info.description) ?? "",
      category: pick(publication.category, info.categories[0]),
      language: overwrite ? info.language ?? publication.language : publication.language || info.language || "Português",
      publicationDate: pick(publication.publicationDate, dates.date),
      publicationYear: year,
      copyright: year ? { ...publication.copyright, year } : publication.copyright,
    };
    setPublication(next);
    onUpdate({ publication: next, ...(overwrite ? { title: info.title, ...(info.subtitle ? { subtitle: info.subtitle } : {}) } : {}) });
  };
  useEffect(() => { if(book.publication) setPublication(book.publication); }, [book.publication]);
  const MATTER_SLOTS = { frontMatter: [["dedication", "Dedicatória"], ["epigraph", "Epígrafe"], ["preface", "Prefácio"], ["presentation", "Apresentação"], ["acknowledgements", "Agradecimentos"]], backMatter: [["afterword", "Posfácio"], ["about-author", "Sobre o autor"], ["glossary", "Glossário"]] } as const;
  /** Seções padrão (desativadas até o autor preencher) + as que ele já tem, para os campos sempre aparecerem. */
  const matterList = (area: "frontMatter" | "backMatter") => { const current = publication[area] ?? []; const slots = MATTER_SLOTS[area].map(([id, title]) => current.find(section => section.id === id) ?? { id, title, content: "", enabled: false }); return [...slots, ...current.filter(section => !slots.some(slot => slot.id === section.id))]; };
  const updateSection = (area: "frontMatter" | "backMatter", id: string, patch: Partial<{ title: string; content: string; enabled: boolean }>) => { const list = matterList(area); update({ [area]: list.map(section => section.id === id ? { ...section, ...patch } : section).filter(section => (publication[area] ?? []).some(existing => existing.id === section.id) || section.id === id) }); };
  const addSection = (area: "frontMatter" | "backMatter") => update({ [area]: [...(publication[area] ?? []), { id: stableId("section"), title: "Nova seção", content: "", enabled: true }] });
  const removeSection = (area: "frontMatter" | "backMatter", id: string) => update({ [area]: (publication[area] ?? []).filter(section => section.id !== id) });
  const exportBook = { bookId: book.id, copyright: publication.copyright, publicationYear: publication.publicationYear, title: book.title, subtitle: book.subtitle, author: publication.author, language: publication.language, description: publication.description, category: publication.category, isbn: publication.isbn, publicationDate: publication.publicationDate, layout, typography: publication.typography ?? "reedsy", trimSize: publication.trimSize ?? "a4", customTrim: publication.customTrim, marginPreset: publication.marginPreset ?? "normal", dropCap: publication.dropCap ?? false, headerText: publication.headerText, footerText: publication.footerText, runningHeader: publication.runningHeader, bleedMm: publication.bleedMm, gutterMm: publication.gutterMm, coverImageUrl: publication.coverImageUrl, includeToc: publication.includeToc !== false, frontMatter: publicationSections({...publication,bookId:book.id}), backMatter: publication.backMatter, chapters: chaptersFromNodes(book.nodes) };
  /** Livro de exportação no idioma escolhido: traduz com o glossário do livro (nomes e termos protegidos) ou devolve o original. */
  const localized = async (): Promise<ExportBook> => {
    if (exportLang === "original") return exportBook;
    const terms = loadGlossary(book.id, glossaryFromPlanning(book.planning));
    const label = languageByCode(exportLang)?.label ?? exportLang;
    let note = "";
    const refiner = exportAi ? createCowilaRefiner(askCowila, { targetLabel: label, terms, bookTitle: book.title, onStats: stats => { note = ` · Cowila: ${stats.refined} refinado(s)${stats.stopped ? ", interrompido (limite ou falha)" : ""}`; } }) : null;
    return translateExportBook(exportBook, exportLang, { terms, refine: refiner?.refine, onProgress: (done, total) => setExportStatus(`Traduzindo ${done} de ${total}…${note}`) });
  };
  const bookWords = useMemo(() => book.nodes.filter(node => node.kind === "chapter" || node.kind === "scene").reduce((sum, node) => sum + (node.content.trim() ? node.content.trim().split(/\s+/).length : 0), 0), [book.nodes]);
  const validationIssues = useMemo(() => validateBook({ title: book.title, author: publication.author, language: publication.language, nodes: book.nodes, semanticBook: book.semanticBook }), [book, publication]);
  const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };
  const exportEpub = async () => { if (!(await guardFresh("export"))) return; if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando EPUB…"); const eb = await localized(); download(await buildEpub(await prepareExportAssets({...eb,isbn:publication.copyright?.isbns?.epub||publication.isbn})), `${eb.title}.epub`); setExportStatus("EPUB pronto"); } catch(error) { setExportStatus(error instanceof Error ? error.message : "Não foi possível gerar o EPUB"); } finally { setExportBusy(false); } };
  const exportDocx = async () => { if (!(await guardFresh("export"))) return; if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando DOCX…"); const eb = await localized(); download(await buildDocx(await prepareExportAssets(eb)), `${eb.title}.docx`); setExportStatus("DOCX pronto"); } catch(error) { setExportStatus(error instanceof Error ? error.message : "Não foi possível gerar o DOCX"); } finally { setExportBusy(false); } };
  const exportPdf = async () => { if (!(await guardFresh("export"))) return; if (exportBusy) return; setExportBusy(true); try { if (exportLang !== "original" && !pdfSupportsLanguage(exportLang)) { setExportStatus("O PDF não suporta este alfabeto. Exporte em DOCX, EPUB ou HTML."); return; } setExportStatus("Gerando PDF…"); const eb = await localized(); download(buildPdf(await prepareExportAssets({...eb,isbn:publication.copyright?.isbns?.pdf||publication.isbn})), `${eb.title}.pdf`); setExportStatus("PDF pronto"); } catch(error) { setExportStatus(error instanceof Error ? error.message : "Não foi possível gerar o PDF"); } finally { setExportBusy(false); } };
  const exportHtml = async () => { if (!(await guardFresh("export"))) return; if (exportBusy) return; setExportBusy(true); try { setExportStatus("Gerando HTML…"); const eb = await localized(); const blob = new Blob([buildPrintHtml(await prepareExportAssets(eb))], { type: "text/html" }); download(blob, `${eb.title}.html`); setExportStatus("HTML pronto"); } catch { setExportStatus("Não foi possível gerar o HTML"); } finally { setExportBusy(false); } };
  const exportPrint = async () => { if (!guard("export")) return; if (exportBusy) return; setExportBusy(true); try { setExportStatus("Abrindo impressão…"); const printWindow = window.open("", "_blank"); if (!printWindow) { setExportStatus("Permita pop-ups para abrir a impressão"); return; } printWindow.document.write(buildPrintHtml(await localized())); printWindow.document.close(); printWindow.focus(); printWindow.print(); setExportStatus("Pré-visualização de impressão aberta"); } catch { setExportStatus("Não foi possível abrir a impressão"); } finally { setExportBusy(false); } };
  return <div className="animate-in fade-in-0 duration-300"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Preparação editorial</p><h1 className="mt-2 font-serif text-4xl">Leve o projeto até a capa.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Preencha os metadados que acompanham o livro e revise a estrutura antes de pensar em exportação. Esta etapa não altera capítulos.</p><div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/60 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">Traduzir capítulos ou o livro completo</p><p className="text-xs text-muted-foreground">Cria uma cópia traduzida como novo livro; o original continua intacto.</p></div><Button variant="outline" onClick={() => setTranslateOpen(true)} disabled={!onTranslated || book.nodes.length === 0}>🌐 Traduzir livro</Button></div>{translateOpen && onTranslated && <TranslateBookDialog ask={askCowila} glossary={loadGlossary(book.id, glossaryFromPlanning(book.planning))} book={{ id: book.id, title: book.title, subtitle: book.subtitle, description: book.publication?.description, nodes: book.nodes.map(node => ({ id: node.id, title: node.title, kind: node.kind, content: node.content, richContent: node.richContent })) }} onClose={() => setTranslateOpen(false)} onDone={result => { setTranslateOpen(false); onTranslated(result); }} />}<PublishStepper steps={[{ id: "write", label: "Escrever", done: bookWords > 0, go: () => onNavigate?.("editor") }, { id: "structure", label: "Capítulos", done: book.nodes.some(node => node.kind === "chapter"), go: () => onNavigate?.("editor") }, { id: "meta", label: "Capa e dados", done: Boolean(publication.author), go: () => document.getElementById("prep-meta")?.scrollIntoView({ behavior: "smooth", block: "start" }) }, { id: "theme", label: "Tema", done: Boolean(publication.typography), go: () => document.getElementById("prep-theme")?.scrollIntoView({ behavior: "smooth", block: "start" }) }, { id: "preview", label: "Pré-visualizar", done: false, go: () => document.getElementById("prep-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }) }, { id: "export", label: "Exportar", done: false, go: () => document.getElementById("prep-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }) }]} /><section className="mt-6 rounded-2xl border border-border/70 bg-card p-5" aria-label="Modelos de livro"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Modelo de livro</p><p className="mt-2 text-sm text-muted-foreground">{pageReport(bookWords)}</p><div className="mt-3 flex flex-wrap gap-2">{BOOK_MODELS.map(model => <button key={model.id} type="button" title={model.hint} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted" onClick={() => update(model.patch)}>{model.label}</button>)}</div><p className="mt-2 text-[11px] text-muted-foreground">Os modelos só preenchem formato, margens, tipografia e capitular abaixo; você pode ajustar cada campo depois.</p></section>{publication.typography === "classic" && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs"><span className="min-w-0 flex-1">Este livro usa o tema Clássico. A prévia e as exportações só ganham o estilo Reedsy (serifa justificada, espaçamento confortável) com esse tema.</span><Button size="sm" onClick={() => update({ typography: "reedsy" })}>Aplicar Reedsy</Button></div>}<ThemeGallery value={publication.typography ?? "reedsy"} onChange={typography => update({ typography })} /><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section id="prep-meta" className="rounded-2xl border border-border/70 bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Metadados</p><label className="mt-5 block text-xs font-medium text-muted-foreground">Autor<Input className="mt-2" value={publication.author} onChange={event => update({ author: event.target.value })} placeholder="Nome que aparecerá na publicação" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Gênero<Input className="mt-2" value={publication.genre} onChange={event => update({ genre: event.target.value })} placeholder="Romance, ensaio, fantasia…" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Idioma<Input className="mt-2" value={publication.language} onChange={event => update({ language: event.target.value })} /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><IsbnLookup value={publication.isbn ?? ""} onChange={isbn => update({ isbn })} onApply={applyIsbn} /><label className="text-xs font-medium text-muted-foreground">Data de publicação<Input className="mt-2" type="date" value={publication.publicationDate ?? ""} onChange={event => update({ publicationDate: event.target.value })} /></label></div><label className="mt-4 block text-xs font-medium text-muted-foreground">Ano de publicação<Input className="mt-2" type="number" min="1000" max="9999" value={publication.copyright?.year ?? publication.publicationYear ?? publication.publicationDate?.slice(0,4) ?? ""} onChange={event => update({publicationYear:event.target.value,copyright:{...publication.copyright,year:event.target.value}})} placeholder="2026" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Categoria / gênero<Input className="mt-2" value={publication.category ?? publication.genre} onChange={event => update({ category: event.target.value, genre: event.target.value })} placeholder="Romance, fantasia, ensaio…" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Descrição<textarea className="mt-2 min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={publication.description} onChange={event => update({ description: event.target.value })} placeholder="A apresentação editorial do livro" /></label><label className="mt-4 block text-xs font-medium text-muted-foreground">Imagem da capa<Input className="mt-2" value={(publication.coverImageUrl ?? "").startsWith("data:") ? "Imagem enviada do seu computador" : publication.coverImageUrl ?? ""} readOnly={(publication.coverImageUrl ?? "").startsWith("data:")} onChange={event => update({ coverImageUrl: event.target.value })} placeholder="https://…/capa.jpg" /></label>{(publication.coverImageUrl ?? "").startsWith("data:") && <button type="button" className="mt-1 text-xs text-destructive underline" onClick={() => update({ coverImageUrl: "" })}>Remover capa enviada</button>}<p className="mt-1 text-[11px] text-muted-foreground">Use uma URL HTTPS ou envie um arquivo JPG, PNG ou WebP; a imagem é reduzida e salva junto ao livro.</p><label className="mt-3 block text-xs font-medium text-muted-foreground">Enviar arquivo de capa<input className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" type="file" accept="image/jpeg,image/png,image/webp" disabled={coverUpload.isPending} onChange={event => { const file = event.target.files?.[0]; if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return; const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); const base64 = value.split(",")[1]; if (base64) coverUpload.mutate({ filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120), contentType: file.type as "image/jpeg" | "image/png" | "image/webp", base64 }); }; reader.readAsDataURL(file); }} /></label>{coverUpload.isPending && <p className="mt-1 text-[11px] text-muted-foreground">Enviando capa…</p>}{coverUpload.error && <p className="mt-1 text-[11px] text-destructive">{coverUpload.error.message}</p>}<label className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground"><input type="checkbox" checked={publication.includeToc !== false} onChange={event => update({ includeToc: event.target.checked })} />Incluir sumário editorial nas exportações</label><div className="mt-7 border-t border-border/60 pt-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Book Builder</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Monte as páginas que ficam antes e depois do corpo do livro. Seções desativadas não entram nos arquivos exportados.</p>{([['frontMatter', 'Front Matter'], ['backMatter', 'Back Matter']] as const).map(([area, label]) => <div key={area} className="mt-5"><h3 className="font-serif text-xl">{label}</h3><div className="mt-3 space-y-3">{matterList(area).map(section => <div key={section.id} className="rounded-xl border border-border/70 bg-background/60 p-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={section.enabled !== false} onChange={event => updateSection(area, section.id, { enabled: event.target.checked })} />Incluir {section.title.toLowerCase()}</label><Input className="mt-2" value={section.title} onChange={event => updateSection(area, section.id, { title: event.target.value })} aria-label={`Título ${section.title}`} /><Textarea className="mt-2 min-h-20" value={section.content} onChange={event => updateSection(area, section.id, { content: event.target.value, ...(section.enabled === false && !section.content.trim() && event.target.value.trim() ? { enabled: true } : {}) })} placeholder={`Conteúdo de ${section.title.toLowerCase()}`} aria-label={`Conteúdo ${section.title}`} />{!MATTER_SLOTS[area].some(([id]) => id === section.id) && <button type="button" className="mt-2 text-xs text-destructive underline" onClick={() => removeSection(area, section.id)}>Remover esta seção</button>}</div>)}</div><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => addSection(area)}>+ Adicionar seção em {label}</Button></div>)}</div><Button className="mt-5" onClick={saveMetadata}><Save className="mr-2 h-4 w-4" />Salvar metadados</Button>{metaSave && <p role="status" className={`mt-2 text-xs ${metaSave.ok ? "text-primary" : "text-destructive"}`}>{metaSave.text}</p>}<p className="mt-1 text-[11px] text-muted-foreground">Os campos também são guardados automaticamente a cada alteração.</p></section><aside id="prep-preview" className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Pré-visualização</p><h2 className="mt-5 font-serif text-3xl">{book.title}</h2>{book.subtitle && <p className="mt-1 text-sm text-muted-foreground">{book.subtitle}</p>}<div className="mt-6 space-y-3 border-t border-primary/15 pt-4 text-sm"><p><span className="text-muted-foreground">Autor</span><br />{publication.author || "A definir"}</p><p><span className="text-muted-foreground">Gênero</span><br />{publication.genre || "A definir"}</p><p><span className="text-muted-foreground">Idioma</span><br />{publication.language || "A definir"}</p><p><span className="text-muted-foreground">ISBN</span><br />{publication.isbn || "A definir"}</p><p><span className="text-muted-foreground">Publicação</span><br />{publication.publicationDate || "A definir"}</p><p><span className="text-muted-foreground">ID do livro</span><br /><code className="break-all text-[10px]">{book.id}</code></p></div><div className="mt-6 rounded-lg bg-background/70 p-3 text-xs leading-5 text-muted-foreground">{publication.description || "A descrição aparecerá aqui quando você preencher os metadados."}</div>{publication.coverImageUrl && <img src={publication.coverImageUrl} alt={`Capa de ${book.title}`} className="mt-4 max-h-64 w-full rounded-lg object-contain" onError={event => { event.currentTarget.style.display = "none"; }} />}<div className="mt-6"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Prévia diagramada</p><div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Dispositivo da prévia">{([['book', 'Livro'], ['tablet', 'Tablet'], ['phone', 'Telefone'], ['print', 'Impressão']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setPreviewDevice(value)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium transition ${previewDevice === value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div><div className={`mt-3 flex justify-center rounded-lg bg-muted/30 p-3 ${previewDevice === "print" ? "overflow-auto" : "overflow-hidden"}`}><iframe title={`Prévia do layout editorial — ${previewDevice}`} srcDoc={buildPrintHtml(exportBook)} className={`h-[560px] border border-border bg-white shadow-sm ${previewDevice === "phone" ? "w-[220px]" : previewDevice === "tablet" ? "w-[360px]" : previewDevice === "print" ? "min-w-[640px] w-full" : "w-full"}`} /></div></div><div className="mt-6 border-t border-primary/15 pt-4"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Validação editorial</p>{validationIssues.length === 0 ? <p className="mt-2 text-xs text-primary">Pronto para revisão de exportação.</p> : <div className="mt-2 space-y-1">{validationIssues.map(issue => <p key={`${issue.code}-${issue.path}`} className={`text-xs ${issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}`}>{issue.severity === "error" ? "Erro" : "Aviso"}: {issue.message}</p>)}</div>}<div className="mt-6"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Layout e exportação</p><select className="mt-3 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={layout} onChange={event => setLayout(event.target.value as typeof layout)}><option value="classic">Layout clássico</option><option value="compact">Layout compacto</option></select><label className="mt-3 block text-xs font-medium text-muted-foreground">Preset tipográfico<select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={publication.typography ?? "reedsy"} onChange={event => update({ typography: event.target.value as TypographyPreset })}>{Object.entries(TYPOGRAPHY_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Formato<select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={publication.trimSize ?? "a4"} onChange={event => update({ trimSize: event.target.value as PublicationData["trimSize"] })}>{TRIM_SIZES.map(size => <option key={size.id} value={size.id}>{size.label}</option>)}</select>{publication.trimSize === "custom" && <span className="mt-2 flex items-center gap-1 text-xs"><input aria-label="Largura da página em milímetros" type="number" min={CUSTOM_TRIM_LIMITS.minWidthMm} max={CUSTOM_TRIM_LIMITS.maxWidthMm} step={0.5} className="h-9 w-20 rounded-md border border-border bg-background px-2" value={publication.customTrim?.widthMm ?? 140} onChange={event => update({ customTrim: { widthMm: Number(event.target.value), heightMm: publication.customTrim?.heightMm ?? 210 } })} />×<input aria-label="Altura da página em milímetros" type="number" min={CUSTOM_TRIM_LIMITS.minHeightMm} max={CUSTOM_TRIM_LIMITS.maxHeightMm} step={0.5} className="h-9 w-20 rounded-md border border-border bg-background px-2" value={publication.customTrim?.heightMm ?? 210} onChange={event => update({ customTrim: { widthMm: publication.customTrim?.widthMm ?? 140, heightMm: Number(event.target.value) } })} />mm</span>}</label><label className="text-xs font-medium text-muted-foreground">Margens<select className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs" value={publication.marginPreset ?? "normal"} onChange={event => update({ marginPreset: event.target.value as PublicationData["marginPreset"] })}><option value="narrow">Estreitas</option><option value="normal">Normais</option><option value="wide">Amplas</option></select></label></div><label className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><input type="checkbox" checked={publication.dropCap ?? false} onChange={event => update({ dropCap: event.target.checked })} />Usar capitular no primeiro parágrafo</label><Input className="mt-3" value={publication.headerText ?? ""} onChange={event => update({ headerText: event.target.value })} placeholder="Cabeçalho (opcional)" aria-label="Cabeçalho editorial" /><Input className="mt-3" value={publication.footerText ?? ""} onChange={event => update({ footerText: event.target.value })} placeholder="Rodapé (opcional)" aria-label="Rodapé editorial" /><LayoutPrintControls publication={publication as Record<string, unknown>} update={patch => update(patch as Partial<PublicationData>)} /><p className="mt-3 text-[11px] leading-5 text-muted-foreground">PDF com páginas numeradas. DOCX com sumário atualizável no Word. EPUB adapta as páginas ao leitor.</p><label className="mt-3 block text-[11px] font-medium text-muted-foreground" htmlFor="export-language">Idioma da exportação<select id="export-language" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={exportLang} disabled={exportBusy} onChange={event => setExportLang(event.target.value)}><option value="original">Original ({publication.language || "Português"})</option>{TRANSLATE_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.flag} {item.label} (tradução automática)</option>)}</select></label>{exportLang !== "original" && <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={exportAi} disabled={exportBusy} onChange={event => setExportAi(event.target.checked)} /><span>Refinar com o Cowila (IA) para evitar erros<span className="block text-[11px] text-muted-foreground">Gasta ≈ {estimateRefineCalls([exportBook.title, ...exportBook.chapters.map(chapter => chapter.content || "")])} uso(s) do Cowila do seu plano e deixa a exportação mais lenta. Se o limite acabar, o restante sai só com o Google.</span></span></label>}{exportLang !== "original" && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Traduz na hora de exportar, mantendo os termos protegidos (nomes e lugares) e usando “Capítulo” e “Sumário” no idioma escolhido. O texto é enviado ao Google Tradutor; revise o arquivo antes de publicar. PDF não está disponível para alfabetos não latinos ocidentais.</p>}<div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={exportEpub} disabled={exportBusy}>EPUB</Button><Button variant="outline" size="sm" onClick={exportDocx} disabled={exportBusy}>DOCX</Button><Button variant="outline" size="sm" onClick={exportPdf} disabled={exportBusy}>PDF</Button><Button variant="outline" size="sm" onClick={exportPrint} disabled={exportBusy}>Imprimir</Button><Button variant="outline" size="sm" onClick={exportHtml} disabled={exportBusy}>HTML</Button></div>{exportStatus && <p className="mt-3 text-[11px] text-primary">{exportStatus}</p>}</div></div><p className="mt-5 text-[11px] leading-4 text-muted-foreground">O conteúdo permanece separado do layout; exportar cria uma cópia e não altera o projeto.</p></aside></div></div>;
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
