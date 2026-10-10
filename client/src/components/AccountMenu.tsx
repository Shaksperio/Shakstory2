import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Keyboard,
  MoreHorizontal,
  Scissors,
  Search,
  Settings,
  SpellCheck,
  Target,
  Trash2,
  X,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export type AccountBook = {
  id: string;
  title: string;
  status?: string;
  targetWordCount: number;
  updatedAt: number;
  lastOpenedAt?: number;
  archived?: boolean;
  nodes: Array<{ kind: string; content: string }>;
  publication?: { coverImageUrl?: string; author?: string };
};

export type Profile = { name: string; photo: string };
export type ExportFormat = "pdf" | "epub" | "docx" | "txt" | "html";
export type EditorAction = "find" | "spell" | "split" | "delete" | "review";

const PROFILE_KEY = "shakstory:profile";
const PREFS_KEY = "shakstory:writing-preferences";
const countWords = (value: string) => (value.trim() ? value.trim().split(/\s+/).length : 0);
const wordsOf = (book: AccountBook) => book.nodes.reduce((sum, node) => sum + countWords(node.content), 0);
const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

const readProfile = (): Profile => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}");
    return { name: typeof parsed.name === "string" ? parsed.name : "", photo: typeof parsed.photo === "string" ? parsed.photo : "" };
  } catch {
    return { name: "", photo: "" };
  }
};

/** Perfil guardado neste dispositivo; o e-mail vem do login da Cloudflare quando existir. */
export function useProfile() {
  const [profile, setProfileState] = useState<Profile>(readProfile);
  const [email, setEmail] = useState("");
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (typeof fetch !== "function") return;
    fetch("/cdn-cgi/access/get-identity", { credentials: "same-origin" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!cancelled && data && typeof data.email === "string") setEmail(data.email);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const setProfile = (patch: Partial<Profile>) => {
    setProfileState(current => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        /* armazenamento indisponível: o perfil vale só nesta sessão */
      }
      return next;
    });
  };
  const displayName = profile.name.trim() || (email ? email.split("@")[0] : "Autor");
  return { profile, setProfile, email, online, displayName };
}

export function Avatar({ name, photo, size = 36 }: { name: string; photo?: string; size?: number }) {
  return (
    <span className="sk-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : <span>{(name.trim().charAt(0) || "A").toUpperCase()}</span>}
    </span>
  );
}

export function AvatarCard({ name, email, photo, online, onOpen }: { name: string; email: string; photo: string; online: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="sk-avatar-card" onClick={onOpen} aria-label={`Minha conta, ${name}, ${online ? "online" : "offline"}`} title="Minha conta">
      <span className={`sk-avatar-ring ${online ? "is-online" : "is-offline"}`}>
        <Avatar name={name} photo={photo} size={34} />
        <i className="sk-status-dot" aria-hidden="true" />
      </span>
      <span className="sk-avatar-text">
        <strong>{name}</strong>
        <small>{online ? "Online" : "Offline"}{email ? ` · ${email}` : ""}</small>
      </span>
    </button>
  );
}

type PrefState = { fontSize?: number; lineHeight?: number; lang?: string };
const readPrefs = (): PrefState => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
};

export function EditorMenu({
  hasBook,
  canDelete,
  theme,
  onToggleTheme,
  onEditorAction,
  onProject,
  onExport,
}: {
  hasBook: boolean;
  canDelete: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onEditorAction: (action: EditorAction) => void;
  onProject: () => void;
  onExport: (format: ExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<"menu" | "export" | "settings">("menu");
  const [prefs, setPrefs] = useState<PrefState>(readPrefs);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    setScreen("menu");
  };
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    document.documentElement.lang = prefs.lang || "pt-BR";
  }, [prefs.lang]);
  const updatePrefs = (patch: PrefState) => {
    const next = { ...readPrefs(), ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* preferências valem só nesta sessão */
    }
    window.dispatchEvent(new Event("writing-preferences"));
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };
  const item = (label: string, Icon: typeof Target, onClick: () => void, disabled = false) => (
    <button key={label} type="button" className="sk-sheet-item" disabled={disabled} onClick={onClick}>
      <span className="sk-sheet-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span>{label}</span>
      {(label === "Exportar livro" || label === "Configurações") && <ChevronRight className="ml-auto h-4 w-4 opacity-50" aria-hidden="true" />}
    </button>
  );
  return (
    <>
      <button type="button" className="sk-more-btn" aria-label="Abrir menu do editor" title="Menu do editor" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div className="sk-sheet-scrim" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label="Menu do editor" className="sk-sheet" onClick={event => event.stopPropagation()}>
            <div className="sk-sheet-head">
              {screen !== "menu" && (
                <button type="button" className="sk-sheet-back" onClick={() => setScreen("menu")} aria-label="Voltar ao menu">‹</button>
              )}
              <h2>{screen === "settings" ? "Configurações" : screen === "export" ? "Exportar livro" : "Menu"}</h2>
              <button ref={closeRef} type="button" className="sk-sheet-close" aria-label="Fechar menu do editor" onClick={close}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="sk-sheet-body">
              {screen === "menu" && (
                <>
                  {item("Metas e estatísticas", Target, run(onProject), !hasBook)}
                  {item("Revisão e controle de alterações", ClipboardCheck, run(() => onEditorAction("review")), !hasBook)}
                  {item("Localizar e substituir", Search, run(() => onEditorAction("find")), !hasBook)}
                  {item("Revisão ortográfica", SpellCheck, run(() => onEditorAction("spell")), !hasBook)}
                  {item("Dividir capítulo", Scissors, run(() => onEditorAction("split")), !hasBook)}
                  {item("Excluir capítulo", Trash2, run(() => onEditorAction("delete")), !hasBook || !canDelete)}
                  {item("Exportar livro", Download, () => setScreen("export"), !hasBook)}
                  {item("Configurações", Settings, () => setScreen("settings"))}
                </>
              )}
              {screen === "export" && (
                <>
                  {([["pdf", "PDF para impressão"], ["epub", "EPUB (e-book)"], ["docx", "DOCX (Word)"], ["html", "HTML / ebook"], ["txt", "Texto simples (TXT)"]] as Array<[ExportFormat, string]>).map(([format, label]) => (
                    <button key={format} type="button" className="sk-sheet-item" onClick={run(() => onExport(format))}>
                      <span className="sk-sheet-icon"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                      <span>{label}</span>
                    </button>
                  ))}
                </>
              )}
              {screen === "settings" && (
                <div className="sk-settings">
                  <p className="sk-settings-note">Estas configurações afetam a interface do editor, não o livro exportado.</p>
                  <div className="sk-field">
                    <span>Aparência</span>
                    <div className="sk-segment" role="group" aria-label="Aparência">
                      <button type="button" aria-pressed={theme === "light"} className={theme === "light" ? "is-on" : ""} onClick={() => theme !== "light" && onToggleTheme()}>Claro</button>
                      <button type="button" aria-pressed={theme === "dark"} className={theme === "dark" ? "is-on" : ""} onClick={() => theme !== "dark" && onToggleTheme()}>Escuro</button>
                    </div>
                  </div>
                  <label className="sk-field">
                    <span>Tamanho da fonte <em>{prefs.fontSize ?? 18}px</em></span>
                    <input type="range" min="14" max="28" value={prefs.fontSize ?? 18} onChange={event => updatePrefs({ fontSize: Number(event.target.value) })} />
                  </label>
                  <label className="sk-field">
                    <span>Altura da linha <em>{(prefs.lineHeight ?? 1.7).toFixed(1)}</em></span>
                    <input type="range" min="1.2" max="2.4" step="0.1" value={prefs.lineHeight ?? 1.7} onChange={event => updatePrefs({ lineHeight: Number(event.target.value) })} />
                  </label>
                  <label className="sk-field">
                    <span>Idioma da correção ortográfica</span>
                    <select value={prefs.lang || "pt-BR"} onChange={event => updatePrefs({ lang: event.target.value })}>
                      <option value="pt-BR">Português (Brasil)</option>
                      <option value="pt-PT">Português (Portugal)</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </label>
                  <div className="sk-field">
                    <span><Keyboard className="mr-1 inline h-4 w-4" aria-hidden="true" />Atalhos</span>
                    <ul className="sk-hotkeys">
                      <li>Salvar <kbd>Ctrl</kbd><kbd>S</kbd></li>
                      <li>Localizar <kbd>Ctrl</kbd><kbd>K</kbd></li>
                      <li>Modo sem distração <kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>F</kbd></li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <div className="sk-sheet-foot">Shakstory · estúdio do autor</div>
          </div>
        </div>
      )}
    </>
  );
}

const resizePhoto = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      image.onload = () => {
        const side = 256;
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Imagem indisponível neste navegador."));
        const crop = Math.min(image.width, image.height);
        context.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, 0, 0, side, side);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export function AccountView({
  books,
  profile,
  email,
  online,
  displayName,
  syncLabel,
  statusLabel,
  onProfile,
  onOpen,
}: {
  books: AccountBook[];
  profile: Profile;
  email: string;
  online: boolean;
  displayName: string;
  syncLabel: string;
  statusLabel: (status?: string) => string;
  onProfile: (patch: Partial<Profile>) => void;
  onOpen: (book: AccountBook) => void;
}) {
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const active = books.filter(book => !book.archived);
  const totalWords = active.reduce((sum, book) => sum + wordsOf(book), 0);
  const completed = active.filter(book => book.status === "completed").length;
  const sorted = [...active].sort((left, right) => (right.lastOpenedAt ?? right.updatedAt) - (left.lastOpenedAt ?? left.updatedAt));
  return (
    <div className="account-view animate-in fade-in-0 duration-300">
      <section className="account-card">
        <div className="account-photo">
          <Avatar name={displayName} photo={profile.photo} size={96} />
          <button type="button" className="account-photo-btn" aria-label="Alterar foto" onClick={() => fileInput.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            ref={fileInput}
            className="hidden"
            type="file"
            accept="image/*"
            aria-label="Foto de perfil"
            onChange={async event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 8 * 1024 * 1024) return setError("Escolha uma imagem de até 8 MB.");
              try {
                setError("");
                onProfile({ photo: await resizePhoto(file) });
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Falha ao carregar a foto.");
              }
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Minha conta</p>
          <label className="mt-2 block text-xs font-medium text-muted-foreground">
            Nome de autor
            <Input className="mt-1.5 max-w-sm" value={profile.name} placeholder={displayName} onChange={event => onProfile({ name: event.target.value })} />
          </label>
          <p className="mt-3 text-sm text-muted-foreground">{email || "E-mail disponível após entrar com o código de acesso."}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs">
            <span className={`sk-presence ${online ? "is-online" : "is-offline"}`} aria-hidden="true" />
            {online ? "Online" : "Offline"} · {syncLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {profile.photo && <Button size="sm" variant="ghost" onClick={() => onProfile({ photo: "" })}>Remover foto</Button>}
            <span className="text-[11px] text-muted-foreground">Nome e foto ficam salvos neste dispositivo.</span>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card p-4"><p className="text-xs text-muted-foreground">Livros</p><p className="mt-1 font-serif text-2xl">{active.length}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-4"><p className="text-xs text-muted-foreground">Palavras escritas</p><p className="mt-1 font-serif text-2xl">{formatNumber(totalWords)}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-4"><p className="text-xs text-muted-foreground">Concluídos</p><p className="mt-1 font-serif text-2xl">{completed}</p></div>
      </div>
      <h2 className="mt-9 font-serif text-2xl">Meus livros e andamento</h2>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum livro ainda. Crie o primeiro na Biblioteca.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {sorted.map(book => {
            const words = wordsOf(book);
            const progress = Math.min(100, Math.round((words / Math.max(1, book.targetWordCount)) * 100));
            const chapters = book.nodes.filter(node => node.kind === "chapter").length;
            return (
              <li key={book.id} className="account-book">
                <div className="account-book-cover" aria-hidden="true">
                  {book.publication?.coverImageUrl ? <img src={book.publication.coverImageUrl} alt="" /> : <span className="font-serif italic">{book.title.charAt(0).toUpperCase()}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="truncate font-serif text-lg">{book.title}</h3>
                    <span className="text-xs text-primary">{statusLabel(book.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(words)} de {formatNumber(book.targetWordCount)} palavras · {chapters} {chapters === 1 ? "capítulo" : "capítulos"}
                  </p>
                  <Progress value={progress} className="mt-2 h-1.5" />
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{progress}% da meta</span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden="true" />{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(book.lastOpenedAt ?? book.updatedAt)}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" aria-label={`Abrir ${book.title} na conta`} onClick={() => onOpen(book)}>Abrir</Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
